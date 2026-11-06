"""Validate generated roof initial state without claiming captured GPU evidence.

The cell represents the design endpoint. Its renderer starts from initial64 and
runs the separately owned gravity timeline; no settled-state digest is inferred.
"""
import math
import re
import struct


def validate(value, cells, slot):
    from unit_metadata import roof_basis
    if not isinstance(value, dict) or set(value) != {'schema', 'records'} or value['schema'] != 'roof-design-v1':
        raise ValueError('Invalid roof_design schema')
    if not isinstance(value['records'], list):
        raise ValueError('roof_design records must be an array')
    if type(slot) is not int or not 0 <= slot < 2**32:
        raise ValueError('Roof design slot must be uint32')
    by_id = {}
    for cell in cells:
        identifier = cell.get('id')
        if not isinstance(identifier, str) or identifier in by_id:
            raise ValueError('Roof design cells require unique string IDs')
        by_id[identifier] = cell
    result = {}
    def vector(v, n):
        if not isinstance(v, list) or len(v) != n or any(type(x) not in (int, float) or not math.isfinite(x) for x in v):
            raise ValueError('Roof design geometry requires finite vectors')
        return v
    for record in value['records']:
        if not isinstance(record, dict) or set(record) != {'cell_id', 'initial64_hex', 'quaternion_f32', 'world_height_origin'}:
            raise ValueError('Invalid roof design record fields')
        identifier = record['cell_id']
        if not isinstance(identifier, str) or identifier not in by_id or identifier in result:
            raise ValueError('Roof design record IDs must uniquely cover cells')
        encoded = record['initial64_hex']
        if not isinstance(encoded, str) or not re.fullmatch('[0-9a-fA-F]{128}', encoded):
            raise ValueError('Roof design initial state must be exactly 64 bytes')
        raw = bytes.fromhex(encoded)
        base = struct.unpack_from('<4f', raw)
        half = struct.unpack_from('<12e', raw, 16)
        slot0, velocity, animation = struct.unpack_from('<IIf', raw, 40)
        if not all(math.isfinite(x) for x in (*base, *half, animation)):
            raise ValueError('Roof design initial state has nonfinite floats')
        if slot0 != slot or base[3] != 0 or velocity != 0 or animation != 0:
            raise ValueError('Roof design requires matching slot and zero initial gravity state')
        origin = record['world_height_origin']
        if type(origin) not in (int, float) or not math.isfinite(origin):
            raise ValueError('Roof design height origin must be finite')
        cell = by_id[identifier]
        center = vector(cell['center'], 3)
        if center != [base[0], base[1] + origin, base[2]]:
            raise ValueError('Roof design center differs from base plus height origin')
        q = vector(record['quaternion_f32'], 4)
        try:
            if list(struct.unpack('<4f', struct.pack('<4f', *q))) != q:
                raise ValueError('Roof design quaternion must contain original f32 values')
            if struct.pack('<4e', *q) != raw[32:40]:
                raise ValueError('Roof design packed quaternion mismatch')
            if struct.pack('<3e', *vector(cell['size'], 3)) != raw[24:30]:
                raise ValueError('Roof design packed scale mismatch')
        except (struct.error, OverflowError) as exc:
            raise ValueError('Roof design geometry is not representable in native ABI') from exc
        for axis, expected in zip(('tangent', 'bitangent', 'normal'), roof_basis(q)):
            if max(abs(a-b) for a, b in zip(vector(cell[axis], 3), expected)) > 1e-12:
                raise ValueError('Roof design quaternion differs from cell frame')
        result[identifier] = raw
    if set(result) != set(by_id):
        raise ValueError('Roof design records must cover every cell')
    return result
