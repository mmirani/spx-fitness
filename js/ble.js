/**
 * SPX Fitness - Sperax RM-Series Walking Pad Bluetooth Driver
 *
 * Confirmed device: SPERAX_RM01
 * Service: 0000fff0-0000-1000-8000-00805f9b34fb
 * Write: 0000fff2-0000-1000-8000-00805f9b34fb [WRITE_NO_RESP]
 * Notify: 0000fff1-0000-1000-8000-00805f9b34fb [NOTIFY]
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROTOCOL — reverse-engineered from a real Android Bluetooth HCI snoop log
 * captured 2026-09-15 while operating the official "SPX Fitness" app against
 * this exact device (see PROJECT_CONTEXT.md "Confirmed Protocol" section for
 * the full raw capture + decode notes). All frames below are byte-for-byte
 * copies of what the official app actually sent/received — NOT guesses.
 *
 * Frame shape:  [0xf5] [LEN] [0x00] ...payload... [CRC16 LE, stuffed] [0xfa]
 *   CRC-16: poly 0xA327, init 0xFFFF, over header through payload.
 *   Bytes whose high nibble is 0xF are stuffed as [0xF0, low nibble]; LEN
 *   on the wire is then bumped to the stuffed length.
 *
 * Handshake (device -> app on connect):  0x12 0x13 0x14  (3 bytes, fixed)
 * Handshake ACK (app -> device):         0xf5 0x07 0x00 0x01 0x26 0xd8 0xfa
 * Mode-select (app -> device, sent once after handshake):
 *                                         0xf5 0x09 0x00 0x13 0x01 0x00 0x89 0xb8 0xfa
 * Heartbeat/status-poll (app -> device, sent continuously every ~150-200ms
 * while connected — this appears to be required to keep telemetry flowing):
 *                                         0xf5 0x08 0x00 0x19 0xf0 0x0a 0x59 0xfa
 * Start belt:                            0xf5 0x0a 0x00 0x15 0x01 0x02 0x00 0xbe 0x98 0xfa
 * Pause belt:                            0xf5 0x0a 0x00 0x15 0x02 0x00 0x00 0xc3 0x19 0xfa
 * Stop belt:                             0xf5 0x0a 0x00 0x15 0x00 0x00 0x00 0xd3 0x01 0xfa
 *
 * Status telemetry (device -> app, 20-byte frame, TYPE=0x18):
 *   byte[3]  = 0x19 constant (field/request echo, not live data)
 *   byte[6]  = BELT STATE: 0x00=idle/stopped, 0x13->0x10=countdown 3..GO,
 *              0x10=running (steady), 0x0f->0x00=stopping/paused transition
 *   byte[10] = step counter (increments ~1/sec while running)
 *   byte[17] = slower counter, hypothesis: time-remaining-in-program-step or
 *              distance/calories — not fully confirmed, do not rely on it yet
 *   All other bytes were 0x00 in every capture except the very first status
 *   frame after connect, which appears to be a one-time device info/config
 *   dump (different meaning, do not treat as live telemetry).
 *
 * Vibration (cmd 0x16 setShakeCtrl, from official-app Dart; not yet live-tested):
 *   Stop:  [0x16, 0x00, 0x00]
 *   Level: [0x16, 0x01, N]  N = 1..4
 */

class SPXBluetoothDriver {
  constructor() {
    this.device = null;
    this.server = null;
    this.writeChar = null;      // 0000fff2 — the confirmed write channel
    this.notifyChar = null;     // 0000fff1 — the confirmed notify channel

    this.isConnected = false;
    this.isSimulating = false;

    this.onTelemetryCallbacks = [];
    this.onStatusCallbacks = [];
    this.onLogCallbacks = [];
    this.discoveredInfo = '';

    this._heartbeatTimer = null;
    this._beltState = 0; // last decoded belt state byte
    this.vibrateLevel = 0; // 0 = off, 1–4 = massage level
  }

  static TARGET_SERVICE  = '0000fff0-0000-1000-8000-00805f9b34fb';
  static WRITE_CHAR      = '0000fff2-0000-1000-8000-00805f9b34fb';
  static NOTIFY_CHAR     = '0000fff1-0000-1000-8000-00805f9b34fb';
  static DEVICE_NAME_PREFIX = 'SPERAX';

