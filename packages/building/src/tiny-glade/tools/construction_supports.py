"""Production support construction on the first platform collision owner.

ABI/root sequence recovered from parameters/audit-support-wrappers-native.py
and capture-wall-colliders.py. Keeps original collision, detection, native
instance producers and maintenance. Does not rerun platform or regeneration
checks, or query a historical Cottage ray. This is CPU native generation, not
a GPU placement approximation or a full persistent ECS scheduler.
"""
from pathlib import Path
import hashlib
import struct
import time

def _publish_colliders(r, live, world, public, roof_triggers):
    """Original wall/roof/floor caller geometry and native registry insertion."""
    from scene_native_runtime import STACK, UC_ARM64_REG_PC, UC_ARM64_REG_SP, UC_ARM64_REG_X29, UC_ARM64_REG_X20, UC_ARM64_REG_X8, UC_ARM64_REG_X0, UC_HOOK_BLOCK
    m = r.mu
    triggers = {}
    registry = world + 15816
    r.table(registry, [], 32, 0x1012ed158)
    (ctrl, mask, _, _) = struct.unpack('<4Q', m.mem_read(public, 32))
    walls = {}
    for i in range(mask + 1):
        if m.mem_read(ctrl + i, 1)[0] < 128:
            at = ctrl - (i + 1) * 688
            walls[struct.unpack('<Q', m.mem_read(at, 8))[0]] = at + 8

    def segment(start, end):
        m.emu_start(start, end, count=10000000)
        assert m.reg_read(UC_ARM64_REG_PC) == end
    for (j, wid) in enumerate(live['ids']):
        w = walls[wid]
        if wid not in triggers:
            trigger = r.alloc(104)
            for off in [0, 24, 48, 72]:
                r.put(trigger + off, '<3Q', 0, 4, 0)
            r.call(0x101657a40, [trigger, w])
            triggers[wid] = trigger
        trigger = triggers[wid]
        roof = live['roofptrs'][wid]
        sp = STACK + 524288
        m.mem_write(sp, bytes(4096))
        m.reg_write(UC_ARM64_REG_SP, sp)
        m.reg_write(UC_ARM64_REG_X29, sp + 1168)
        r.put(sp, '<II', m.mem_read(w + 672, 1)[0], struct.unpack('<I', m.mem_read(w + 600, 4))[0])
        r.put(sp + 16, '<Q', trigger)
        r.put(sp + 80, '<Q', wid)
        m.reg_write(UC_ARM64_REG_X8, roof)
        m.reg_write(UC_ARM64_REG_X0, trigger)
        segment(0x1014bb798, 0x1014bb62c)
        mesh = r.blob(bytes(m.mem_read(sp + 304, 32)))
        segment(0x1014bb964, 0x1014bb980)
        transform = r.blob(bytes(m.mem_read(sp + 688, 32)))
        key = 1 << 32 | 4294967295 - j
        kp = r.blob(struct.pack('<Q', key))
        hv = r.call(0x1012ed158, [registry + 32, kp])
        entry = r.blob(struct.pack('<3Q', key, registry, hv))
        out = r.alloc(24)
        try:
            r.call(0x101674190, [entry, world, mesh, transform], out=out)
        except Exception as e:
            raise RuntimeError(str(e) + ' at ' + hex(m.reg_read(UC_ARM64_REG_PC)) + ' tail=' + str(r.tail)) from e
    roof_registry = world + 15864
    r.table(roof_registry, [], 32, 0x1012ed158)
    for (j, wid) in enumerate(live['ids']):
        roof = live['roofptrs'][wid]
        trigger = roof_triggers[wid]
        sp = STACK + 524288
        m.mem_write(sp, bytes(4096))
        m.reg_write(UC_ARM64_REG_SP, sp)
        m.reg_write(UC_ARM64_REG_X29, sp + 1168)
        m.reg_write(UC_ARM64_REG_X20, wid)
        r.put(sp + 64, '<Q', trigger)
        r.put(sp + 160, '<Q', roof)
        r.put(sp + 232, '<Q', world)
        segment(0x1014bcc68, 0x1014bceac)
        mesh = r.blob(bytes(m.mem_read(sp + 304, 32)))
        segment(0x1014bcf8c, 0x1014bcfa0)
        transform = r.blob(bytes(m.mem_read(sp + 688, 32)))
        key = 1 << 32 | 4294967292 - j
        kp = r.blob(struct.pack('<Q', key))
        hv = r.call(0x1012ed158, [roof_registry + 32, kp])
        entry = r.blob(struct.pack('<3Q', key, roof_registry, hv))
        out = r.alloc(24)
        r.call(0x101674190, [entry, world, mesh, transform], out=out)
    registry = world + 15912
    r.table(registry, [], 32, 0x1012ed158)
    for (j, wid) in enumerate(live['ids']):
        w = walls[wid]
        sp = STACK + 524288
        m.mem_write(sp, bytes(4096))
        m.reg_write(UC_ARM64_REG_SP, sp)
        m.reg_write(UC_ARM64_REG_X29, sp + 1168)
        r.put(sp + 8, '<Q', w + 680)
        r.put(sp + 80, '<Q', wid)
        r.put(sp + 232, '<Q', world)
        no_floor = []

        def guard_stop(uc, pc, size, _):
            if pc == 0x1014bbc1c:
                no_floor.append(True)
                uc.emu_stop()
        hk = m.hook_add(UC_HOOK_BLOCK, guard_stop)
        try:
            m.emu_start(0x1014bb9b8, 0x1014bc05c, count=10000000, timeout=10000000)
        finally:
            m.hook_del(hk)
        if no_floor:
            continue
        assert m.reg_read(UC_ARM64_REG_PC) == 0x1014bc05c
        mesh = r.blob(bytes(m.mem_read(sp + 304, 32)))
        segment(0x1014bc14c, 0x1014bc160)
        transform = r.blob(bytes(m.mem_read(sp + 688, 32)))
        key = 1 << 32 | 4294967295 - j
        kp = r.blob(struct.pack('<Q', key))
        hv = r.call(0x1012ed158, [registry + 32, kp])
        entry = r.blob(struct.pack('<3Q', key, registry, hv))
        out = r.alloc(24)
        r.call(0x101674190, [entry, world, mesh, transform], out=out)
    r.call(0x1014b6748, [world])

