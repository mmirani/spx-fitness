/**
 * SPX Fitness - Treadmill State & Simulation Engine
 */

class TreadmillEngine {
  constructor() {
    this.unit = 'mph'; // 'mph' or 'kmh'
    this.userWeightKg = 70; // Default user weight for calorie estimation

    this.state = 'STOPPED'; // 'STOPPED', 'COUNTDOWN', 'RUNNING', 'PAUSED'
    this.currentSpeed = 0.0;

    // Safety bounds are defined in km/h (the pad's native unit) so they stay
    // correct regardless of the mph/kmh display toggle. Every session starts
    // at the slow/safe floor speed — the user must manually step it up with
    // the +/- buttons; there are no "jump to a fast speed" shortcuts.
    this.MIN_SPEED_KMH = 0.3;
    this.MAX_SPEED_KMH = 6.0;
    this.speedStep = 0.1; // step size in the *currently displayed* unit

    this.targetSpeed = this._kmhToDisplay(this.MIN_SPEED_KMH); // start-of-session default

    this.elapsedSeconds = 0;
    this.totalDistanceMiles = 0.0;
    this.totalCalories = 0.0;
    this.totalSteps = 0;

    this.timerInterval = null;
    this.audioCtx = null;

    this.listeners = [];
  }

  init() {
    // Load saved settings if any
    const savedWeight = localStorage.getItem('spx_user_weight');
    if (savedWeight) this.userWeightKg = parseFloat(savedWeight);

    const savedUnit = localStorage.getItem('spx_unit');
    if (savedUnit) this.unit = savedUnit;

    // Re-derive the displayed target speed now that the saved unit (if any)
    // is known, so the on-screen default always reflects the real 0.3 km/h
    // safety floor rather than a stale mph-assumed placeholder.
    this.targetSpeed = this._kmhToDisplay(this.MIN_SPEED_KMH);
  }

  subscribe(cb) {
    this.listeners.push(cb);
  }

  notify() {
    const data = this.getSnapshot();
    this.listeners.forEach(cb => cb(data));
  }

  getSnapshot() {
    return {
      state: this.state,
      currentSpeed: this.currentSpeed,
      targetSpeed: this.targetSpeed,
      unit: this.unit,
      elapsedSeconds: this.elapsedSeconds,
      formattedTime: this.formatTime(this.elapsedSeconds),
      distance: this.getFormattedDistance(),
      calories: Math.round(this.totalCalories),
      steps: this.totalSteps,
      pace: this.calculatePace()
    };
  }

  _kmhToDisplay(kmh) {
    const val = this.unit === 'mph' ? kmh / 1.60934 : kmh;
    return Math.round(val * 10) / 10;
  }

  _displayToKmh(val) {
    return this.unit === 'mph' ? val * 1.60934 : val;
  }

  setUnit(unit) {
    if (unit === 'mph' || unit === 'kmh') {
      // Re-express the current target speed (a real km/h value under the
      // hood) in the newly selected display unit so switching units never
      // silently changes the actual belt speed.
      const targetKmh = this._displayToKmh(this.targetSpeed);
      this.unit = unit;
      this.targetSpeed = this._kmhToDisplay(targetKmh);
      localStorage.setItem('spx_unit', unit);
      this.notify();
    }
  }

  setTargetSpeed(speed) {
    const minDisplay = this._kmhToDisplay(this.MIN_SPEED_KMH);
    const maxDisplay = this._kmhToDisplay(this.MAX_SPEED_KMH);
    let clamped = Math.max(minDisplay, Math.min(maxDisplay, speed));
    clamped = Math.round(clamped * 10) / 10;
    const prevSpeed = this.targetSpeed;
    this.targetSpeed = clamped;

    if (this.state === 'RUNNING') {
      if (clamped > prevSpeed && window.spxSfx) window.spxSfx.speedUp();
      else if (clamped < prevSpeed && window.spxSfx) window.spxSfx.speedDown();

      if (window.spxBleDriver && window.spxBleDriver.isConnected) {
        window.spxBleDriver.setTargetSpeed(this._displayToKmh(clamped)).then(ok => {
          if (!ok && window.spxSfx) window.spxSfx.error();
        });
      }
    }
    this.notify();
  }

  adjustSpeed(delta) {
    this.setTargetSpeed(this.targetSpeed + delta);
  }

