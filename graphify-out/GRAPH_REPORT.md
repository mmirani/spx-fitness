# Graph Report - SPX Fitness  (2026-09-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 114 nodes · 177 edges · 12 communities (4 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `84873159`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SPXBluetoothDriver
- TreadmillEngine
- SPX Fitness — Walking Pad Controller
- SPXSoundEffects
- WorkoutProgramEngine
- SPXChartVisualizer
- sniff_spx.py
- app.js
- derive_checksum.py
- parse_btsnoop.py
- capture_runner.sh
- capture_spx_ble.sh

## God Nodes (most connected - your core abstractions)
1. `SPXBluetoothDriver` - 23 edges
2. `TreadmillEngine` - 20 edges
3. `SPXSoundEffects` - 11 edges
4. `WorkoutProgramEngine` - 10 edges
5. `SPX Fitness — Walking Pad Controller` - 7 edges
6. `Architecture` - 6 edges
7. `SPXChartVisualizer` - 5 edges
8. `main()` - 4 edges
9. `ts()` - 4 edges
10. `rx()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (12 total, 8 thin omitted)

### Community 2 - "SPX Fitness — Walking Pad Controller"
Cohesion: 0.14
Nodes (13): Architecture, Constraints, File Map, Hardware — SPERAX_RM01, js/app.js, js/ble.js — SPXBluetoothDriver (window.spxBleDriver), js/charts.js — SpeedChart, js/programs.js — ProgramEngine (window.spxPrograms) (+5 more)

### Community 6 - "sniff_spx.py"
Cohesion: 0.67
Nodes (5): main(), SPERAX_RM01 BLE Handshake Probe ================================ Focuses on…, rx(), ts(), tx()

### Community 8 - "derive_checksum.py"
Cohesion: 0.60
Nodes (3): predict(), solve_bit(), xorb()

### Community 9 - "parse_btsnoop.py"
Cohesion: 0.50
Nodes (3): main(), parse_btsnoop(), Minimal btsnoop HCI log parser focused on extracting BLE ATT layer Write…

## Knowledge Gaps
- **12 isolated node(s):** `capture_runner.sh script`, `capture_spx_ble.sh script`, `Constraints`, `File Map`, `js/app.js` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 41 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `capture_runner.sh script`, `capture_spx_ble.sh script`, `Constraints` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SPX Fitness — Walking Pad Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._