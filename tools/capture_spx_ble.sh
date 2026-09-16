#!/bin/bash
# Run this BEFORE opening the SPX Fitness app
# It captures all CoreBluetooth GATT write events in real time
# Usage: bash tools/capture_spx_ble.sh 2>&1 | tee /tmp/spx_ble_capture.txt

echo "=== SPX BLE Capture Started at $(date) ==="
echo "Now open the SPX Fitness app, connect, and start/stop the pad."
echo "Press Ctrl+C when done."
echo ""

# Capture CoreBluetooth subsystem logs at debug level
# Filter for GATT write operations and hex data
log stream \
  --predicate 'subsystem == "com.apple.bluetooth" OR subsystem CONTAINS "corebluetooth" OR process == "Runner" OR process == "bluetoothd"' \
  --level debug \
  2>/dev/null | grep -iE "write|send|gatt|fff[012]|0xf5|0xfa|characteristic|data|byte|packet|cmd|command" 
