"""Recovered CPU dormer-hole bin upload; no emulator or source-binary dependency.

Original build 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
0x101150834..0x101150ac8 selects cells and copies records;
Rectangle2d::aabb 0x102006fe0..0x102007024 supplies its f32 bounds.
Matches the existing zero-initialized/preallocated upload adapter, not ECS order:
caller entry order then file record order is retained, including duplicates.
The native buffer has 225 bins, 50 records/bin, but admits only the first 49.
Geometry uses x/z, width/depth and orientation fields. All other bits (including
owner slot, cubic taper and padding) are copied without interpretation.
"""
from pathlib import Path
import hashlib
import json
import math
import struct

BINARY_SHA256 = '4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a'
GRID_SIZE = 15
BIN_CAPACITY = 50
ADMITTED_COUNT = 49
RECORD_SIZE = 48
CELL_WIDTH = struct.unpack('<f', bytes.fromhex('abaa0a41'))[0]


def _f32(value):
    try:
        result = struct.unpack('<f', struct.pack('<f', value))[0]
    except OverflowError as error:
        raise ValueError('Dormer bin geometry exceeds finite f32 domain') from error
    if not math.isfinite(result):
        raise ValueError('Dormer bin geometry requires finite f32 intermediates')
    return result


def _index(value):
    # FCVTMS W saturates signed i32 after floor; Python ints do not overflow.
    value = math.floor(_f32(_f32(value + 65.0) / CELL_WIDTH))
    return max(-0x80000000, min(0x7fffffff, value))


def selected_bins(record):
    """Original inclusive AABB selection; returns row-major spatial bin indices."""
    if len(record) != RECORD_SIZE:
        raise ValueError('Dormer hole record must contain exactly 48 bytes')
    values = struct.unpack('<12f', record)
    x, z, width, depth, ox, oz = [values[i] for i in (0, 2, 4, 6, 8, 9)]
    if not all(math.isfinite(v) for v in (x, z, width, depth, ox, oz)):
        raise ValueError('Dormer geometry fields must be finite')
    if width < 0 or depth < 0:
        raise ValueError('Dormer width/depth must be nonnegative')
    half_width, half_depth = _f32(width * .5), _f32(depth * .5)
    dx = _f32(_f32(half_width * abs(ox)) + _f32(half_depth * abs(oz)))
    dz = _f32(_f32(half_depth * abs(ox)) + _f32(half_width * abs(oz)))
    xmin, zmin = max(0, _index(_f32(x - dx))), max(0, _index(_f32(z - dz)))
    xmax, zmax = min(14, _index(_f32(x + dx))), min(14, _index(_f32(z + dz)))
    return [row * GRID_SIZE + col for row in range(zmin, zmax + 1)
            for col in range(xmin, xmax + 1)]


def encode(records):
    """Return (counts900, holes540000); retain original bytes and first-49 policy."""
    counts = [0] * (GRID_SIZE * GRID_SIZE)
    payload = bytearray(GRID_SIZE * GRID_SIZE * BIN_CAPACITY * RECORD_SIZE)
    for record in records:
        for index in selected_bins(record):
            count = counts[index]
            if count == ADMITTED_COUNT:
                continue
            offset = (index * BIN_CAPACITY + count) * RECORD_SIZE
            payload[offset:offset + RECORD_SIZE] = record
            counts[index] = count + 1
    return struct.pack('<225I', *counts), bytes(payload)


def write(entries, output, prefix='unit'):
    """Read [{file: path, ...}] in order and write <prefix>.counts/holes.bin.

    Extra provenance fields are retained by their existing owner and do not
    change selection. Slots inside raw48 are not spatial-bin indices. Reject
    malformed file stride before writing either output; empty input is valid.
    """
    if not isinstance(prefix, str) or not prefix or Path(prefix).name != prefix:
        raise ValueError('prefix must be a nonempty filename component')
    records = []
    for entry in entries:
        raw = Path(entry['file']).read_bytes()
        if len(raw) % RECORD_SIZE:
            raise ValueError('Dormer hole file size must be a multiple of 48')
        records.extend(raw[i:i + RECORD_SIZE] for i in range(0, len(raw), RECORD_SIZE))
    counts, payload = encode(records)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / (prefix + '.counts.bin')).write_bytes(counts)
    (output / (prefix + '.holes.bin')).write_bytes(payload)
    result = {'name': prefix, 'implementation': 'recovered-cpu-dormer-bins-v1',
              'binary_sha256': BINARY_SHA256, 'input_count': len(records),
              'occupied_bins': [{'bin': i, 'count': n} for i, n in enumerate(struct.unpack('<225I', counts)) if n],
              'counts_sha256': hashlib.sha256(counts).hexdigest(),
              'holes_sha256': hashlib.sha256(payload).hexdigest()}
    (output / 'native-bin-report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result
