/**
 * Mirani Walking Pad - Shared Sound Effects
 *
 * WebAudio-based feedback tones used across the app (BLE connect events,
 * start/pause/stop, and speed changes) so the user always gets an audible,
 * workout-appropriate cue for success/failure/direction without relying
 * only on the on-screen toast, which is easy to miss while walking.
 *
 * These are intentionally punchier/more "gym" than plain UI beeps: short
 * layered chords with a fast attack and a bit of saw/square edge, rather
 * than thin single sine tones.
 */

class SPXSoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
  }

  _ctx() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  /**
   * Play a single tone. startFreq/endFreq lets a tone glide (used for the
   * speed up/down cues); omit endFreq for a flat tone.
   */
  _tone(startFreq, duration = 0.12, { endFreq = null, type = 'sine', volume = 0.12, delay = 0, attack = 0.005 } = {}) {
    if (!this.enabled) return;
    try {
      const ctx = this._ctx();
      if (!ctx) return;
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
      gain.connect(ctx.destination);

      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) {
      // Audio fails silently — never let a sound-effect error break control flow.
    }
  }

  /** Layered power-chord stab + rising tail — big, motivational "let's go!" cue. */
  success() {
    // Root + fifth stab (punchy), then a bright rising tail on top.
    this._tone(220, 0.14, { type: 'sawtooth', volume: 0.1 });
    this._tone(330, 0.14, { type: 'sawtooth', volume: 0.08 });
    this._tone(660, 0.16, { endFreq: 1100, type: 'triangle', volume: 0.14, delay: 0.03 });
  }

  /** Punchy descending buzz — used for connection failures, rejected commands, errors. */
  error() {
    this._tone(300, 0.1, { type: 'square', volume: 0.11, attack: 0.002 });
    this._tone(180, 0.28, { endFreq: 90, type: 'square', volume: 0.11, delay: 0.06 });
  }

  /** Rising "revving up" sweep with a bright top note — speed increased. */
  speedUp() {
    this._tone(420, 0.11, { endFreq: 980, type: 'sawtooth', volume: 0.11, attack: 0.003 });
    this._tone(980, 0.08, { type: 'triangle', volume: 0.08, delay: 0.08 });
  }

  /** Falling sweep — speed decreased (still solid, not weak/sad). */
  speedDown() {
    this._tone(760, 0.13, { endFreq: 340, type: 'sawtooth', volume: 0.1, attack: 0.003 });
  }

  /** Short punchy click — generic button/command feedback. */
  click() {
    this._tone(650, 0.06, { type: 'square', volume: 0.08, attack: 0.002 });
  }

  /** Two-note power-down cue — belt stopped / session ended, still solid & clear. */
  stopped() {
    this._tone(440, 0.14, { type: 'sawtooth', volume: 0.1 });
    this._tone(220, 0.22, { type: 'sawtooth', volume: 0.1, delay: 0.1 });
  }

  /** Big triumphant fanfare — reserved for hitting a milestone (e.g. workout goal). */
  milestone() {
    this._tone(440, 0.12, { type: 'sawtooth', volume: 0.11 });
    this._tone(554, 0.12, { type: 'sawtooth', volume: 0.1, delay: 0.09 });
    this._tone(660, 0.22, { type: 'triangle', volume: 0.15, delay: 0.18 });
  }
}

window.spxSfx = new SPXSoundEffects();