def run(r, live, *, world, public, pair_rows, roof_triggers, output_dir, provider):
    """Consume the same r/world/public from the first platform(...) tuple.

 live must belong to r; world is its original platform collision allocation,
 and public is live['public']. pair_rows and roof_triggers come from this same
 construction revision. Invoke once per fresh scene. The caller retains native
 owner lifetime and saves/restores resource adapters around independent families.
 """
    from scene_native_runtime import STACK, STOP, UC_ARM64_REG_X0, UC_ARM64_REG_X1, UC_ARM64_REG_PC
    started = time.perf_counter()
    if live['r'] is not r or live['public'] != public or world not in r.allocs:
        raise ValueError('Supports require the current live platform owner')
    if set(roof_triggers) != set(live['ids']):
        raise ValueError('Roof triggers must cover current owners')
    if len(pair_rows) > 7:
        raise ValueError('Native pair table capacity exceeded')
    for pair in pair_rows:
        if len(pair['ids']) != 2 or any((wid not in live['ids'] for wid in pair['ids'])) or pair['capacity'] < len(pair['points']):
            raise ValueError('Invalid current support intersection')
    marker = getattr(r, 'production_support_worlds', set())
    if world in marker:
        raise ValueError('Support production requires a fresh platform collision owner')
    marker.add(world)
    r.production_support_worlds = marker
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    scene_root = Path(provider).resolve().parent / 'scene-reuse'
    roofquery = live['q']
    m = r.mu
    (ctrl, mask, _, _) = struct.unpack('<4Q', m.mem_read(public, 32))
    walls = {}
    for i in range(mask + 1):
        if m.mem_read(ctrl + i, 1)[0] < 128:
            at = ctrl - (i + 1) * 688
            walls[struct.unpack('<Q', m.mem_read(at, 8))[0]] = at + 8

    def ref(x):
        p = r.alloc(40)
        r.put(p, '<QQQII', x, 0, p + 32, 0, 1)
        return p
    resources = {}
    captures = {}
    for (stride, keyaddr, off) in [(80, 0x102609740, 320), (64, 0x102609750, 336)]:
        resource = r.alloc(256)
        typed = r.alloc(16)
        vtable = r.alloc(48)
        counts = r.blob(bytes([32]) * 256)
        chunks = r.alloc(24)
        dirty = r.alloc(32)
        occ = r.alloc(32)
        free = r.blob(struct.pack('<' + 'I' * 255, *range(255)))
        buffer = r.alloc(8192 * stride)
        r.put(typed, '<QQ', resource, vtable)
        r.put(vtable + 24, '<Q', 0x1014b5048)
        r.put(chunks, '<3Q', buffer, 8192, 0)
        r.put(resource + 8, '<8Q', counts, 256, occ, 4, chunks, 1, dirty, 4)
        r.put(resource + 88, '<4Q', 0, 256, free, 255)
        r.put(resource + 120, '<Q', 1)
        owners = {}
        for (wid, w) in walls.items():
            own = r.alloc(32)
            ids = r.alloc(1024)
            r.put(own, '<3Q', 256, ids, 0)
            r.put(w + off, '<Q', own)
            owners[wid] = own
        resources[bytes(m.mem_read(keyaddr, 8))] = typed
        captures[stride] = (owners, counts, buffer)

    def lookup():
        k = bytes(m.mem_read(m.reg_read(UC_ARM64_REG_X1), 8))
        assert k in resources, k.hex()
        m.reg_write(UC_ARM64_REG_X0, resources[k])
    r.adapters[0x1010cacc4] = ('typed-original-Brick64-WoodenPlank80-resource-binding', lookup)
    tls = r.alloc(2048)
    td = r.alloc(1024)
    r.put(tls + 8, '<3Q', 128, td, 0)
    r.put(tls + 216, '<B', 1)
    r.put(0x1032b98c8, '<Q', STOP + 260)
    r.adapters[STOP + 260] = ('preinitialized-parking-thread-local-storage', lambda : m.reg_write(UC_ARM64_REG_X0, tls))
    terrain = r.alloc(96)
    grid = r.blob((scene_root / 'cottage-terrain-u16.bin').read_bytes(), 4)
    r.put(terrain + 8, '<Q', grid)
    r.put(terrain + 80, '<2f', -2.5, 20)
    m.mem_write(0x1032bb2e8, b'\x00')
    stats = r.alloc(48)
    r.table(stats, [], 64, 0x10102fb64)
    storage = r.alloc(128)
    dirtyids = r.alloc(128)
    r.put(storage, '<3Q', 16, dirtyids, 0)
    r.table(storage + 24, [], 32, 0x1012ec21c)
    r.table(storage + 72, [], 32, 0x10102fb64)
    ui = r.alloc(80)
    uievents = r.alloc(1024)
    r.put(ui + 32, '<3Q', 32, uievents, 0)
    asset = r.alloc(64)

    def writer():
        p = r.alloc(80)
        ev = r.alloc(40 * 16)
        r.put(p, '<3Q', 0, 8, 0)
        r.put(p + 32, '<3Q', 16, ev, 0)
        return p

    def changed(ids, width=16):
        p = r.alloc(16)
        cur = r.alloc(8)
        seq = r.alloc(80)
        ev = r.alloc(max(1, len(ids)) * width)
        r.put(p, '<QQ', cur, seq)
        r.put(seq, '<4Q', len(ids), ev, len(ids), 0)
        r.put(seq + 40, '<3Q', ev + len(ids) * width, 0, 0)
        r.put(seq + 64, '<Q', len(ids))
        for (i, wid) in enumerate(ids):
            r.put(ev + i * width, '<2Q', i, wid)
        return p
    pairs = pair_rows
    pm = r.alloc(48)
    bs = r.alloc(40 * 8 + 16)
    ctrl = bs + 40 * 8
    m.mem_write(ctrl, b'\xff' * 16)
    r.put(pm, '<6Q', ctrl, 7, 7 - len(pairs), len(pairs), 0, 0)
    for (i, p) in enumerate(pairs):
        raw = b''.join((struct.pack('<2f', *v) for v in p['points']))
        ptr = r.blob(raw + bytes((p['capacity'] - len(p['points'])) * 8))
        r.put(ctrl - (i + 1) * 40, '<5Q', *p['ids'], p['capacity'], ptr, len(p['points']))
        m.mem_write(ctrl + i, b'\x00')
        m.mem_write(ctrl + i + 8, b'\x00')
    rectmsg = writer()
    circlemsg = writer()
    turretmsg = writer()
    subscriptions = r.alloc(24)
    r.put(subscriptions, '<3Q', 0, 8, 0)
    delay = r.alloc(1)
    r.put(terrain + 48, '<3Q', 0, 8, 0)
    r.call(0x1010a805c, [ref(subscriptions), ref(world), ref(terrain)])
    subscription_count = struct.unpack('<Q', m.mem_read(subscriptions + 16, 8))[0]
    assert subscription_count == 10, subscription_count
    _publish_colliders(r, live, world, public, roof_triggers)
    r.put(STACK + 983040, '<7Q', ref(circlemsg), ref(stats), ref(storage), changed([]), changed([]), delay, ref(turretmsg))
    try:
        r.call(0x1010a83bc, [changed(live['ids']), changed([]), ref(subscriptions), ref(asset), ref(public), roofquery, ref(pm), ref(rectmsg)])
    except Exception as e:
        raise RuntimeError(str(e) + ' detect pc=' + hex(m.reg_read(UC_ARM64_REG_PC)) + ' tail=' + str(r.tail)) from e

    def messages(seq):
        (ptr, n) = struct.unpack('<2Q', m.mem_read(seq + 40, 16))
        return [bytes(m.mem_read(ptr + i * 40, 40)) for i in range(n)]
    message_rows = messages(rectmsg)
    circle_rows = messages(circlemsg)
    turret_rows = messages(turretmsg)
    rect_reader = r.alloc(16)
    r.put(rect_reader, '<QQ', r.alloc(8), rectmsg)
    circle_reader = r.alloc(16)
    r.put(circle_reader, '<QQ', r.alloc(8), circlemsg)
    r.put(STACK + 983040, '<2Q', ref(ui), ref(r.alloc(128)))
    r.call(0x1010a672c, [circle_reader, ref(asset), ref(public), ref(0), ref(world), ref(terrain), ref(stats), ref(storage)])
    r.put(STACK + 983040, '<Q', ref(ui))
    try:
        r.call(0x1010a6e20, [rect_reader, ref(asset), ref(public), ref(0), ref(world), ref(terrain), ref(stats), ref(storage)])
    except Exception as e:
        raise RuntimeError(str(e) + ' pc=' + hex(m.reg_read(UC_ARM64_REG_PC)) + ' tail=' + str(r.tail)) from e
    collider_events = writer()
    try:
        r.call(0x101098284, [ref(storage), ref(world), changed([]), ref(collider_events)])
    except Exception as e:
        raise RuntimeError(str(e) + ' maintain pc=' + hex(m.reg_read(UC_ARM64_REG_PC)) + ' tail=' + str(r.tail)) from e
    r.call(0x1014b6748, [world])
    outputs = []
    for wid in walls:
        row = {'wall_id': wid}
        for (stride, (owners, counts, buff)) in captures.items():
            (_, ptr, n) = struct.unpack('<3Q', m.mem_read(owners[wid], 24))
            slots = struct.unpack('<' + 'I' * n, m.mem_read(ptr, n * 4))
            raw = b''.join((bytes(m.mem_read(buff + (idx * 32 + j) * stride, stride)) for idx in slots for j in range(m.mem_read(counts + idx, 1)[0])))
            path = output / f'wrapper-support-{wid}.instances{stride}.bin'
            path.write_bytes(raw)
            row[str(stride)] = {'count': len(raw) // stride, 'sha256': hashlib.sha256(raw).hexdigest(), 'path': str(path)}
        outputs.append(row)

    def maprows(header, stride):
        (c, mask, _, n) = struct.unpack('<4Q', m.mem_read(header, 32))
        out = []
        for i in range(mask + 1):
            if m.mem_read(c + i, 1)[0] < 128:
                out.append(bytes(m.mem_read(c - (i + 1) * stride, stride)).hex())
        assert len(out) == n
        return out
    return {'status': 'whole-original-entry-to-ret', 'entries': ['0x1010a805c', '0x1010a83bc', '0x1010a672c', '0x1010a6e20', '0x101098284', '0x1014b6748'], 'scope': __doc__, 'original_subscription_count': subscription_count, 'native_messages': {'rectangle': [x.hex() for x in message_rows], 'circle': [x.hex() for x in circle_rows], 'turret': [x.hex() for x in turret_rows]}, 'outputs': outputs, 'column_colliders': maprows(storage + 72, 32), 'collision_storage': maprows(storage + 24, 32), 'support_state': maprows(stats, 64), 'column_collision_update_events': struct.unpack('<Q', m.mem_read(collider_events + 48, 8))[0], 'ui_events_count': struct.unpack('<Q', m.mem_read(ui + 48, 8))[0], 'production': {'platform_reused': True, 'generation_passes': 1, 'audit_regeneration_passes': 0, 'elapsedMs': (time.perf_counter() - started) * 1000}, 'provenance': r.provenance()}
