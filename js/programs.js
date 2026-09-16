/**
 * SPX Fitness - Workout Programs & Interval Engine
 */

class WorkoutProgramEngine {
  constructor() {
    this.activeProgram = null;
    this.currentSegmentIndex = 0;
    this.segmentTimer = null;
    this.segmentSecondsLeft = 0;
    this.onSegmentChangeCallbacks = [];

    this.programs = [
      {
        id: 'casual_stroll',
        name: 'Casual Desk Walk',
        description: 'Steady 1.5 - 2.0 mph pace designed for active typing, meetings, and light movement.',
        durationMins: 30,
        type: 'Steady',
        color: '#00f2fe',
        segments: [
          { speed: 1.2, durationSec: 180 }, // 3m warmup
          { speed: 1.8, durationSec: 1440 }, // 24m main
          { speed: 1.2, durationSec: 180 }  // 3m cooldown
        ]
      },
      {
        id: 'fat_burn',
        name: 'Brisk Fat Burner',
        description: 'Progressive speed increases targeting zone 2 cardiovascular fat oxidation.',
        durationMins: 25,
        type: 'Progressive',
        color: '#ff9100',
        segments: [
          { speed: 1.5, durationSec: 300 }, // 5m
          { speed: 2.5, durationSec: 300 }, // 5m
          { speed: 3.2, durationSec: 600 }, // 10m
          { speed: 2.0, durationSec: 300 }  // 5m
        ]
      },
      {
        id: 'hiit_walk',
        name: 'Power HIIT Intervals',
        description: 'Alternating high intensity brisk walk (4.0 mph) and active recovery (1.5 mph).',
        durationMins: 20,
        type: 'HIIT',
        color: '#ff3366',
        segments: [
          { speed: 1.5, durationSec: 180 }, // Warmup
          { speed: 3.8, durationSec: 60 },  // Interval 1
          { speed: 1.8, durationSec: 90 },  // Recovery 1
          { speed: 4.2, durationSec: 60 },  // Interval 2
          { speed: 1.8, durationSec: 90 },  // Recovery 2
          { speed: 4.5, durationSec: 60 },  // Interval 3
          { speed: 1.8, durationSec: 90 },  // Recovery 3
          { speed: 4.5, durationSec: 60 },  // Interval 4
          { speed: 1.8, durationSec: 90 },  // Recovery 4
          { speed: 1.2, durationSec: 300 }  // Cooldown
        ]
      },
      {
        id: 'stamina_builder',
        name: 'Pyramid Endurance',
        description: 'Stepwise acceleration pyramid to boost stamina and calorie output.',
        durationMins: 30,
        type: 'Pyramid',
        color: '#9d4edd',
        segments: [
          { speed: 1.5, durationSec: 300 },
          { speed: 2.2, durationSec: 300 },
          { speed: 3.0, durationSec: 300 },
          { speed: 3.8, durationSec: 300 },
          { speed: 3.0, durationSec: 300 },
          { speed: 2.2, durationSec: 300 },
          { speed: 1.5, durationSec: 300 }
        ]
      }
    ];
  }

  getPrograms() {
    return this.programs;
  }

  selectProgram(id) {
    const p = this.programs.find(prog => prog.id === id);
    if (p) {
      this.activeProgram = p;
      this.currentSegmentIndex = 0;
      return p;
    }
    return null;
  }

  startProgram() {
    if (!this.activeProgram) return;

    this.currentSegmentIndex = 0;
    this.executeCurrentSegment();
  }

  executeCurrentSegment() {
    if (!this.activeProgram || this.currentSegmentIndex >= this.activeProgram.segments.length) {
      this.finishProgram();
      return;
    }

    const seg = this.activeProgram.segments[this.currentSegmentIndex];
    this.segmentSecondsLeft = seg.durationSec;

    // Set speed on treadmill engine
    if (window.spxTreadmill) {
      window.spxTreadmill.setTargetSpeed(seg.speed);
    }

    this.notifySegmentChange(seg);

    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.segmentTimer = setInterval(() => {
      if (window.spxTreadmill && window.spxTreadmill.state === 'RUNNING') {
        this.segmentSecondsLeft--;
        if (this.segmentSecondsLeft <= 0) {
          this.currentSegmentIndex++;
          this.executeCurrentSegment();
        }
      }
    }, 1000);
  }

  finishProgram() {
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.activeProgram = null;
    this.notifySegmentChange(null);
    if (window.spxTreadmill) {
      window.spxTreadmill.stopSession();
    }
  }

  stopProgram() {
    if (this.segmentTimer) clearInterval(this.segmentTimer);
    this.activeProgram = null;
  }

  onSegmentChange(cb) {
    this.onSegmentChangeCallbacks.push(cb);
  }

  notifySegmentChange(seg) {
    this.onSegmentChangeCallbacks.forEach(cb => cb({
      program: this.activeProgram,
      segment: seg,
      segmentIndex: this.currentSegmentIndex,
      totalSegments: this.activeProgram ? this.activeProgram.segments.length : 0,
      secondsLeft: this.segmentSecondsLeft
    }));
  }
}

window.spxPrograms = new WorkoutProgramEngine();
