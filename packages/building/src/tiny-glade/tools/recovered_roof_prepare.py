"""Fresh roof instances and original animation/push preparation on ordinary CPU.

Replaces native-scene/roof.py construction + 60 ECS animation traversals. This
is the fresh, static Roof88 path only: no deletion marker, animated source edits,
arch masks or GPU gravity advancement. Original instance state remains initial;
the resident GPU owns gravity feedback. No baked scene data is read.
"""
from pathlib import Path
import hashlib
import struct
from recovered_roof import f32, add, sub, mul, generate_circular, generate_rectangular
from recovered_roof_surface import descriptor


def _bits(bits):
    return struct.unpack('<f', struct.pack('<I', bits))[0]


def animation(raw88, instance_count):
    """Fresh new()/roof_animation/wall_height_dt/native drawpush, fixed 60 frames.

    0x1012af790 new=(0,0); 0x1016ec514 simulation=(0,height,0...);
    0x100554094..0x1005540c8 increments with pre-update .99 gate;
    0x10055e4d4 updates delta and last height; 0x1019f1db4 packs push.
    """
    _, surface, _ = descriptor(raw88)
    if type(instance_count) is not int or not 0 <= instance_count < 2**32:
        raise ValueError('instance_count must be uint32')
    base = surface['base_height']
    factor = 2. if surface['height_parameter'] <= f32(.1) else 1.
    first = second = 0.
    dt = f32(1/60)
    delta = sub(base, base)
    steps = []
    for _ in range(60):
        da = mul(factor, mul(dt, _bits(0x4036db6e)))
        db = mul(factor, mul(dt, _bits(0x40555555))) if first > _bits(0x3f7d70a4) else 0.
        first = min(1., max(0., add(first, da)))
        second = min(1., max(0., add(second, db)))
        steps.append({'dt': 1/60, 'first_instance': 0, 'instance_count': instance_count,
                      'wall_height_delta': delta, 'roof_pivot_y': base, 'animation_t': first})
    return {'RoofAnimation_raw8': struct.pack('<2f', first, second).hex(),
            'simulation24_hex': (struct.pack('<2f', delta, base) + bytes(16)).hex(),
            'push20_hex': struct.pack('<IIfff', 0, instance_count, delta, base, first).hex(),
            'steps': steps, 'frame_count': 60, 'dt': 1/60}


def generate(owners, output):
    """owners=[{wall_id,slot,roof88_hex,arch_mask_count:0}], caller ordered.

    Same instances/animations result shape as the original producer. The mask
    count is an explicit source fact, never inferred from missing geometry.
    Unsupported rectangular controls fail through the recovered constructor.
    """
    prepared = []
    seen = set()
    for owner in owners:
        wid, slot = owner['wall_id'], owner['slot']
        if type(wid) is not int or not 0 <= wid < 2**64 or wid in seen:
            raise ValueError('wall_id must be a unique uint64')
        seen.add(wid)
        if type(slot) is not int or not 0 <= slot < 2**32:
            raise ValueError('slot must be uint32')
        raw = bytes.fromhex(owner['roof88_hex'])
        tag, surface, footprint = descriptor(raw)
        pitched = int(surface['height_parameter'] > f32(.1))
        if pitched and owner.get('arch_mask_count') != 0:
            raise ValueError('Pitched preparation requires verified empty original arch masks')
        emits = []
        if pitched:
            result = (generate_circular if tag == 0 else generate_rectangular)(surface, footprint, render_slot=slot)
            emits = result['observed_native_emits']
        instances = b''.join(bytes.fromhex(e['initial64_hex']) for e in emits)
        prepared.append((owner, raw, pitched, instances, animation(raw, len(emits))))
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    rows, animations = [], {}
    for owner, raw, pitched, instances, anim in prepared:
        wid = owner['wall_id']
        file = output / ('wall%d.instances64.bin' % wid)
        file.write_bytes(instances)
        rows.append({'wall_id': wid, 'slot': owner['slot'], 'pitched': pitched,
                     'count': len(instances)//64, 'file': str(file),
                     'sha256': hashlib.sha256(instances).hexdigest(), 'roof88_hex': raw.hex()})
        animations[wid] = anim
    return {'instances': rows, 'animations': animations,
            'scope': 'Recovered original circular/rectangular initial construction plus fresh static 60-frame animation and drawpush; GPU gravity remains resident.'}


def run(r, live, output):
    """Source-owner adapter compatible with native-scene/roof.py run(r,live,out).

    Reads live source bytes; only the original arch-mask source query still runs
    natively. No constructor, ECS animation traversal or GPU readback executes.
    """
    owners = []
    for wid in live['ids']:
        raw = bytes(r.mu.mem_read(live['roofptrs'][wid], 88))
        slot = struct.unpack('<I', r.mu.mem_read(live['walls'][wid]+0x274, 4))[0]
        _, surface, _ = descriptor(raw)
        count = 0
        if surface['height_parameter'] > f32(.1):
            mask = r.alloc(24)
            r.call(0x101044bd0, [live['walls'][wid]], out=mask)
            count = struct.unpack('<Q', r.mu.mem_read(mask+16, 8))[0]
        owners.append({'wall_id': wid, 'slot': slot, 'roof88_hex': raw.hex(), 'arch_mask_count': count})
    return generate(owners, output)