  // ── Confirmed real frames (captured from official app's BLE traffic) ──
  static FRAME = {
    HANDSHAKE_ACK: [0xf5, 0x07, 0x00, 0x01, 0x26, 0xd8, 0xfa],
    MODE_SELECT:   [0xf5, 0x09, 0x00, 0x13, 0x01, 0x00, 0x89, 0xb8, 0xfa],
    HEARTBEAT:     [0xf5, 0x08, 0x00, 0x19, 0xf0, 0x0a, 0x59, 0xfa],
    START:         [0xf5, 0x0a, 0x00, 0x15, 0x01, 0x02, 0x00, 0xbe, 0x98, 0xfa],
    PAUSE:         [0xf5, 0x0a, 0x00, 0x15, 0x02, 0x00, 0x00, 0xc3, 0x19, 0xfa],
    STOP:          [0xf5, 0x0a, 0x00, 0x15, 0x00, 0x00, 0x00, 0xd3, 0x01, 0xfa],
  };

  // Belt state codes decoded from byte[6] of the 20-byte status frame
  static BELT_STATE = {
    IDLE: 0x00,
    COUNT_3: 0x13,
    COUNT_2: 0x12,
    COUNT_1: 0x11,
    RUNNING: 0x10,
    STOPPING: 0x0f,
  };

  log(msg, type = 'info') {
    console.log(`[SPX RM01] ${msg}`);
    this.onLogCallbacks.forEach(cb => cb(msg, type));
  }

  registerLogListener(cb) {
    this.onLogCallbacks.push(cb);
  }

  /**
   * Send a raw frame to the confirmed RM01 write characteristic
   */
  async sendFrame(frame, label = 'Frame') {
    if (this.isSimulating) return true;
    if (!this.writeChar) {
      this.log(`Cannot send [${label}]: No write characteristic connected!`, "error");
      return false;
    }
    const bytes = Uint8Array.from(frame);
    const hex = Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    this.log(`TX [${label}]: ${hex}`);
    try {
      await this.writeChar.writeValueWithoutResponse(bytes);
      this.log(`  ✓ Sent successfully!`, "success");
      return true;
    } catch (err) {
      this.log(`  ✗ Write failed: ${err.message}`, "error");
      return false;
    }
  }

  /**
   * Request device pairing, filtered to just this pad (by name prefix) so
   * the picker doesn't show every nearby Bluetooth device.
   *
   * Note: Web Bluetooth's security model requires a user gesture + a native
   * picker dialog the *first* time a page connects to a new device — a page
   * can never silently connect to a device it has never been granted
   * permission for. Once permission has been granted, tryAutoReconnect()
   * below can reconnect with zero dialogs on future page loads.
   */
  async requestDevice() {
    if (!navigator.bluetooth) {
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1' && window.location.protocol !== 'https:') {
        throw new Error("Web Bluetooth requires 'http://localhost:8125'. Please switch to http://localhost:8125 in Chrome/Edge.");
      }
      throw new Error("Web Bluetooth not supported in Safari. Use Google Chrome or Microsoft Edge.");
    }

