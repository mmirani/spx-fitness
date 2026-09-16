/**
 * SPX Fitness - Main Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  const treadmill = window.spxTreadmill;
  const bleDriver = window.spxBleDriver;

  let speedChart = null;

  // UI Element References
  const connectBtn = document.getElementById('connect-btn');
  const scanAllBtn = document.getElementById('scan-all-btn');
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

  const inspectorLog = document.getElementById('inspector-log');
  const clearLogBtn = document.getElementById('clear-log-btn');

  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnSpeedUp = document.getElementById('btn-speed-up');
  const btnSpeedDown = document.getElementById('btn-speed-down');

  // Initialize Speed Chart
  speedChart = new SPXChartVisualizer('chart-wrapper');

  // Log Inspector Binding
  if (inspectorLog && bleDriver) {
    bleDriver.registerLogListener((msg, type) => {
      const entry = document.createElement('div');
      entry.className = `log-entry ${type || 'info'}`;
      const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      entry.textContent = `[${timestamp}] ${msg}`;
      inspectorLog.appendChild(entry);
      inspectorLog.scrollTop = inspectorLog.scrollHeight;
    });

    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        inspectorLog.innerHTML = '';
      });
    }
  }

  // Confirmed real-command test buttons (start/pause/stop) — these send the
  // exact byte-for-byte frames captured from the official app's BLE traffic.
  document.querySelectorAll('.confirmed-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!window.spxBleDriver.isConnected && !window.spxBleDriver.isSimulating) {
        showToast('Connect the walking pad first (or use Simulator Mode)', 'error');
        return;
      }
      const cmd = btn.getAttribute('data-cmd');
      if (cmd === 'start') await bleDriver.start();
      else if (cmd === 'pause') await bleDriver.pause();
      else if (cmd === 'stop') await bleDriver.stop();
      showToast(`Sent confirmed ${cmd.toUpperCase()} command — check Inspector log`, 'success');
    });
  });

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
  const handleConnect = async (scanAll = false) => {
    try {
      showToast(scanAll ? "Scanning all Bluetooth LE devices..." : "Searching for Sperax Walking Pad...");
      const success = await bleDriver.requestDevice(scanAll);
      if (success) {
        showToast(`Connected to ${bleDriver.discoveredInfo || 'Walking Pad'}!`, "success");
      }
    } catch (err) {
      if (err.name !== 'NotFoundError' && !err.message.includes('cancelled')) {
        showToast(`Connection error: ${err.message || err}`, "error");
      }
    }
  };

  if (connectBtn) connectBtn.addEventListener('click', () => handleConnect(false));
  if (scanAllBtn) scanAllBtn.addEventListener('click', () => handleConnect(true));

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
    connectDashBtn.addEventListener('click', () => handleConnect(false));
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
      statusDot.className = 'status-dot';
      statusText.textContent = 'Disconnected';
      if (connectBtn) {
        connectBtn.textContent = 'Connect Sperax Walking Pad';
        connectBtn.disabled = false;
      }
      setControlsEnabled(false);
    }
  });

  // Telemetry Updates from Treadmill Engine
  treadmill.subscribe((snapshot) => {
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
  });

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

  // Preset Speed Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const speed = parseFloat(btn.getAttribute('data-speed'));
      if (!isNaN(speed)) {
        treadmill.setTargetSpeed(speed);
        showToast(`Target Speed set to ${speed} ${treadmill.unit.toUpperCase()}`);
      }
    });
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
