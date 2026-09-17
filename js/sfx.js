/**
 * Mirani Walking Pad - Shared Sound Effects
 *
 * WebAudio-based feedback tones used across the app (BLE connect events,
 * start/pause/stop, and speed changes) so the user always gets an audible,
 * workout-appropriate cue for success/failure/direction without relying
 * only on the on-screen toast, which is easy to miss while walking.
 *
 * Everything routes through one master bus (gain -> compressor -> output)
 * instead of straight to the destination, so overlapping tones glue
 * together and get limited instead of clipping — that headroom is what
 * lets individual layers run louder without turning harsh. Each cue is
 * built from three layers rather than one bare oscillator: a short
 * filtered noise "snap" for the attack transient, a sub-bass thump for
 * perceived weight/punch, and the melodic tone(s) on top, spread slightly
 * in the stereo field for a fuller, more "produced" feel.
 */

class SPXSoundEffects {
  constructor() {
    this.audioCtx = null;
    this.master = null;
    this.enabled = true;
  }

  _ctx() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  /** Short synthesized impulse response for the reverb send — an exponentially decaying burst of noise, the standard cheap way to get a convolution reverb without shipping an audio file. */
  _makeImpulse(ctx, duration = 0.55, decay = 2.4) {
    const length = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  /**
   * Lazily builds the shared mix bus every cue routes through: a dry sum
   * and a reverb send, both feeding one compressor before the output.
   * Sharing one compressor across dry+wet is what lets individual layers
   * run hot without the mix turning harsh when several overlap.
   */
  _bus() {
    const ctx = this._ctx();
    if (!ctx) return null;
    if (!this.master) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.15;
      compressor.connect(ctx.destination);

      const dry = ctx.createGain();
      dry.gain.value = 1.0;
      dry.connect(compressor);

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.45;
      const convolver = ctx.createConvolver();
      convolver.buffer = this._makeImpulse(ctx);
      reverbSend.connect(convolver);
      convolver.connect(compressor);

      this.master = dry;
      this.reverbSend = reverbSend;
    }
    return this.master;
  }

  /**
   * Play a single tone. startFreq/endFreq lets a tone glide (used for the
   * speed up/down cues); omit endFreq for a flat tone. `pan` (-1..1)
   * spreads layered tones across the stereo field instead of stacking
   * everything dead-center.
   */
  _tone(startFreq, duration = 0.12, { endFreq = null, type = 'sine', volume = 0.12, delay = 0, attack = 0.005, pan = 0 } = {}) {
    if (!this.enabled) return;
    try {
      const ctx = this._ctx();
      const bus = this._bus();
      if (!ctx || !bus) return;
      const t0 = ctx.currentTime + delay;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, t0);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + duration);
      }

      // Fast punchy attack, then decay — feels more like a percussive "hit"
      // than a soft UI beep.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain);

      if (pan !== 0 && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        gain.connect(panner);
        panner.connect(bus);
      } else {
        gain.connect(bus);
      }
      if (this.reverbSend) gain.connect(this.reverbSend);

      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) {
      // Audio fails silently — never let a sound-effect error break control flow.
    }
  }

  /** Low sine/triangle pulse under a hit for perceived weight — this is most of what reads as "punch". */
  _thump(freq = 75, duration = 0.16, { volume = 0.22, delay = 0 } = {}) {
    this._tone(freq, duration, { endFreq: freq * 0.6, type: 'triangle', volume, delay, attack: 0.002 });
  }

  /** Short filtered burst of noise for a percussive attack "snap" ahead of the tonal layers. */
  _snap(duration = 0.045, { volume = 0.2, delay = 0, filterFreq = 2200 } = {}) {
    if (!this.enabled) return;
    try {
      const ctx = this._ctx();
      const bus = this._bus();
      if (!ctx || !bus) return;
      const t0 = ctx.currentTime + delay;

      const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(bus);

      noise.start(t0);
      noise.stop(t0 + duration + 0.01);
    } catch (e) {
      // Audio fails silently — never let a sound-effect error break control flow.
    }
  }

  /** Layered power-chord stab + rising tail — big, motivational "let's go!" cue. */
  success() {
    this._snap(0.04, { volume: 0.22, filterFreq: 2800 });
    this._thump(85, 0.2, { volume: 0.26 });
    this._tone(220, 0.16, { type: 'sawtooth', volume: 0.16, pan: -0.25 });
    this._tone(330, 0.16, { type: 'sawtooth', volume: 0.14, pan: 0.25 });
    this._tone(660, 0.2, { endFreq: 1100, type: 'triangle', volume: 0.2, delay: 0.03 });
  }

  /** Punchy descending buzz — used for connection failures, rejected commands, errors. */
  error() {
    this._snap(0.05, { volume: 0.2, filterFreq: 1200 });
    this._thump(70, 0.22, { volume: 0.22 });
    this._tone(320, 0.12, { type: 'square', volume: 0.17, attack: 0.002 });
    this._tone(190, 0.32, { endFreq: 85, type: 'square', volume: 0.18, delay: 0.06 });
  }

  /** Rising "revving up" sweep with a bright top note — speed increased. */
  speedUp() {
    this._snap(0.03, { volume: 0.14, filterFreq: 3200 });
    this._tone(420, 0.13, { endFreq: 1050, type: 'sawtooth', volume: 0.17, attack: 0.003 });
    this._tone(1050, 0.09, { type: 'triangle', volume: 0.13, delay: 0.09 });
    this._thump(95, 0.1, { volume: 0.14 });
  }

  /** Falling sweep — speed decreased (still solid, not weak/sad). */
  speedDown() {
    this._snap(0.03, { volume: 0.12, filterFreq: 1800 });
    this._tone(760, 0.15, { endFreq: 320, type: 'sawtooth', volume: 0.16, attack: 0.003 });
    this._thump(80, 0.12, { volume: 0.13 });
  }

  /** Short punchy click — generic button/command feedback. */
  click() {
    this._snap(0.025, { volume: 0.16, filterFreq: 3500 });
    this._tone(650, 0.07, { type: 'square', volume: 0.13, attack: 0.002 });
  }

  /** Two-note power-down cue — belt stopped / session ended, still solid & clear. */
  stopped() {
    this._snap(0.045, { volume: 0.18, filterFreq: 1600 });
    this._thump(75, 0.24, { volume: 0.24 });
    this._tone(440, 0.16, { type: 'sawtooth', volume: 0.16, pan: -0.2 });
    this._tone(220, 0.26, { type: 'sawtooth', volume: 0.16, delay: 0.1, pan: 0.2 });
  }

  /** Big triumphant fanfare — reserved for hitting a milestone (e.g. workout goal). */
  milestone() {
    this._snap(0.05, { volume: 0.22, filterFreq: 3000 });
    this._thump(90, 0.28, { volume: 0.26 });
    this._tone(440, 0.14, { type: 'sawtooth', volume: 0.17, pan: -0.3 });
    this._tone(554, 0.14, { type: 'sawtooth', volume: 0.16, delay: 0.09, pan: 0.3 });
    this._tone(660, 0.26, { type: 'triangle', volume: 0.22, delay: 0.18 });
    this._tone(880, 0.22, { type: 'triangle', volume: 0.14, delay: 0.24 });
  }
}

window.spxSfx = new SPXSoundEffects();
