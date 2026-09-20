/**
 * Mirani Walking Pad - Main Application Controller
 */

const SPX_USERS = ['Mansur', 'Sonia', 'Rehaan', 'Amaya'];

function getCurrentUser() {
  const saved = localStorage.getItem('spx_current_user');
  return SPX_USERS.includes(saved) ? saved : SPX_USERS[0];
}

function setCurrentUser(name) {
  if (!SPX_USERS.includes(name)) return;
  localStorage.setItem('spx_current_user', name);
}

document.addEventListener('DOMContentLoaded', () => {
  const treadmill = window.spxTreadmill;
  const bleDriver = window.spxBleDriver;

  let speedChart = null;

  // One-time migration: history saved before per-user tracking existed
  // becomes Mansur's history, rather than silently disappearing.
  const legacyHistory = localStorage.getItem('spx_history');
  if (legacyHistory && !localStorage.getItem('spx_history_Mansur')) {
    localStorage.setItem('spx_history_Mansur', legacyHistory);
  }
  if (legacyHistory) localStorage.removeItem('spx_history');

  // User Switcher (custom popover menu, not a native <select>)
  const userSwitcher = document.getElementById('user-switcher');
  const userTrigger = document.getElementById('user-trigger');
  const userMenu = document.getElementById('user-menu');
  const userAvatar = document.getElementById('user-avatar');
  const userTriggerName = document.getElementById('user-trigger-name');
  const historyUserLabel = document.getElementById('history-user-label');
  const userOptions = userMenu ? Array.from(userMenu.querySelectorAll('.user-option')) : [];

  const closeUserMenu = () => {
    if (!userSwitcher) return;
    userSwitcher.classList.remove('open');
    if (userTrigger) userTrigger.setAttribute('aria-expanded', 'false');
  };

  const applyUser = (name) => {
    setCurrentUser(name);
    if (userAvatar) {
      userAvatar.textContent = name.charAt(0);
      userAvatar.setAttribute('data-user', name);
    }
    if (userTriggerName) userTriggerName.textContent = name;
    if (historyUserLabel) historyUserLabel.textContent = name;
    userOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.user === name));
    loadHistoryTable();
  };

  if (userTrigger) {
    userTrigger.addEventListener('click', () => {
      const isOpen = userSwitcher.classList.toggle('open');
      userTrigger.setAttribute('aria-expanded', String(isOpen));
    });
  }

  userOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      applyUser(opt.dataset.user);
      closeUserMenu();
    });
  });

  document.addEventListener('click', (e) => {
    if (userSwitcher && !userSwitcher.contains(e.target)) closeUserMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeUserMenu();
  });

  applyUser(getCurrentUser());

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
  const btnVibrateStop = document.getElementById('btn-vibrate-stop');
  const vibeModeBtns = Array.from(document.querySelectorAll('.btn-vibe-mode'));

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
    syncVibrateControls(enabled);
  };

  const isWalking = () =>
    treadmill.state === 'RUNNING' || treadmill.state === 'PAUSED' || treadmill.state === 'COUNTDOWN';

  const syncVibrateControls = (controlsOn = !!(bleDriver.isConnected || bleDriver.isSimulating)) => {
    const level = bleDriver.vibrateLevel || 0;
    const walking = isWalking();
    const busy = !!bleDriver._vibrateBusy;
    vibeModeBtns.forEach(btn => {
      const mode = Number(btn.dataset.mode);
      btn.disabled = !controlsOn || walking || busy;
      btn.classList.toggle('active', level === mode);
      btn.setAttribute('aria-pressed', String(level === mode));
    });
    if (btnVibrateStop) btnVibrateStop.disabled = !controlsOn || walking || busy || level === 0;
    if (btnStop && !walking && treadmill.state === 'STOPPED') {
      btnStop.disabled = level === 0;
    }
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

    // Drive the ambient background's speed-reactive glow/drift (see
    // .bg-decor and --speed-ratio in style.css) off the real belt speed,
    // not the target, so it settles back down as the belt actually slows.
    // Forced to 0 outside RUNNING: pauseSession() intentionally leaves
    // currentSpeed at its pre-pause value (so the HUD still shows the
    // speed you'll resume at), but the belt itself isn't moving, so the
    // reactive effects need to reflect that separately rather than
    // reading currentSpeed directly.
    const speedKmh = treadmill._displayToKmh(snapshot.currentSpeed);
    const ratio = snapshot.state === 'RUNNING'
      ? Math.max(0, Math.min(1, speedKmh / treadmill.MAX_SPEED_KMH))
      : 0;
    document.documentElement.style.setProperty('--speed-ratio', ratio.toFixed(3));
    // If the controls have been moved into a Picture-in-Picture window
    // (see js/theater.js), that window has its own separate document/root,
    // so the reactive glow needs setting there too.
    if (window.__spxPipDocument) {
      window.__spxPipDocument.documentElement.style.setProperty('--speed-ratio', ratio.toFixed(3));
    }

    if (snapshot.state === 'RUNNING') {
      speedChart.addPoint(snapshot.currentSpeed, snapshot.targetSpeed);
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-block';
      btnStop.disabled = false;
    } else if (snapshot.state === 'PAUSED') {
      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
    } else if (snapshot.state === 'STOPPED') {
      btnStart.style.display = 'inline-block';
      btnPause.style.display = 'none';
      btnStop.disabled = !(bleDriver.vibrateLevel);
    }
    syncVibrateControls();
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
    if (bleDriver.vibrateLevel && !isWalking()) {
      const ok = await bleDriver.stopVibrate();
      syncVibrateControls();
      showToast(ok ? 'Vibrate off.' : 'Vibrate stop failed.', ok ? 'info' : 'error');
      if (window.spxSfx) ok ? window.spxSfx.click() : window.spxSfx.error();
      return;
    }
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

  const startVibrateMode = async (mode) => {
    if (isWalking()) {
      showToast('Stop walking before using vibrate.', 'error');
      if (window.spxSfx) window.spxSfx.error();
      return;
    }
    if (bleDriver._vibrateBusy) return;
    const name = (bleDriver.constructor.VIBRATE_MODES || {})[mode] || `level ${mode}`;
    if (mode > 1) showToast(`Ramping to ${name}…`);
    const ok = await bleDriver.setVibrate(mode, () => syncVibrateControls());
    syncVibrateControls();
    if (!ok) {
      showToast('Vibrate command failed.', 'error');
      if (window.spxSfx) window.spxSfx.error();
      return;
    }
    showToast(`Vibrate: ${name}`);
    if (window.spxSfx) window.spxSfx.success();
  };

  vibeModeBtns.forEach(btn => {
    btn.addEventListener('click', () => startVibrateMode(Number(btn.dataset.mode)));
  });

  if (btnVibrateStop) {
    btnVibrateStop.addEventListener('click', async () => {
      const ok = await bleDriver.stopVibrate();
      syncVibrateControls();
      showToast(ok ? 'Vibrate off.' : 'Vibrate stop failed.', ok ? 'info' : 'error');
      if (window.spxSfx) ok ? window.spxSfx.click() : window.spxSfx.error();
    });
  }

  // Unit Switcher
  unitMphBtn.addEventListener('click', () => {
    unitMphBtn.classList.add('active');
    unitKmhBtn.classList.remove('active');
    treadmill.setUnit('mph');
    speedUnitLabel.textContent = 'mph';
  });

  unitKmhBtn.addEventListener('click', () => {
    unitKmhBtn.classList.add('active');
    unitMphBtn.classList.remove('active');
    treadmill.setUnit('kmh');
    speedUnitLabel.textContent = 'km/h';
  });

  // Reflect the treadmill's actual unit (default km/h, or whatever was
  // saved) in the toggle buttons and label on load.
  if (treadmill.unit === 'mph') {
    unitMphBtn.classList.add('active');
    unitKmhBtn.classList.remove('active');
    speedUnitLabel.textContent = 'mph';
  } else {
    unitKmhBtn.classList.add('active');
    unitMphBtn.classList.remove('active');
    speedUnitLabel.textContent = 'km/h';
  }

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
  const key = `spx_history_${getCurrentUser()}`;
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  history.unshift({
    date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    duration: summary.formattedTime,
    distance: summary.distance + ' ' + summary.unit,
    calories: summary.calories,
    steps: summary.steps,
    avgSpeed: summary.currentSpeed.toFixed(1) + ' ' + summary.unit
  });
  localStorage.setItem(key, JSON.stringify(history.slice(0, 50)));
}

function loadHistoryTable() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  const history = JSON.parse(localStorage.getItem(`spx_history_${getCurrentUser()}`) || '[]');
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
