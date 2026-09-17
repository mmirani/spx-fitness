/**
 * Motion layer for the dashboard.
 *
 * app.js already writes a live --speed-ratio (0..1) custom property onto
 * <html> every telemetry tick, off the real treadmill speed — this module
 * just reads that value each animation frame and drives two things:
 *
 *  1. A canvas "speed flow" behind the Walking Control card: short streaks
 *     drifting left-to-right, whose speed/length/density scale with
 *     --speed-ratio. This is the primary answer to "nothing visibly moves
 *     when speed changes" — it's continuous, not just an on-click flash.
 *  2. A pulse ring behind the speed number (GSAP-driven) whose tempo rises
 *     with speed, like a rising cadence/heartbeat.
 *
 * GSAP also drives small bounce feedback on the speed numbers and control
 * buttons. Kept in its own file so app.js stays about state/telemetry, not
 * animation — it only needs to know the CSS variable already exists.
 */
(function () {
  const hasGsap = typeof window.gsap !== 'undefined';

  function currentSpeedRatio() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--speed-ratio');
    const val = parseFloat(raw);
    return Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : 0;
  }

  // ---------- Speed Flow canvas ----------
  class SpeedFlow {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.seed();
      this.raf = requestAnimationFrame(this.tick.bind(this));
    }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.max(1, this.width * this.dpr);
      this.canvas.height = Math.max(1, this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    seed() {
      const count = 34;
      for (let i = 0; i < count; i++) {
        this.particles.push(this.spawn(Math.random() * this.width));
      }
    }

    spawn(x) {
      return {
        x: typeof x === 'number' ? x : -20,
        y: Math.random() * this.height,
        r: 0.8 + Math.random() * 1.4,
        speed: 0.5 + Math.random() * 0.7,
        cyan: Math.random() < 0.6,
        alpha: 0.12 + Math.random() * 0.3,
      };
    }

    tick() {
      const ratio = currentSpeedRatio();
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // Baseline drift even at rest (feels "alive"), scaling hard with speed.
      const velocity = 0.35 + ratio * 5.2;
      const streak = 5 + ratio * 30;

      this.particles.forEach(p => {
        p.x += p.speed * velocity;
        if (p.x - streak > this.width) {
          Object.assign(p, this.spawn(-streak));
        }
        const grad = ctx.createLinearGradient(p.x - streak, p.y, p.x, p.y);
        const hue = p.cyan ? '34,229,255' : '185,104,255';
        grad.addColorStop(0, `rgba(${hue},0)`);
        grad.addColorStop(1, `rgba(${hue},${p.alpha * (0.4 + ratio * 0.8)})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x - streak, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });

      this.raf = requestAnimationFrame(this.tick.bind(this));
    }
  }

  const flowCanvas = document.getElementById('speed-flow-canvas');
  if (flowCanvas && flowCanvas.getContext) {
    new SpeedFlow(flowCanvas);
  }

  // ---------- Pulse ring: tempo rises with speed ----------
  const pulseRing = document.getElementById('pulse-ring');
  if (pulseRing && hasGsap) {
    const pulse = gsap.fromTo(
      pulseRing,
      { scale: 0.75, opacity: 0.55 },
      { scale: 1.9, opacity: 0, duration: 1.2, ease: 'power1.out', repeat: -1 }
    );
    setInterval(() => {
      const ratio = currentSpeedRatio();
      pulse.timeScale(0.5 + ratio * 3);
    }, 300);
  }

  // ---------- Bounce feedback ----------
  if (hasGsap) {
    const bounceOnChange = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      let lastValue = el.textContent;
      new MutationObserver(() => {
        if (el.textContent === lastValue) return;
        lastValue = el.textContent;
        gsap.fromTo(el, { scale: 1.16 }, { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.5)' });
      }).observe(el, { characterData: true, childList: true, subtree: true });
    };

    ['hud-speed', 'target-speed-val'].forEach(bounceOnChange);

    document.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        gsap.fromTo(btn, { scale: 0.82 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
      });
    });

    ['btn-start', 'btn-pause', 'btn-stop'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        gsap.fromTo(el, { scale: 0.94 }, { scale: 1, duration: 0.35, ease: 'back.out(2)' });
      });
    });
  }
})();
