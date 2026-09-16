/**
 * SPX Fitness - Treadmill State & Simulation Engine
 */

class TreadmillEngine {
  constructor() {
    this.unit = 'mph'; // 'mph' or 'kmh'
    this.userWeightKg = 70; // Default user weight for calorie estimation

    this.state = 'STOPPED'; // 'STOPPED', 'COUNTDOWN', 'RUNNING', 'PAUSED'
    this.currentSpeed = 0.0;
    this.targetSpeed = 1.5; // Default initial walking speed (1.5 mph)
    this.minSpeed = 0.5;
    this.maxSpeed = 6.0; // Max speed for walking pad
    this.speedStep = 0.1;

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

  setUnit(unit) {
    if (unit === 'mph' || unit === 'kmh') {
      this.unit = unit;
      localStorage.setItem('spx_unit', unit);
      this.notify();
    }
  }

  setTargetSpeed(speed) {
    let clamped = Math.max(this.minSpeed, Math.min(this.maxSpeed, speed));
    clamped = Math.round(clamped * 10) / 10;
    this.targetSpeed = clamped;

    if (this.state === 'RUNNING') {
      this.playBeep(600, 0.1);
      if (window.spxBleDriver && window.spxBleDriver.isConnected) {
        const speedKmh = this.unit === 'mph' ? clamped * 1.60934 : clamped;
        window.spxBleDriver.setTargetSpeed(speedKmh);
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
    }

    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      await window.spxBleDriver.start();
      const speedKmh = this.unit === 'mph' ? this.targetSpeed * 1.60934 : this.targetSpeed;
      await window.spxBleDriver.setTargetSpeed(speedKmh);
    }

    this.state = 'RUNNING';
    this.startTimer();
    this.notify();
  }

  pauseSession() {
    if (this.state !== 'RUNNING') return;
    this.state = 'PAUSED';
    this.clearInterval();
    this.playBeep(400, 0.2);
    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      window.spxBleDriver.pause();
    }
    this.notify();
  }

  stopSession() {
    if (this.state === 'STOPPED') return;
    this.state = 'STOPPED';
    this.clearInterval();
    this.currentSpeed = 0.0;
    this.playBeep(300, 0.3);

    if (window.spxBleDriver && window.spxBleDriver.isConnected) {
      window.spxBleDriver.stop();
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
