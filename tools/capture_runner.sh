#!/bin/bash
echo "=== Monitoring Runner (SPX Fitness) BLE activity ==="
echo "Open SPX app and use the pad. Press Ctrl+C when done."
log stream --process Runner --level debug 2>/dev/null | \
  grep -iE "ble|bluetooth|gatt|fff|write|send|characteristic|0x[0-9a-f]{2}" | \
  grep -v "description\|NSString\|UIKit\|Animation\|Layout\|constraint"
