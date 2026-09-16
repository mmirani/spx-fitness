/**
 * Mirani Walking Pad - Main Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const treadmill = window.spxTreadmill;
  const bleDriver = window.spxBleDriver;

  let speedChart = null;

  // UI Element References
  const connectBtn = document.getElementById('connect-btn');
  const simBtn = document.getElementById('sim-btn');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  const hudSpeed = document.getElementById('hud-speed');
  const hudTime = document.getElementById('hud-time');
  const hudDist = document.getElementById('hud-dist');
  const hudCal = document.getElementById('hud-cal');
  const hudSteps = document.getElementById('hud-steps');
  const targetSpeedVal = document.getElementById('target-speed-val');
  const speedUnitLabel = document.getElementById('speed-unit-label');


  const unitMphBtn = document.getElementById('unit-mph');
  const unitKmhBtn = document.getElementById('unit-kmh');

  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnSpeedUp = document.getElementById('btn-speed-up');
  const btnSpeedDown = document.getElementById('btn-speed-down');

  // Initialize Speed Chart
  speedChart = new SPXChartVisualizer('chart-wrapper');

  // Tab Router
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(`tab-${tabId}`);
      if (targetTab) targetTab.classList.add('active');

      if (tabId === 'history') loadHistoryTable();
    });
  });

  // Bluetooth Connect Actions
  const handleConnect = async () => {
    try {
      showToast("Searching for Walking Pad...");
      const success = await bleDriver.requestDevice();
      if (success) {
        showToast(`Connected to ${bleDriver.discoveredInfo || 'Walking Pad'}!`, "success");
        if (window.spxSfx) window.spxSfx.success();
      }
    } catch (err) {
      if (err.name !== 'NotFoundError' && !err.message.includes('cancelled')) {
        showToast(`Connection error: ${err.message || err}`, "error");
        if (window.spxSfx) window.spxSfx.error();
      }
    }
  };

  if (connectBtn) connectBtn.addEventListener('click', () => handleConnect());

  // Auto-reconnect: if the browser previously granted permission for this
  // pad, silently reconnect on page load with no picker dialog at all.
  // (First-ever connect on a machine still needs one picker tap — that's a
  // Web Bluetooth security requirement, not something a page can skip.)
  if (bleDriver && bleDriver.tryAutoReconnect) {
    bleDriver.tryAutoReconnect().then(connected => {
      if (connected) {
        showToast(`Auto-connected to ${bleDriver.discoveredInfo || 'Walking Pad'}!`, "success");
        if (window.spxSfx) window.spxSfx.success();
      }
    });
  }

  // Simulation Toggle
  simBtn.addEventListener('click', () => {
    bleDriver.isSimulating = !bleDriver.isSimulating;
    if (bleDriver.isSimulating) {
      statusDot.className = 'status-dot simulating';
      statusText.textContent = 'Simulated Mode';
      simBtn.textContent = 'Exit Simulator';
      showToast("Treadmill simulator mode active.");
      setControlsEnabled(true);
    } else {
      statusDot.className = 'status-dot';
      statusText.textContent = 'Disconnected';
      simBtn.textContent = 'Simulator Mode';
      showToast("Exited simulator mode.");
      setControlsEnabled(false);
    }
  });

  // Dashboard connect button (mirrors Inspector connect)
  const connectDashBtn = document.getElementById('btn-connect-dashboard');
  const connectBanner = document.getElementById('connect-banner');
  const controlPanel = document.getElementById('control-panel-inner');

  const setControlsEnabled = (enabled) => {
    if (controlPanel) {
      controlPanel.style.opacity = enabled ? '1' : '0.4';
      controlPanel.style.pointerEvents = enabled ? 'all' : 'none';
    }
    if (connectBanner) connectBanner.style.display = enabled ? 'none' : 'flex';
    if (btnStart) btnStart.disabled = !enabled;
  };

  if (connectDashBtn) {
    connectDashBtn.addEventListener('click', () => handleConnect());
  }

  // BLE Status Updates
  bleDriver.registerStatusListener((status, deviceName) => {
    if (status === 'connected') {
      statusDot.className = 'status-dot connected';
      statusText.textContent = `Connected: ${deviceName || 'Walking Pad'}`;
      if (connectBtn) {
        connectBtn.textContent = 'Connected';
        connectBtn.disabled = true;
      }
      setControlsEnabled(true);
    } else {
      const wasConnected = connectBtn && connectBtn.disabled;
      statusDot.className = 'status-dot';
      statusText.textContent = 'Disconnected';
      if (connectBtn) {
        connectBtn.textContent = 'Connect Walking Pad';
        connectBtn.disabled = false;
      }
      setControlsEnabled(false);
      // Only play the "error" cue for a surprise disconnect while we thought
      // we were connected — not on the very first page load.
      if (wasConnected && window.spxSfx) window.spxSfx.error();
    }
  });

  // Telemetry Updates from Treadmill Engine
  const renderSnapshot = (snapshot) => {
    hudSpeed.textContent = snapshot.currentSpeed.toFixed(1);
    hudTime.textContent = snapshot.formattedTime;
    hudDist.textContent = snapshot.distance;
    hudCal.textContent = snapshot.calories;
    hudSteps.textContent = snapshot.steps.toLocaleString();
    targetSpeedVal.textContent = snapshot.targetSpeed.toFixed(1);

    if (snapshot.state === 'RUNNING') {
      speedChart.addPoint(snapshot.currentSpeed);
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';
      btnStop.disabled = false;
    } else if (snapshot.state === 'PAUSED') {
      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
    } else if (snapshot.state === 'STOPPED') {
      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
      btnStop.disabled = true;
    }
  };
  treadmill.subscribe(renderSnapshot);
  // Paint the real initial state (e.g. the 0.3 km/h safety-floor target
  // speed) immediately on load, instead of waiting for the first change.
  renderSnapshot(treadmill.getSnapshot());

  // Direct Hardware Controls Event Listeners
  // Note: treadmill.js's start/pause/stopSession() already call the real
  // bleDriver commands internally (start/pause/stop) once, keeping BLE
  // control centralized in one place — do not also call bleDriver here, or
  // the real device receives duplicate commands (e.g. START sent twice, or
  // a stray STOP right after PAUSE).
  btnStart.addEventListener('click', async () => {
    showToast("Sending START signal...");
    treadmill.startSession();
  });

  btnPause.addEventListener('click', async () => {
    treadmill.pauseSession();
  });

  btnStop.addEventListener('click', async () => {
    const summary = treadmill.stopSession();
    if (summary && summary.elapsedSeconds > 10) {
      saveWorkoutToHistory(summary);
      showToast(`Workout Saved! ${summary.distance} ${summary.unit} in ${summary.formattedTime}`, "success");
    }
    speedChart.clear();
  });

  btnSpeedUp.addEventListener('click', async () => {
    treadmill.adjustSpeed(0.1);
  });

  btnSpeedDown.addEventListener('click', async () => {
    treadmill.adjustSpeed(-0.1);
  });

  // Unit Switcher
  unitMphBtn.addEventListener('click', () => {
    unitMphBtn.classList.add('active');
    unitKmhBtn.classList.remove('active');
    treadmill.setUnit('mph');
    speedUnitLabel.textContent = 'MPH';
  });

  unitKmhBtn.addEventListener('click', () => {
    unitKmhBtn.classList.add('active');
    unitMphBtn.classList.remove('active');
    treadmill.setUnit('kmh');
    speedUnitLabel.textContent = 'KM/H';
  });

  // Render Workout Programs Cards
  renderProgramCards();

  // Load History
  loadHistoryTable();
});

function renderProgramCards() {
  const container = document.getElementById('programs-container');
  if (!container) return;

  const programs = window.spxPrograms.getPrograms();
  container.innerHTML = programs.map(p => `
    <div class="program-card" data-id="${p.id}">
      <div class="program-name">${p.name}</div>
      <div class="program-desc">${p.description}</div>
      <div class="program-meta">
        <span>⏱️ ${p.durationMins} Mins</span>
        <span>🔥 ${p.type}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.program-card').forEach(card => {
    card.addEventListener('click', async () => {
      const id = card.getAttribute('data-id');
      container.querySelectorAll('.program-card').forEach(c => c.classList.remove('active-program'));
      card.classList.add('active-program');

      const p = window.spxPrograms.selectProgram(id);
      if (p) {
        showToast(`Loaded Program: ${p.name}`);
        window.spxPrograms.startProgram();
        window.spxTreadmill.startSession();
      }
    });
  });
}

function saveWorkoutToHistory(summary) {
  const history = JSON.parse(localStorage.getItem('spx_history') || '[]');
  history.unshift({
    date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    duration: summary.formattedTime,
    distance: summary.distance + ' ' + summary.unit,
    calories: summary.calories,
    steps: summary.steps,
    avgSpeed: summary.currentSpeed.toFixed(1) + ' ' + summary.unit
  });
  localStorage.setItem('spx_history', JSON.stringify(history.slice(0, 50)));
}

function loadHistoryTable() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const history = JSON.parse(localStorage.getItem('spx_history') || '[]');
  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted); padding: 2rem;">No workouts recorded yet. Start walking!</td></tr>`;
    return;
  }

  tbody.innerHTML = history.map(item => `
    <tr>
      <td>${item.date}</td>
      <td>${item.duration}</td>
      <td>${item.distance}</td>
      <td>${item.calories} kcal</td>
      <td>${item.steps.toLocaleString()}</td>
    </tr>
  `).join('');
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
