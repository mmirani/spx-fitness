#!/usr/bin/env python3
"""
Minimal btsnoop HCI log parser focused on extracting BLE ATT layer
Write Commands / Write Requests / Handle Value Notifications, and
correlating them to the SPERAX_RM01 device via LE Connection Complete
events (BD_ADDR) and any HCI/GAP name resolution we can find.
"""
import struct
import sys

BTSNOOP_HDR_LEN = 16  # 8 magic + 4 version + 4 datalink

def parse_btsnoop(path):
    with open(path, 'rb') as f:
        data = f.read()

    magic = data[0:8]
    assert magic == b'btsnoop\x00', f"bad magic: {magic}"
    version, datalink = struct.unpack('>II', data[8:16])
    print(f"btsnoop version={version} datalink={datalink}")

    offset = BTSNOOP_HDR_LEN
    records = []
    while offset < len(data):
        if offset + 24 > len(data):
            break
        orig_len, incl_len, flags, drops, ts = struct.unpack('>IIIIq', data[offset:offset+24])
        offset += 24
        pkt = data[offset:offset+incl_len]
        offset += incl_len
        records.append((flags, ts, pkt))
    return records

def hci_event_name(code):
    names = {
        0x01: 'Inquiry Complete', 0x03: 'Connection Complete', 0x3E: 'LE Meta Event',
    }
    return names.get(code, f'0x{code:02x}')

def main(path):
    records = parse_btsnoop(path)
    print(f"{len(records)} HCI records total")

    # Track LE connection handle -> peer address
    handle_to_addr = {}
    addr_to_name = {}

    att_events = []  # (ts, direction, handle, att_opcode, att_handle, payload)

    for flags, ts, pkt in records:
        if len(pkt) < 1:
            continue
        pkt_type = pkt[0]
        body = pkt[1:]

        # HCI Event packet
        if pkt_type == 0x04 and len(body) >= 2:
            evt_code = body[0]
            plen = body[1]
            params = body[2:2+plen]

            # LE Meta Event (0x3e), subevent LE Connection Complete (0x01) or Enhanced (0x0a)
            if evt_code == 0x3e and len(params) >= 1:
                subevent = params[0]
                if subevent in (0x01, 0x0a) and len(params) >= 10:
                    # status(1) handle(2) role(1) peer_addr_type(1) peer_addr(6) ...
                    status = params[1]
                    handle = struct.unpack('<H', params[2:4])[0]
                    peer_addr_type = params[5]
                    peer_addr = params[6:12]
                    addr_str = ':'.join(f'{b:02x}' for b in reversed(peer_addr))
                    handle_to_addr[handle] = addr_str
                    print(f"[{ts}] LE Connection Complete: handle=0x{handle:04x} peer={addr_str} status={status}")

            # Disconnection complete (0x05)
            if evt_code == 0x05 and len(params) >= 3:
                status = params[0]
                handle = struct.unpack('<H', params[1:3])[0]
                print(f"[{ts}] Disconnection Complete: handle=0x{handle:04x}")

            # Extended inquiry result / advertising report -> try to grab device names
            if evt_code == 0x3e and len(params) >= 1 and params[0] == 0x02:
                # LE Advertising Report(s) - parse minimal: num_reports(1) then per-report fields
                try:
                    num_reports = params[1]
                    p = params[2:]
                    for _ in range(num_reports):
                        # event_type(1) addr_type(1) addr(6) data_len(1) data(data_len) rssi(1) -- simplified single-report parse
                        pass
                except Exception:
                    pass

        # ACL Data packet (pkt_type == 0x02)
        if pkt_type == 0x02 and len(body) >= 4:
            handle_flags = struct.unpack('<H', body[0:2])[0]
            handle = handle_flags & 0x0FFF
            acl_len = struct.unpack('<H', body[2:4])[0]
            acl_data = body[4:4+acl_len]
            if len(acl_data) < 4:
                continue
            l2cap_len = struct.unpack('<H', acl_data[0:2])[0]
            l2cap_cid = struct.unpack('<H', acl_data[2:4])[0]
            att_payload = acl_data[4:4+l2cap_len]

            # ATT protocol is usually CID 0x0004
            if l2cap_cid == 0x0004 and len(att_payload) >= 1:
                att_opcode = att_payload[0]
                direction = 'RX(device->host)' if (flags & 0x01) else 'TX(host->device)'
                att_events.append((ts, direction, handle, att_opcode, att_payload))

    print(f"\nHandle->Addr map: {handle_to_addr}")
    print(f"\n{len(att_events)} ATT-layer packets found\n")

    # ATT opcodes of interest
    OP_WRITE_REQ = 0x12
    OP_WRITE_CMD = 0x52
    OP_WRITE_RSP = 0x13
    OP_HANDLE_VALUE_NOTIF = 0x1b
    OP_HANDLE_VALUE_IND = 0x1d
    OP_READ_REQ = 0x0a
    OP_READ_RSP = 0x0b

    name_map = {
        OP_WRITE_REQ: 'WRITE_REQ',
        OP_WRITE_CMD: 'WRITE_CMD (no resp)',
        OP_WRITE_RSP: 'WRITE_RSP',
        OP_HANDLE_VALUE_NOTIF: 'NOTIFICATION',
        OP_HANDLE_VALUE_IND: 'INDICATION',
        OP_READ_REQ: 'READ_REQ',
        OP_READ_RSP: 'READ_RSP',
    }

    interesting = {OP_WRITE_REQ, OP_WRITE_CMD, OP_HANDLE_VALUE_NOTIF, OP_HANDLE_VALUE_IND}

    print("=== Interesting ATT traffic (writes + notifications) ===")
    for ts, direction, handle, opcode, payload in att_events:
        if opcode in interesting:
            att_handle = struct.unpack('<H', payload[1:3])[0] if len(payload) >= 3 else None
            value = payload[3:] if len(payload) > 3 else b''
            hexval = ' '.join(f'0x{b:02x}' for b in value)
            addr = handle_to_addr.get(handle, '?')
            print(f"[ts={ts}] conn=0x{handle:04x} peer={addr} {direction:20s} {name_map.get(opcode, hex(opcode)):15s} att_handle=0x{att_handle:04x} value=[{hexval}]")

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'extracted/FS/data/log/bt/btsnoop_hci.log')
