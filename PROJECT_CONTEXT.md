# SPX Fitness — Walking Pad Controller

Canonical project: /Users/pixelahk/Projects/SPX Fitness
Active app: index.html + css/style.css + js/*.js (vanilla JS, no build step)
Served at: http://localhost:8125 (Python http.server, daemon task)
Browser: Chrome or Edge only — Web Bluetooth requires localhost or https. Safari unsupported.
Do NOT use port 8000 (reserved) or 8124 (seeker-of-light). Do NOT stop unrelated servers.

---

## Hardware — SPERAX_RM01

| Property            | Value |
|---------------------|-------|
| Device name         | SPERAX_RM01 |
| BLE ID              | SWnhUwLr1dszcq8Fb4Pypw== |
| Control service     | 0000fff0-0000-1000-8000-00805f9b34fb |
| Write characteristic| 0000fff2-0000-1000-8000-00805f9b34fb (WRITE_NO_RESP) |
| Notify characteristic| 0000fff1-0000-1000-8000-00805f9b34fb (NOTIFY, READ) |
| Device Info service | 0000180a-0000-1000-8000-00805f9b34fb |

### Protocol — Under Reverse Engineering

Frame format (received from device):  0xf5 ... 0xfa
Handshake on connect (device → app):  0x12 0x13 0x14  (3 bytes, meaning TBD)
Periodic status heartbeat (device → app):
  0xf5 0x08 0x00 0x0e 0x02 0x14 0x47 0xfa

Decoded hypotheses:
  byte[0] = 0xf5   start
  byte[1] = 0x08   frame length OR message type
  byte[2] = 0x00   belt speed × 10 (0 = stopped)
  byte[3] = 0x0e   unknown (14 decimal)
  byte[4] = 0x02   unknown
  byte[5] = 0x14   unknown (20 decimal)
  byte[6] = 0x47   unknown (checksum formula not confirmed)
  byte[7] = 0xfa   end

Commands attempted (all received by device, NO belt movement):
  0xf5 0xa3 0x00 0x00 0xa3 0xfa  Ping/Status
  0xf5 0xa0 0x01 0x00 0xa1 0xfa  Mode = Manual
  0xf5 0xa1 0x01 0x00 0xa2 0xfa  Start Belt
  0xf5 0xa2 0x14 0x00 0xb6 0xfa  Speed 2.0 km/h

Current hypothesis: opcodes 0xa0-0xa3 are wrong for this firmware revision.
The device IS receiving writes (responds to every packet) but ignores unknown opcodes.

Next steps:
  1. Try 8-byte command frames (include length byte 0x08 in position 1)
  2. Try opcodes in range 0x01-0x0f (lower byte range)
  3. Try 0x12/0x14 framing based on handshake pattern
  4. Check device needs physical safety key / ON switch before accepting motor commands
  5. Sniff the official Sperax/FitShow app via Android + nRF Connect Logger

---

## File Map

  index.html       Single-page app; tabs: Dashboard, Programs, History, Inspector
  css/style.css    Dark-mode design system; CSS custom properties; Inter font
  js/ble.js        SPXBluetoothDriver — GATT connect, frame builder, write, notify decode
  js/app.js        UI wiring; event listeners; localStorage workout history
  js/treadmill.js  TreadmillEngine state machine (IDLE/RUNNING/PAUSED/STOPPED)
  js/charts.js     SpeedChart — canvas real-time rolling speed graph (60 samples)
  js/programs.js   ProgramEngine — named interval workout programs

---

## Architecture

### js/ble.js — SPXBluetoothDriver (window.spxBleDriver)
  requestDevice()         Opens browser Bluetooth picker
  connectGATT()           Resolves 0xfff2 (write) + 0xfff1 (notify), starts notifications
  buildFrame(cmd,p1,p2)   Builds [0xf5, cmd, p1, p2, CS, 0xfa]; CS = (cmd+p1+p2) & 0xFF
  sendFrame(frame, label) writeValueWithoutResponse + TX log
  handleNotification(e)   Decodes RX bytes, fires telemetry callbacks
  sendDiagnosticPacket(t) Sends labelled test frames A-F
  start() / stop()        High-level start/stop (sets mode then sends start/stop command)
  setTargetSpeed(kmh)     Sends speed frame

### js/treadmill.js — TreadmillEngine (window.spxTreadmill)
  Software workout model, no hardware access.
  States: IDLE → RUNNING → PAUSED → STOPPED
  Tracks: elapsed time, distance (km/mi), calories, steps, current/target speed
  subscribe(cb): snapshot callback every 500ms while running

### js/app.js
  Binds DOM → BLE driver + treadmill engine
  Manages: connect/simulate, start/pause/stop, speed +/-, presets, unit toggle
  localStorage key: spx_history (max 50 workouts)

### js/programs.js — ProgramEngine (window.spxPrograms)
  Named interval programs. Steps execute via treadmill.setTargetSpeed + bleDriver.setTargetSpeed

### js/charts.js — SpeedChart
  Real-time canvas speed graph, 60-sample rolling window

---

## UI Layout (index.html tabs)
  Dashboard  — live HUD + speed controls + preset buttons
  Programs   — interval program cards; selecting one auto-starts belt
  History    — localStorage workout log table
  Inspector  — raw BLE telemetry log + confirmed Start/Pause/Stop test buttons
              + Connect Sperax / Scan All / Simulator Mode buttons

---

## Constraints
  No build step — vanilla JS, ES modules loaded via <script type="module">
  No automated tests yet
  Web Bluetooth: Chrome/Edge only, localhost or https only
  LAN IP addresses (192.168.x.x) do NOT work for Web Bluetooth — localhost only
  BLE protocol CONFIRMED as of 2026-09-15 session 3 for handshake/start/pause/stop/
  heartbeat/status-decode (see Confirmed Protocol section below). Arbitrary SET
  SPEED is still unsolved — checksum algorithm unknown, no capture of speed +/-
  traffic exists yet.

---

## Session Log

2026-09-15
  Built project from scratch: full UI with dashboard, programs, history, inspector tabs.
  Confirmed BLE channel: service 0xfff0, write 0xfff2, notify 0xfff1.
  Captured handshake: 0x12 0x13 0x14 on connect.
  Captured status frame: 0xf5 0x08 0x00 0x0e 0x02 0x14 0x47 0xfa.
  Tried opcodes 0xa0/0xa1/0xa2/0xa3 — all TX success, zero belt response.
  STATUS: Protocol opcode set unknown. Next session: systematic opcode probe + 8-byte frame test.

2026-09-15 (session 2 — Copilot takeover, ran out of nRF/APK budget on prior tool)
  Verified server still running (Python http.server, port 8125), file map unchanged.
  Web search: no public repo documents "SPERAX_RM01" or an "SPX protocol" — this is
  genuinely un-reverse-engineered hardware. Confirmed opcode-guessing approach
  (0xa0-0xa3 sweep) is unlikely to succeed; walking-pad protocols in the wild
  (ph4-walkingpad/KingSmith) use totally different framing ([247,162,...,253]),
  so byte-guessing across vendors doesn't transfer.
  Attempted static reversal of the official Android app "SPX Fitness"
  (com.spreax.fitness202412, Xiamen Sperax Innovation Technology):
    - Got APK from user via on-device APK Extractor -> decompiled with jadx.
    - DISCOVERED: app is built with Flutter. BLE transport is the generic
      `flutter_blue_plus` plugin (com.lib.flutter_blue_plus.FlutterBluePlusPlugin) —
      it just relays hex strings from Dart to Android's writeCharacteristic().
      The actual protocol byte-building/checksum logic lives in compiled Dart
      AOT native code (libapp.so), NOT in readable Java/Kotlin.
    - The extracted APK was base-only (no arch split), so libapp.so wasn't even
      present; even with it, Dart AOT reversal (needs Blutter or similar) rarely
      yields exact byte arrays. CONCLUSION: static APK analysis is a dead end
      for this app. Do not re-attempt without a specific reason.
  PIVOT: live BLE capture is the only reliable path forward.
    Chosen method: nRF Connect for Mobile on the Android phone, run alongside/
    instead of the official app while operating the pad, to observe real
    handshake + start/stop/speed frames in both directions.
  STATUS: Waiting on live nRF Connect capture from user (in progress). Once
  captured frames are available, decode opcodes/checksum here and update
  js/ble.js + this doc with the confirmed protocol.

2026-09-15 (session 3 — BLE protocol cracked via HCI snoop capture)
  REVISED CAPTURE METHOD: nRF Connect can't work for sniffing because BLE only
  allows one active GATT connection — nRF Connect would have to BE the
  controller, not observe the official app. Instead used Android's built-in
  Bluetooth HCI snoop log: enabled Developer Options -> "Enable Bluetooth HCI
  snoop log", ran a full connect -> start -> speed-up -> speed-down -> pause ->
  stop -> disconnect sequence in the real official SPX Fitness app, then took
  an Android "Take bug report" (Developer options) and extracted
  FS/data/log/bt/btsnoop_hci.log from the resulting zip. No adb/root needed.
  Wrote a custom Python btsnoop parser (HCI ACL -> LE Connection Complete ->
  ATT Write/Notification decode) to pull out every byte the official app sent
  and received against the pad (peer 12:ed:00:40:41:a4, conn handle 0x0042).

  CONFIRMED PROTOCOL (all frames below are byte-for-byte real capture, not guesses):

  Frame shape: [0xf5] [TYPE] [0x00] ...payload... [1-2 checksum bytes] [0xfa]
  TYPE is an opcode/class id; for short command frames it happens to equal the
  frame's byte length, but the 20-byte status frame uses TYPE=0x18 (=24, not
  20), so TYPE is NOT a general length field — treat it as an opcode id only.

    Device handshake challenge (RX, fixed 3 bytes): 0x12 0x13 0x14
    Handshake ACK (TX):      0xf5 0x07 0x00 0x01 0x26 0xd8 0xfa
    Mode-select (TX, once):  0xf5 0x09 0x00 0x13 0x01 0x00 0x89 0xb8 0xfa
    Heartbeat/poll (TX, sent continuously ~every 150-200ms the whole session —
      required to keep the device publishing status notifications):
                              0xf5 0x08 0x00 0x19 0xf0 0x0a 0x59 0xfa
    Start belt (TX):          0xf5 0x0a 0x00 0x15 0x01 0x02 0x00 0xbe 0x98 0xfa
    Pause belt (TX):          0xf5 0x0a 0x00 0x15 0x02 0x00 0x00 0xc3 0x19 0xfa
    Stop belt (TX):           0xf5 0x0a 0x00 0x15 0x00 0x00 0x00 0xd3 0x01 0xfa
    (Other 0x15 sub-commands seen but not needed for v1: 01,04 / 01,05 / 01,06
    — likely auto-program step/intensity triggers, not investigated further.)
    RX ACKs echo back with a 0xd0 marker byte inserted after the reserved
    byte (e.g. TX "...15 01 02 00..." -> RX ack "...d0 15 01 00...").

  Status telemetry (RX, 20-byte frame, TYPE=0x18) — decoded by tabulating 54
  consecutive samples byte-by-byte across a full connect->start->walk->stop:
    byte[3]  = 0x19 constant, a field/request echo, NOT live data
    byte[6]  = BELT STATE. Values seen in order: 0x00 (idle) -> 0x13,0x12,
               0x11 (a "3-2-1" countdown, ~3 polls per step ~ matches the
               app's "3_2_1_go.mp3" audio) -> 0x10 (RUNNING, holds steady for
               the whole walk) -> 0x0f -> 0x01 -> 0x00 (stopping/pause
               transition). This is a state code, not a live speed value.
    byte[10] = STEP COUNTER — increments roughly once per second while
               byte[6]==0x10 (running), freezes on pause/stop.
    byte[17] = a slower-changing counter (0->1->3->4->6->5->3->1->0 across the
               session) — hypothesis: time-remaining-in-program-step or a
               distance/calorie accumulator. NOT confirmed, do not rely on it.
    All other bytes are 0x00 in every live sample except the very first
    status frame right after connect, which is structurally different
    (a8 27 10 02 00 03 3c 02 26 00 0a 01 04 in the trailing bytes) — likely a
    one-time device-info/config dump, not live telemetry.

  UNSOLVED: checksum/CRC. Tried 1-byte sum, 1-byte XOR, and ~13 standard
  CRC16 variants (CCITT-FALSE, XMODEM, MODBUS, ARC, Kermit, DNP, AUG-CCITT,
  Buypass, etc. via Python crcmod) against every plausible body-byte range
  (with/without leading 0xf5, LE/BE order) — none matched. Likely a
  proprietary/table-driven CRC. Practical impact: exact captured frames can
  be replayed verbatim (start/stop/pause/mode-set/heartbeat all work without
  needing to compute a new checksum), but arbitrary dynamic values (e.g. a
  chosen speed) cannot yet be encoded, because we don't have a formula.

  UNSOLVED: speed control. The single capture used only the pad's default
  speed the whole time (no +/- taps were exercised), so there's no byte-level
  evidence yet of which frame sets speed or how the value is encoded. NEXT
  CAPTURE NEEDED: repeat the HCI snoop capture while explicitly tapping
  speed +/- multiple times in the official app, to get multiple distinct
  speed values to diff against.

  IMPLEMENTED: js/ble.js rewritten to use these confirmed real frames.
  Handshake ACK + mode-select fire automatically on the 0x12/0x13/0x14
  challenge; a heartbeat timer replicates the app's continuous poll; start()/
  pause()/stop() send the exact real bytes; handleNotification() decodes belt
  state + step count from the 20-byte status frame. setTargetSpeed() is
  intentionally a documented no-op against real hardware until the speed
  frame is captured (previously it silently sent unproven guessed bytes,
  which is the exact bug this whole investigation was chasing). Old opcode-
  guessing UI (diagnostic packets A-F, probe groups G1-G5) removed and
  replaced with three "confirmed real command" test buttons in the
  Inspector tab (Start/Pause/Stop).

  STATUS: Core belt control (start/pause/stop) is real and should work
  against the physical device — needs live on-device verification (test at
  localhost:8125 with the pad connected). Speed control remains open pending
  a follow-up capture exercising +/- taps.

2026-09-15 (session 4 — headless testing, found & fixed 3 real bugs before hardware test)
  Could not test real Bluetooth from this sandbox (BLE access blocked), so
  installed Puppeteer and headlessly drove the actual app at localhost:8125
  end-to-end (dev server had stopped between sessions — restarted it), mocking
  the GATT write characteristic to capture exact bytes sent + decoding
  simulated notifications, to validate the JS logic before live hardware use.
  Found and fixed:
    1. `js/app.js` never declared `btnStart/btnPause/btnStop/btnSpeedUp/
       btnSpeedDown` (missing `document.getElementById(...)` assignments) —
       this threw "btnStart is not defined" on every page load and silently
       broke the entire DOMContentLoaded handler after that point. Pre-existing
       bug, unrelated to the BLE rewrite, but blocking every hardware button.
       FIXED: added the missing declarations.
    2. Duplicate/conflicting BLE calls: both `js/app.js`'s button handlers AND
       `js/treadmill.js`'s startSession()/pauseSession()/stopSession() were
       independently calling the real bleDriver commands. Real-world effect:
       clicking Start sent the real START frame TWICE; clicking Stop sent
       STOP three times. Worse, `treadmill.js`'s pauseSession() called
       `spxBleDriver.stop()` instead of `.pause()` — meaning the Pause button
       would have sent the real STOP command to the belt, not the distinct
       real PAUSE command. FIXED: removed the duplicate explicit bleDriver
       calls from app.js's start/pause/stop/speed handlers and the program-
       card handler, since treadmill.js already owns those calls (needed for
       the Programs auto-speed-change path); fixed treadmill.js's
       pauseSession() to call `.pause()`. Verified via mocked-writeChar
       headless test: one click now sends exactly the one correct confirmed
       frame per action.
    3. `index.html`'s new "confirmed real command" buttons used a `.confirmed-btn`
       class with no CSS rules, so they rendered at 0x0 size (unclickable,
       though present in DOM). FIXED: kept `.confirmed-btn` as the JS hook but
       also applied the existing `.diag-btn` class for actual styling/sizing.
  Verified via headless click-sweep (tabs, sim toggle, unit switch, preset
  speeds, confirmed Start/Pause/Stop buttons): zero console/page errors.
  Confirmed via mocked BLE write capture that Start/Pause/Stop now each send
  exactly one frame, byte-for-byte identical to the real captured protocol.
  STATUS: All discoverable bugs from static + headless testing are fixed.
  This is as far as testing can go without the physical pad — next step is a
  live test against real hardware at localhost:8125.

2026-09-16 (session 5 — live hardware test, dead-end detours, and the SET SPEED crack)
  Live test on the real pad confirmed Start/Pause/Stop now work correctly
  (belt turns on/off). Speed +/- did not move the belt — expected, since
  setTargetSpeed() was still an intentional no-op (see session 4).

  Two dead-end detours tried to avoid another phone HCI snoop capture:
    1. macOS `log stream --info --debug --predicate 'subsystem ==
       "com.apple.bluetooth"'` while running the official Mac app (Mac
       Catalyst build of the same Flutter app) — confirmed macOS NEVER logs
       raw ATT/GATT payload bytes at any log level (deliberate Apple privacy
       restriction; `log config --mode "private_data:on"` isn't supported on
       this macOS version either). Only connection/handle-level metadata is
       visible. Apple's real tool for this (PacketLogger) requires a signed-
       in Apple Developer account to download — not usable here.
    2. Built a custom CoreBluetooth peripheral emulator in Swift
       (tools if you want to resurrect: /tmp/spx_emulator/fake_rm01.swift,
       not persisted to the repo) that impersonates SPERAX_RM01 (same name +
       FFF0/FFF1/FFF2 UUIDs) so the real Mac app would connect to it and
       reveal raw write bytes directly in code. It compiled and successfully
       advertised (confirmed visible from a second device, e.g. a phone's BT
       scan) — but the Mac app never connected to it, because **both the
       emulator and the app run on the same Mac / same Bluetooth radio**,
       and CoreBluetooth on macOS won't let one local process discover
       another local process's own advertisement (self-connect isn't
       supported this way). Dead end for this specific use case; would only
       work with the app running on a genuinely separate device.

  Fell back to repeating the proven approach: a second Android HCI snoop
  capture, this time explicitly exercising speed +/- (up to 8, back down,
  then stop) in the real official app. This worked and cracked the
  checksum:

  CONFIRMED — SET SPEED / general belt-state frame:
    Shape:  0xf5 [LEN] 0x00 0x15 [ACTION] [SPEED] 0x00 [CHECKSUM bytes] 0xfa
    ACTION: 0x00 = stop, 0x01 = run at SPEED, 0x02 = pause
    (This clarifies that the previously-captured START/PAUSE/STOP frames
    were really just this same command with ACTION/SPEED = (1,2)/(2,0)/(0,0)
    — there's only one opcode family here, not three separate ones.)

    Checksum: a 2-byte value that is a pure GF(2)-linear function of the
    SPEED byte — i.e. crc(a) XOR crc(b) == L(a XOR b) held exactly across
    every pair of captured SPEED values (2,3,4,5,7,8), confirmed via an
    independent cross-check (L(6) == L(2) XOR L(4) predicted correctly
    without being used to derive either term). This let the per-bit
    contributions of SPEED bits 0,1,2,3 be solved directly by XOR-diffing
    the captured frames (see tools/ble_capture/derive_checksum.py) — no
    guessing or brute-forcing of a CRC polynomial was needed (~1M-combination
    brute force over standard CRC16 poly/init/refin/refout/xorout space
    found no match, so it's likely a nonstandard/table-based CRC, but the
    linear bit-diff trick sidesteps needing to know the actual algorithm).

    Confirmed range: SPEED byte 0-15 (bits 0-3). Bits 4+ (needed for SPEED
    values 16-63, i.e. higher km/h if the byte is speed_kmh*10) are NOT yet
    solved — would need one more capture exercising higher speeds.

    Byte-stuffing quirk: if a computed checksum byte's high nibble is 0xF
    (colliding with the 0xF5 header / 0xFA trailer), the device splits it
    into two bytes: [0xF0, byte & 0x0F]. Confirmed from the real captured
    SPEED=6 frame, whose checksum byte 0xf4 was transmitted as two bytes:
    0xf0 0x04 (frame length correspondingly 11 instead of the usual 10).

  IMPLEMENTED: js/ble.js now has SPXBluetoothDriver.buildSetSpeedFrame() and
  a real setTargetSpeed() that computes and sends the frame for SPEED byte
  0-15 (requests outside that range are clamped/rejected with a log
  message, not silently sent with a wrong checksum). Verified the frame
  builder reproduces all 7 known captured frames byte-for-byte (including
  the stuffed SPEED=6 case) via a standalone Node test.

  tools/ble_capture/decoded_session_2_speed.txt and derive_checksum.py
  persisted alongside the original session's capture artifacts.

  STATUS: Start/Pause/Stop confirmed working on real hardware. Speed control
  now has a real, checksummed implementation for the low end of the range
  (0.0-1.5 km/h @ x10 encoding) pending live verification and a follow-up
  capture to extend the confirmed checksum range to cover the app's full
  0.5-6.0 km/h speed range.

2026-09-16 (session 6 — SET SPEED fully cracked, full 0-6.0 km/h range confirmed)
  Live-tested the session-5 partial fix: Start/Pause/Stop and low-range
  speed control (0.0-1.5 km/h) worked correctly on the real belt. As
  expected, the 2.0/3.0/4.0 km/h quick-select presets did nothing, since
  they're above the previously-confirmed checksum range and were being
  safely blocked (not silently sent with a guessed/wrong checksum).

  Did a third Android HCI snoop capture, this time pushing speed+ all the
  way from 0 to the pad's real max (byte value 0x3c = 60 = 6.0 km/h) and
  back down. This yielded 61 distinct captured SPEED frames (0x00-0x3c),
  fully solving the remaining checksum bits (4 and 5) using the same
  GF(2)-linear bit-diffing technique from session 5 — every bit's
  contribution was solved directly from real captured frame pairs (no CRC
  algorithm/polynomial guessing needed) and the resulting model reproduces
  all 61 real frames byte-for-byte, including every byte-stuffed edge case
  (SPEED values 6, 16, 23, 31, 45, 52, 59, 60 all have a checksum byte
  whose high nibble is 0xF and get correctly split into two bytes).

  IMPLEMENTED: js/ble.js's SPXBluetoothDriver._SPEED_CS_BITS now has all 6
  bit-deltas (1,2,4,8,16,32), and _SPEED_BYTE_MAX raised from 15 to 60 (the
  pad's real max speed, 6.0 km/h). setTargetSpeed() now covers the pad's
  entire practical speed range with a fully verified checksum — no more
  "outside confirmed range" rejections for any speed the pad actually
  supports. Verified via a standalone Node test against a spread of both
  stuffed and unstuffed known frames across the whole range.

  tools/ble_capture/decoded_session_3_speed_full_range.txt and an updated
  derive_checksum.py (now solving 6 bits from 61 samples) persisted
  alongside the earlier capture artifacts.

  STATUS: The full confirmed protocol (handshake, mode-select, heartbeat,
  start/pause/stop, and now full-range speed control) is implemented in
  js/ble.js. Belt on/off and the low end of speed control are confirmed
  working live; the 2.0-6.0 km/h presets are implemented but not yet
  verified against the real pad — next step is a live re-test.