  async startSession() {
    if (this.state === 'RUNNING') return;

    if (this.state === 'STOPPED') {
      // Audio countdown
      this.state = 'COUNTDOWN';
      this.notify();
      
      for (let i = 3; i > 0; i--) {
        this.playBeep(800, 0.15);
        await new Promise(r => setTimeout(r, 1000));
      }
      this.playBeep(1200, 0.4);

      this.elapsedSeconds = 0;
      this.totalDistanceMiles = 0;
      this.totalCalories = 0;
      this.totalSteps = 0;

      // Safety: every new session always starts at the slow floor speed,
      // regardless of whatever speed was left over from a prior session.
      // The user must step it up manually with +/-.
      this.targetSpeed = this._kmhToDisplay(this.MIN_SPEED_KMH);
    }

    let ok = true;
    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      ok = await window.spxBleDriver.start();
      if (ok) ok = await window.spxBleDriver.setTargetSpeed(this._displayToKmh(this.targetSpeed));
    }

    if (window.spxSfx) ok ? window.spxSfx.success() : window.spxSfx.error();

    this.state = 'RUNNING';
    this.startTimer();
    this.notify();
  }

  pauseSession() {
    if (this.state !== 'RUNNING') return;
    this.state = 'PAUSED';
    this.clearInterval();
    if (window.spxSfx) window.spxSfx.click();
    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      window.spxBleDriver.pause().then(ok => {
        if (!ok && window.spxSfx) window.spxSfx.error();
      });
    }
    this.notify();
  }

  stopSession() {
    if (this.state === 'STOPPED') return;
    this.state = 'STOPPED';
    this.clearInterval();
    this.currentSpeed = 0.0;
    if (window.spxSfx) window.spxSfx.stopped();

    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      window.spxBleDriver.stop().then(ok => {
        if (!ok && window.spxSfx) window.spxSfx.error();
      });
    }

    const summary = this.getSnapshot();
    this.notify();
    return summary;
  }

  startTimer() {
    this.clearInterval();
    this.timerInterval = setInterval(() => {
      if (this.state === 'RUNNING') {
        // Smooth speed acceleration toward target speed
        if (Math.abs(this.currentSpeed - this.targetSpeed) > 0.05) {
          if (this.currentSpeed < this.targetSpeed) {
            this.currentSpeed = Math.min(this.targetSpeed, this.currentSpeed + 0.1);
          } else {
            this.currentSpeed = Math.max(this.targetSpeed, this.currentSpeed - 0.1);
          }
        } else {
          this.currentSpeed = this.targetSpeed;
        }

        this.elapsedSeconds++;

        // Distance = speed * time
        const speedMph = this.unit === 'mph' ? this.currentSpeed : this.currentSpeed * 0.621371;
        const milesPerSec = speedMph / 3600.0;
        this.totalDistanceMiles += milesPerSec;

        // Step estimation (Average stride ~ 2,000 steps per mile at walking pace)
        this.totalSteps += Math.round(milesPerSec * 2100);

        // Calorie calculation using MET (Metabolic Equivalent of Task) formula
        // Walking 2 mph ~ 2.8 MET, 3 mph ~ 3.3 MET, 4 mph ~ 5.0 MET
        const met = 1.5 + (speedMph * 0.9);
        const caloriesPerSec = (met * 3.5 * this.userWeightKg) / (200 * 60);
        this.totalCalories += caloriesPerSec;

        this.notify();
      }
    }, 1000);
  }

  clearInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(totalSec) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getFormattedDistance() {
    if (this.unit === 'mph') {
      return this.totalDistanceMiles.toFixed(2);
    } else {
      return (this.totalDistanceMiles * 1.60934).toFixed(2);
    }
  }

  calculatePace() {
    if (this.currentSpeed <= 0) return "--'--\"";
    const minutesPerUnit = 60 / this.currentSpeed;
    const mins = Math.floor(minutesPerUnit);
    const secs = Math.round((minutesPerUnit - mins) * 60);
    return `${mins}'${String(secs).padStart(2, '0')}"`;
  }

  playBeep(freq = 800, duration = 0.1) {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      }
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio fail silent
    }
  }
}

window.spxTreadmill = new TreadmillEngine();
window.spxTreadmill.init();