    this.log("Opening Bluetooth picker...");

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: SPXBluetoothDriver.DEVICE_NAME_PREFIX }],
        optionalServices: [
          SPXBluetoothDriver.TARGET_SERVICE,
          '0000180a-0000-1000-8000-00805f9b34fb'
        ]
      });

      this.log(`Device Selected: "${this.device.name || 'Unnamed'}" (ID: ${this.device.id})`, "success");
      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
      return await this.connectGATT();
    } catch (err) {
      if (err.name === 'NotFoundError') {
        this.log("Pairing cancelled.", "warn");
        throw new Error("Pairing cancelled.");
      }
      this.log(`Error: ${err.message || err}`, "error");
      throw err;
    }
  }

  /**
   * Silently reconnect to a previously-permitted pad with NO picker dialog,
   * using the Web Bluetooth "getDevices" persistent-permissions API (Chrome/
   * Edge only, behind no flag as of recent versions). This only works for a
   * device the user has already granted access to at least once via
   * requestDevice() on this browser profile — Web Bluetooth's security model
   * never allows a page to discover/connect to a device it has never been
   * granted permission for without a user gesture + picker.
   */
  async tryAutoReconnect() {
    if (this.isConnected || this.isSimulating) return false;
    if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;

    try {
      const known = await navigator.bluetooth.getDevices();
      const match = known.find(d => (d.name || '').startsWith(SPXBluetoothDriver.DEVICE_NAME_PREFIX));
      if (!match) return false;

      this.log(`Found previously-paired device "${match.name}" — reconnecting silently...`);
      this.device = match;
      this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
      return await this.connectGATT();
    } catch (err) {
      this.log(`Auto-reconnect skipped: ${err.message || err}`, "warn");
      return false;
    }
  }

  /**
   * Connect and resolve the specific RM01 characteristics
   */
  async connectGATT() {
    if (!this.device) return false;

    this.log("Connecting to GATT Server...");
    try {
      this.server = await this.device.gatt.connect();
      this.log(`Connected! "${this.device.name}"`, "success");
    } catch (err) {
      this.log(`GATT connection failed: ${err.message}`, "error");
      throw new Error("Connection failed. Is the pad powered on and not paired to your phone?");
    }

    // Resolve the target service
    this.log(`Resolving Service: ${SPXBluetoothDriver.TARGET_SERVICE}`);
    let service;
    try {
      service = await this.server.getPrimaryService(SPXBluetoothDriver.TARGET_SERVICE);
      this.log(`  ✓ Service found!`, "success");
    } catch (err) {
      this.log(`  ✗ Target service not found: ${err.message}`, "error");
      throw new Error("The Sperax RM01 service was not found on this device.");
    }

    // Resolve Write characteristic 0xfff2
    try {
      this.writeChar = await service.getCharacteristic(SPXBluetoothDriver.WRITE_CHAR);
      this.log(`  ✓ Write characteristic resolved: 0xfff2`, "success");
    } catch (err) {
      this.log(`  ✗ Write char not found: ${err.message}`, "error");
    }

    // Resolve Notify characteristic 0xfff1
    try {
      this.notifyChar = await service.getCharacteristic(SPXBluetoothDriver.NOTIFY_CHAR);
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', (e) => this.handleNotification(e));
      this.log(`  ✓ Notify characteristic resolved & subscribed: 0xfff1`, "success");
    } catch (err) {
      this.log(`  Notify subscription note: ${err.message}`, "warn");
    }

    this.isConnected = true;
    this.discoveredInfo = this.device.name || 'SPERAX_RM01';
    this.notifyStatus('connected', this.discoveredInfo);

    // The device sends its 0x12 0x13 0x14 handshake challenge shortly after
    // connect; handleNotification() replies automatically. The heartbeat
    // loop is started there once the handshake completes.
    return true;
  }

  /**
   * Start the periodic heartbeat/status-poll. The official app sends this
   * continuously (~every 150-200ms) the whole time it's connected — the
   * device appears to need it to keep publishing live status notifications.
   */
  _startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => {
      this.sendFrame(SPXBluetoothDriver.FRAME.HEARTBEAT, 'Heartbeat/Poll');
    }, 180);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Start the walking belt (confirmed real command)
   */
  async start() {
    if (this.isSimulating) return true;
    this.log("=== Sending START command (confirmed real frame) ===");
    return await this.sendFrame(SPXBluetoothDriver.FRAME.START, 'Start Belt');
  }

  /**
   * Pause the belt without ending the session (confirmed real command)
   */
  async pause() {
    if (this.isSimulating) return true;
    this.log("=== Sending PAUSE command (confirmed real frame) ===");
    return await this.sendFrame(SPXBluetoothDriver.FRAME.PAUSE, 'Pause Belt');
  }

  /**
   * Stop the walking belt (confirmed real command)
   */
  async stop() {
    if (this.isSimulating) return true;
    this.log("=== Sending STOP command (confirmed real frame) ===");
    return await this.sendFrame(SPXBluetoothDriver.FRAME.STOP, 'Stop Belt');
  }

  // SET SPEED: GF(2)-linear checksum of the SPEED byte (captured 0–60).
  // Same [0x15][ACTION][VAL][0x00] shape as START/PAUSE/STOP.
  static _SPEED_CS_BASE_VAL = 2;
  static _SPEED_CS_BASE = [0xbe, 0x98];
  static _SPEED_CS_BITS = [
    [1, [0x95, 0xe9]],
    [2, [0x65, 0x95]],
    [4, [0x85, 0x6c]],
    [8, [0x0a, 0xd9]],
    [16, [0x5b, 0xf4]],
    [32, [0xf9, 0xae]],
  ];
  static _SPEED_BYTE_MAX = 60; // = 6.0 km/h; matches the pad's real max speed

  static _speedChecksumBytes(speedByte) {
    const delta = speedByte ^ SPXBluetoothDriver._SPEED_CS_BASE_VAL;
    let cs = SPXBluetoothDriver._SPEED_CS_BASE.slice();
    for (const [bit, lv] of SPXBluetoothDriver._SPEED_CS_BITS) {
      if (delta & bit) {
        cs = [cs[0] ^ lv[0], cs[1] ^ lv[1]];
      }
    }
    return cs;
  }

  static _stuffByte(b) {
    // Any byte whose high nibble is 0xF gets split into [0xF0, low nibble]
    // to avoid colliding with the 0xF5/0xFA frame delimiters.
    if ((b & 0xf0) === 0xf0) return [0xf0, b & 0x0f];
    return [b];
  }

  static crc16(data) {
    let crc = 0xffff;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = (crc & 1) ? ((crc >>> 1) ^ 0xa327) : (crc >>> 1);
      }
    }
    return crc & 0xffff;
  }

  /** Build a framed command with CRC-16 + 0xF nibble stuffing. */
  static buildCommandFrame(cmdData) {
    const unstuffedLen = 3 + cmdData.length + 2 + 1;
    const preCrc = [0xf5, unstuffedLen, 0x00, ...cmdData];
    const crc = SPXBluetoothDriver.crc16(preCrc);
    const cs = [
      ...SPXBluetoothDriver._stuffByte(crc & 0xff),
      ...SPXBluetoothDriver._stuffByte((crc >>> 8) & 0xff),
    ];
    if (cs.length > 2) preCrc[1] = unstuffedLen + (cs.length - 2);
    return [...preCrc, ...cs, 0xfa];
  }

  static buildSetSpeedFrame(speedByte, action = 0x01) {
    const body = [0x15, action, speedByte, 0x00];
    const csRaw = SPXBluetoothDriver._speedChecksumBytes(speedByte);
    const cs = csRaw.flatMap(SPXBluetoothDriver._stuffByte);
    const payload = [...body, ...cs];
    // Frame total length (matches captured LEN byte convention): header(3) + payload + trailer(1)
    const totalLen = 3 + payload.length + 1;
    return [0xf5, totalLen, 0x00, ...payload, 0xfa];
  }

  /**
   * Set speed in km/h — confirmed against two captured official-app
   * sessions covering the pad's full real speed range (raw byte 0-60,
   * i.e. 0.0-6.0 km/h at this pad's byte-per-0.1km/h convention).
   * Requests outside that range are clamped and logged rather than sent
   * with an unverified checksum.
   */
  async setTargetSpeed(speedKmh) {
    if (this.isSimulating) return true;

    const raw = Math.round(speedKmh * 10);
    if (raw < 0 || raw > SPXBluetoothDriver._SPEED_BYTE_MAX) {
      this.log(`Speed control (${speedKmh.toFixed(1)} km/h → raw ${raw}) is outside the confirmed ` +
        `checksum range (0-${SPXBluetoothDriver._SPEED_BYTE_MAX}, i.e. 0.0-6.0 km/h). Not sending — ` +
        `would likely be silently ignored by the pad with a wrong checksum.`, 'warn');
      return false;
    }

    const frame = SPXBluetoothDriver.buildSetSpeedFrame(raw, 0x01);
    return await this.sendFrame(frame, `Set Speed ${speedKmh.toFixed(1)} km/h (raw ${raw})`);
  }

  static VIBRATE_MODES = {
    1: 'Light',
    2: 'Strong',
    3: 'Light Wave',
    4: 'Strong Wave',
  };

  static VIBRATE_INTENSITY = 0x01;

  /**
   * Start or switch a vibration mode (1–4). Standby only.
   * Official-app setShakeCtrl is [0x16, mode, intensity]. The first live
   * test sent [0x16, 0x01, N] so every button was mode 1 (Light) at
   * different intensities — they felt the same. Mode now goes in byte 2.
   */
  async setVibrate(mode) {
    const clamped = Math.max(1, Math.min(4, mode | 0));
    if (this._beltState === SPXBluetoothDriver.BELT_STATE.RUNNING) {
      this.log('Vibrate blocked: belt is running. Stop walking first.', 'warn');
      return false;
    }

    if (this.isSimulating) {
      this.vibrateLevel = clamped;
      this.log(`Vibrate ${SPXBluetoothDriver.VIBRATE_MODES[clamped]} (sim)`, 'success');
      return true;
    }

    const ok = await this.sendFrame(
      SPXBluetoothDriver.buildCommandFrame([0x16, clamped, SPXBluetoothDriver.VIBRATE_INTENSITY]),
      `Vibrate ${SPXBluetoothDriver.VIBRATE_MODES[clamped]}`
    );
    if (ok) this.vibrateLevel = clamped;
    return ok;
  }

  async stopVibrate() {
    if (this.isSimulating) {
      this.vibrateLevel = 0;
      this.log('Vibrate off (sim)', 'success');
      return true;
    }

    // Always send off — UI state can lag the pad. 0x16 off first, then the
    // confirmed belt STOP frame which also halts the vibration motor.
    const off = await this.sendFrame(
      SPXBluetoothDriver.buildCommandFrame([0x16, 0x00, 0x00]),
      'Vibrate Off'
    );
    await this.sendFrame(SPXBluetoothDriver.FRAME.STOP, 'Stop (vibrate halt)');
    this.vibrateLevel = 0;
    return off;
  }

  /**
   * Decode incoming RM01 telemetry notifications
   */
  handleNotification(event) {
    const dv = event.target.value;
    if (!dv || dv.byteLength === 0) return;

    const raw = Array.from(new Uint8Array(dv.buffer));
    const hex = raw.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    this.log(`RX: ${hex}`);
    this._lastRaw = raw;

    // Detect the 3-byte handshake challenge: 0x12 0x13 0x14
    if (raw.length === 3 && raw[0] === 0x12 && raw[1] === 0x13 && raw[2] === 0x14) {
      this.log('  ↳ Handshake challenge received! Sending confirmed ACK...', 'warn');
      this.sendFrame(SPXBluetoothDriver.FRAME.HANDSHAKE_ACK, 'Handshake ACK').then(() => {
        // Mode-select is sent once, right after the handshake ACK, matching
        // the official app's captured sequence.
        return this.sendFrame(SPXBluetoothDriver.FRAME.MODE_SELECT, 'Mode Select');
      }).then(() => {
        this._startHeartbeat();
      });
      return;
    }

    // Decode the 20-byte live status/telemetry frame (TYPE=0x18)
    if (raw[0] === 0xf5 && raw[1] === 0x18 && raw.length === 20) {
      const beltState = raw[6];
      const steps = raw[10];

      if (beltState !== this._beltState) {
        this.log(`  🎉 Belt state changed: 0x${this._beltState.toString(16)} → 0x${beltState.toString(16)}`, 'success');
        this._beltState = beltState;
      }

      const isRunning = beltState === SPXBluetoothDriver.BELT_STATE.RUNNING;
      this.log(`  → state=0x${beltState.toString(16)} (${isRunning ? 'RUNNING' : 'idle/transition'}) steps=${steps}`, 'success');

      this.notifyTelemetry({
        beltState,
        isRunning,
        steps,
        timestamp: Date.now(),
      });
      return;
    }

    // Any other frame (e.g. the one-time device-info dump right after
    // connect, or ACK frames for start/pause/stop/mode) — logged above,
    // nothing further to decode yet.
  }

  onDisconnected() {
    this.isConnected = false;
    this._stopHeartbeat();
    this._beltState = 0;
    this.vibrateLevel = 0;
    this.log("Device disconnected.", "warn");
    this.notifyStatus('disconnected', null);
  }

  registerTelemetryListener(cb) { this.onTelemetryCallbacks.push(cb); }
  registerStatusListener(cb) { this.onStatusCallbacks.push(cb); }
  notifyTelemetry(data) { this.onTelemetryCallbacks.forEach(cb => cb(data)); }
  notifyStatus(s, n) { this.onStatusCallbacks.forEach(cb => cb(s, n)); }
}

window.spxBleDriver = new SPXBluetoothDriver();
