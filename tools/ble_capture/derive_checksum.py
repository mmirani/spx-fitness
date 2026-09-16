frames_raw = {
0x02:['0xbe','0x98'],0x03:['0x2b','0x71'],0x04:['0x5e','0x61'],0x05:['0xcb','0x88'],
0x06:['0x3b','0xf0','0x4'],0x07:['0xae','0x1d'],0x08:['0xd1','0xd4'],0x09:['0x44','0x3d'],
0x0a:['0xb4','0x41'],0x0b:['0x21','0xa8'],0x0c:['0x54','0xb8'],0x0d:['0xc1','0x51'],
0x0e:['0x31','0x2d'],0x0f:['0xa4','0xc4'],0x10:['0x80','0xf0','0x9'],0x11:['0x15','0x10'],
0x12:['0xe5','0x6c'],0x13:['0x70','0x85'],0x14:['0x5','0x95'],0x15:['0x90','0x7c'],
0x16:['0x60','0x0'],0x17:['0xf0','0x5','0xe9'],0x18:['0x8a','0x20'],0x19:['0x1f','0xc9'],
0x1a:['0xef','0xb5'],0x1b:['0x7a','0x5c'],0x1c:['0xf','0x4c'],0x1d:['0x9a','0xa5'],
0x1e:['0x6a','0xd9'],0x1f:['0xf0','0xf','0x30'],0x20:['0x22','0xa3'],0x21:['0xb7','0x4a'],
0x22:['0x47','0x36'],0x23:['0xd2','0xdf'],0x24:['0xa7','0xcf'],0x25:['0x32','0x26'],
0x26:['0xc2','0x5a'],0x27:['0x57','0xb3'],0x28:['0x28','0x7a'],0x29:['0xbd','0x93'],
0x2a:['0x4d','0xef'],0x2b:['0xd8','0x6'],0x2c:['0xad','0x16'],0x2d:['0x38','0xf0','0xf'],
0x2e:['0xc8','0x83'],0x2f:['0x5d','0x6a'],0x30:['0x79','0x57'],0x31:['0xec','0xbe'],
0x32:['0x1c','0xc2'],0x33:['0x89','0x2b'],0x34:['0xf0','0xc','0x3b'],0x35:['0x69','0xd2'],
0x36:['0x99','0xae'],0x37:['0xc','0x47'],0x38:['0x73','0x8e'],0x39:['0xe6','0x67'],
0x3a:['0x16','0x1b'],0x3b:['0x83','0xf0','0x2'],0x3c:['0xf0','0x6','0xe2'],
}

def unstuff(hexstrs):
    b = [int(x,16) for x in hexstrs]
    out = []
    i = 0
    while i < len(b):
        if b[i] == 0xf0 and i+1 < len(b):
            out.append(0xf0 | b[i+1])
            i += 2
        else:
            out.append(b[i])
            i += 1
    return out

crc = {}
for speed, raw in frames_raw.items():
    u = unstuff(raw)
    assert len(u) == 2, f"speed={speed} unstuff failed: {u} from {raw}"
    crc[speed] = tuple(u)

for s in sorted(crc):
    print(f"{s:#04x}: {crc[s]}")

def xorb(a,b): return (a[0]^b[0], a[1]^b[1])

BASE = 2
base_cs = crc[BASE]
# derive per-bit deltas L1,L2,L4,L8,L16,L32 using pairs that isolate each bit if possible
# use base=2 (0b000010). find speeds that differ from base by single bit.
bits_needed = [1,2,4,8,16,32]
L = {}
for bit in bits_needed:
    target = BASE ^ bit
    if target in crc:
        L[bit] = xorb(crc[target], base_cs)
    else:
        L[bit] = None

print("\nDirect single-bit deltas (None = need combo):")
for bit in bits_needed:
    print(bit, L[bit])

# For any missing bit, try to solve via combos with known deltas
# e.g. if L[16] missing, find speed = BASE ^ 16 ^ (other known bits) present in crc
def solve_bit(bit):
    if L.get(bit):
        return L[bit]
    for other in crc:
        delta = other ^ BASE ^ bit
        # delta should only involve already-solved bits
        if delta == 0:
            return xorb(crc[other], base_cs)
        # decompose delta into known bits
        remaining = delta
        acc = base_cs
        ok = True
        for b2 in bits_needed:
            if remaining & b2:
                if L.get(b2) is None:
                    ok = False
                    break
                acc = xorb(acc, L[b2])
                remaining &= ~b2
        if ok and remaining == 0:
            return xorb(crc[other], acc)
    return None

for bit in bits_needed:
    if L[bit] is None:
        L[bit] = solve_bit(bit)

print("\nFinal per-bit deltas:")
for bit in bits_needed:
    print(bit, L[bit])

def predict(speed):
    delta = speed ^ BASE
    cs = base_cs
    for bit in bits_needed:
        if delta & bit:
            cs = xorb(cs, L[bit])
    return cs

print("\nVerification against all captured frames:")
all_ok = True
for s in sorted(crc):
    p = predict(s)
    ok = (p == crc[s])
    if not ok: all_ok = False
    print(f"speed={s:#04x} known={crc[s]} predicted={p} match={ok}")
print("ALL MATCH:", all_ok)
