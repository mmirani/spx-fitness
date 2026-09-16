#!/opt/homebrew/bin/python3
"""
SPERAX_RM01 BLE Handshake Probe
================================
Focuses on responding to the 0x12 0x13 0x14 init packet with different
handshake responses to find the unlock sequence.
Run: /opt/homebrew/bin/python3 tools/sniff_spx.py
"""
import asyncio, sys, time
from bleak import BleakScanner, BleakClient

DEVICE_NAME  = "SPERAX_RM01"
NOTIFY_UUID  = "0000fff1-0000-1000-8000-00805f9b34fb"
WRITE_UUID   = "0000fff2-0000-1000-8000-00805f9b34fb"

log = []
last_rx = None
rx_changed = False

def ts():
    return time.strftime("%H:%M:%S.") + f"{int(time.time()*1000)%1000:03d}"

def rx(sender, data: bytearray):
    global last_rx, rx_changed
    h = " ".join(f"0x{b:02x}" for b in data)
    print(f"[{ts()}] RX ({len(data)}B): {h}")
    log.append(("RX", bytes(data)))
    if last_rx is not None and bytes(data) != last_rx:
        rx_changed = True
        print(f"  *** RESPONSE CHANGED! ***")
    last_rx = bytes(data)

async def tx(client, label, data):
    h = " ".join(f"0x{b:02x}" for b in data)
    print(f"[{ts()}] TX [{label}]: {h}")
    await client.write_gatt_char(WRITE_UUID, bytes(data), response=False)
    log.append(("TX", bytes(data)))

async def main():
    print(f"[{ts()}] Scanning for {DEVICE_NAME}...")
    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=20.0)
    if not device:
        print("NOT FOUND.")
        sys.exit(1)
    print(f"[{ts()}] Found: {device.name}")

    async with BleakClient(device, timeout=10.0) as client:
        print(f"[{ts()}] Connected!")
        await client.start_notify(NOTIFY_UUID, rx)

        # Wait for 0x12 0x13 0x14 init packet
        print(f"[{ts()}] Waiting for init packet (0x12 0x13 0x14)...")
        await asyncio.sleep(1.5)

        # -- Handshake probe battery --
        # Each attempt: send a handshake candidate, then a walk start command,
        # then check if device response changes

        handshake_candidates = [
            # 1. Echo back the init bytes raw
            ("Echo 12 13 14",       [0x12, 0x13, 0x14]),
            # 2. Wrapped in frame format
            ("Frame 12 13 14",      [0xf5, 0x12, 0x13, 0x14, (0x12+0x13+0x14)&0xff, 0xfa]),
            # 3. Acknowledge with 0x00
            ("ACK 00",              [0xf5, 0x00, 0x00, 0x00, 0x00, 0xfa]),
            # 4. Init response pattern (0x12^0xff etc)
            ("XOR FF",              [0xed, 0xec, 0xeb]),
            # 5. Common "unlock" magic for Chinese BLE pads
            ("Unlock f5 aa",        [0xf5, 0xaa, 0x01, 0x00, 0xab, 0xfa]),
            # 6. Another common pattern
            ("Init f5 a0 00",       [0xf5, 0xa0, 0x00, 0x00, 0xa0, 0xfa]),
            # 7. App-mode set (seen in KingSmith variants)
            ("AppMode f5 a6 01",    [0xf5, 0xa6, 0x01, 0x00, 0xa7, 0xfa]),
            # 8. Walking mode ON (different byte position)
            ("Walk ON f5 01 01",    [0xf5, 0x01, 0x01, 0x00, 0x02, 0xfa]),
            # 9. What if CS is XOR not ADD?
            ("Start XOR-cs",        [0xf5, 0xa1, 0x01, 0x00, 0xa0, 0xfa]),
            # 10. Longer frame with len byte
            ("8B Start",            [0xf5, 0x08, 0xa1, 0x01, 0x00, 0x00, 0xaa, 0xfa]),
        ]

        for i, (label, hs) in enumerate(handshake_candidates):
            print(f"\n[{ts()}] --- Probe {i+1}/{len(handshake_candidates)}: {label} ---")
            await tx(client, f"HS:{label}", hs)
            await asyncio.sleep(0.5)
            # Follow up with walk start
            await tx(client, "Start", [0xf5, 0xa1, 0x01, 0x00, 0xa2, 0xfa])
            await asyncio.sleep(1.5)
            if rx_changed:
                print(f"  !!! DEVICE RESPONDED DIFFERENTLY AFTER: {label} !!!")

        print(f"\n[{ts()}] All probes done. Watching for 10s more...")
        try:
            for _ in range(10):
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            pass

        await client.stop_notify(NOTIFY_UUID)

    print(f"\n{'='*50}")
    print(f"{len(log)} frames. RX changed: {rx_changed}")
    print('='*50)
    for d, f in log:
        print(f"  {d}: {' '.join(f'0x{b:02x}' for b in f)}")

if __name__ == "__main__":
    asyncio.run(main())
