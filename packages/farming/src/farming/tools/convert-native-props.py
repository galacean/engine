"""Offline GLB import into existing Galacean Mesh/Material/AnimationClip/Prefab formats.
Run from any directory. Sources remain importer fixtures; production uses only output files.
Maintained .mat files under native/assets are the single material source of truth.
Reject unsupported features rather than silently dropping rendering or animation data.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'native/assets'

# Watering/watering-can.glb contains animated morph normals; the current native Mesh decoder drops them.
# Keep its original importer until that public format can preserve the animation.
OVERRIDES = {
    'Sowing/seed-sack': {'name': 'FarmingSeedSack'},
    'Storage/cart': {},
    'Storage/basket': {},
    'Harvest/basket': {'name': 'FarmingHarvestBasket'},
    'Tilling/hoe': {
        'name': 'FarmingHoeTool',
        'isActive': False,
        'controller': 'Farming/Props/Tilling/hoe.animCtrl',
        'shadowMeshPath': [0, 0, 1],
    },
    'Tilling/rake': {
        'name': 'FarmingRakeTool',
        'isActive': False,
        'controller': 'Farming/Props/Tilling/rake.animCtrl',
        'shadowMeshPath': [0, 0, 1],
    },
}

ARTIFACTS = {}
SOURCE_MATS = set()
FILES = []
REPORT = []


def text(value):
    data = value.encode()
    assert len(data) < 65536
    return struct.pack('<H', len(data)) + data


def aligned(data):
    return data + bytes((-len(data)) % 4)


def binary(kind, name, payload, version=1):
    header = aligned(struct.pack('<IIB', 0x4E434C47, 0, version) + text(kind) + text(name))
    result = bytearray(header + payload)
    struct.pack_into('<I', result, 4, len(result))
    return result


def register_file(path, kind):
    virtual_path = 'Farming/Native/' + path
    FILES.append({'virtualPath': virtual_path, 'file': path, 'type': kind})
    return virtual_path


def emit(path, kind, value):
    ARTIFACTS[OUT / path] = bytes(value) if isinstance(value, (bytes, bytearray)) else (json.dumps(value, indent=2) + '\n').encode()
    return register_file(path, kind)


for prop, override in OVERRIDES.items():
    category, name = prop.split('/')
    source = ROOT / 'assets' / category.lower() / (name + '.glb')
    raw = source.read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    blob = raw[28 + length:]
    assert not doc.get('skins') and set(doc.get('extensionsRequired', [])) <= {'KHR_texture_basisu'}

    def accessor(index):
        a = doc['accessors'][index]
        assert not a.get('sparse') and not a.get('normalized')
        view = doc['bufferViews'][a['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        size = struct.calcsize('<' + fmt * count)
        start = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        rows = [struct.unpack_from('<' + fmt * count, blob, start + i * view.get('byteStride', size)) for i in range(a['count'])]
        assert all(math.isfinite(v) for row in rows for v in row)
        return rows, fmt

    material_paths = []
    expected_mats = len(doc.get('materials', []))
    for i in range(expected_mats):
        mat_rel = f'{prop}/material-{i}.mat'
        mat_file = OUT / mat_rel
        if not mat_file.is_file():
            raise RuntimeError(f'Missing maintained native material: {mat_file}')
        material = json.loads(mat_file.read_text())
        if not isinstance(material, dict) or not isinstance(material.get('shader'), str) or not isinstance(material.get('shaderData'), dict):
            raise RuntimeError(f'Invalid native material schema: {mat_file}')
        for value in material['shaderData'].values():
            if isinstance(value, dict) and value.get('type') == 'Texture':
                assert (ROOT / 'assets/prop-textures' / Path(value['value']['url']).name).exists()
        SOURCE_MATS.add(mat_file)
        material_paths.append(register_file(mat_rel, 'Material'))

    mesh_paths = {}
    vertices = indices_count = 0
    for mi, mesh in enumerate(doc['meshes']):
        for pi, primitive in enumerate(mesh['primitives']):
            assert not primitive.get('targets') and not primitive.get('extensions')
            attrs = primitive['attributes']
            assert set(attrs) <= {'POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT'}
            payload = b''
            bindings = []
            elements = []
            for semantic, index in attrs.items():
                rows, fmt = accessor(index)
                assert fmt == 'f'
                data = b''.join(struct.pack('<' + fmt * len(row), *row) for row in rows)
                bindings.append({'start': len(payload), 'end': len(payload) + len(data), 'stride': len(rows[0]) * 4})
                elements.append({'attribute': semantic, 'format': len(rows[0]) - 1, 'offset': 0, 'bindingIndex': len(bindings) - 1})
                payload = aligned(payload + data)
            rows, fmt = accessor(primitive['indices'])
            index_data = b''.join(struct.pack('<' + fmt, *row) for row in rows)
            indices = {'start': len(payload), 'end': len(payload) + len(index_data), 'format': {'B': 0, 'H': 1, 'I': 2}[fmt]}
            positions, _ = accessor(attrs['POSITION'])
            bounds = {key: dict(zip('xyz', [fn(row[i] for row in positions) for i in range(3)])) for key, fn in [('min', min), ('max', max)]}
            data = {'version': 1, 'vertexBuffers': bindings, 'vertexElements': elements, 'indices': indices,
                    'subMeshes': [{'start': 0, 'count': len(rows), 'topology': primitive.get('mode', 4)}], 'bounds': bounds}
            mesh_paths[mi, pi] = emit(f'{prop}/mesh-{mi}-{pi}.mesh', 'Mesh', binary('BufferMesh', name, aligned(text(json.dumps(data, separators=(',', ':')))) + payload + index_data))
            vertices += len(positions)
            indices_count += len(rows)

    refs = []
    components = []
    entities = [{'name': 'GLTF_ROOT', 'children': [i + 1 for i in doc['scenes'][doc.get('scene', 0)]['nodes']], 'components': []}]

    def ref(path):
        if {'url': path} not in refs:
            refs.append({'url': path})
        return {'$ref': refs.index({'url': path})}

    def component(entity, value):
        entity['components'].append(len(components))
        components.append(value)

    for ni, node in enumerate(doc['nodes']):
        assert not any(k in node for k in ['matrix', 'skin', 'weights', 'extensions', 'camera'])
        entity = {'name': node.get('name', f'_GLTF_ENTITY_{ni}'), 'children': [i + 1 for i in node.get('children', [])], 'components': []}
        props = {field: dict(zip(keys, node.get(key, default))) for key, field, keys, default in [
            ('translation', 'position', 'xyz', [0, 0, 0]), ('rotation', 'rotationQuaternion', 'xyzw', [0, 0, 0, 1]), ('scale', 'scale', 'xyz', [1, 1, 1])]}
        component(entity, {'type': 'Transform', 'props': props})
        if 'mesh' in node:
            mi = node['mesh']
            for pi, primitive in enumerate(doc['meshes'][mi]['primitives']):
                component(entity, {'type': 'MeshRenderer', 'props': {'mesh': ref(mesh_paths[mi, pi])},
                                   'calls': [{'method': 'setMaterial', 'args': [ref(material_paths[primitive['material']])]}]})
        entities.append(entity)

    clip_paths = []
    parents = {child: parent for parent, node in enumerate(doc['nodes']) for child in node.get('children', [])}
    for ai, animation in enumerate(doc.get('animations', [])):
        clip = text(animation['name']) + struct.pack('<HH', 0, len(animation['channels']))
        for channel in animation['channels']:
            target = channel['target']; index = target['node']; parts = [doc['nodes'][index].get('name', f'_GLTF_ENTITY_{index}')]
            while index in parents:
                index = parents[index]; parts.insert(0, doc['nodes'][index].get('name', f'_GLTF_ENTITY_{index}'))
            sampler = animation['samplers'][channel['sampler']]
            interpolation = {'LINEAR': 0, 'STEP': 2}[sampler.get('interpolation', 'LINEAR')]
            times, _ = accessor(sampler['input']); values, _ = accessor(sampler['output'])
            assert len(times) == len(values)
            field, curve = {'translation': ('position', 'AnimationVector3Curve'), 'rotation': ('rotationQuaternion', 'AnimationQuaternionCurve'), 'scale': ('scale', 'AnimationVector3Curve')}[target['path']]
            clip += text('/'.join(parts)) + text('Transform') + struct.pack('<H', 0) + text(field) + text('')
            clip += struct.pack('<BH', interpolation, len(times)) + text(curve)
            for time, value in zip(times, values):
                clip += struct.pack('<' + 'f' * (1 + len(value) * 3), time[0], *value, *([0] * len(value) * 2))
        clip_paths.append(emit(f'{prop}/{animation["name"]}.ani', 'AnimationClip', binary('AnimationClip', animation['name'], clip, 2)))
    if clip_paths:
        component(entities[0], {'type': 'Animator'})

    def entity_at(path):
        index = 0
        for child in path:
            index = entities[index]['children'][child]
        return entities[index]

    if 'name' in override:
        entities[0]['name'] = override['name']
    if 'isActive' in override:
        entities[0]['isActive'] = override['isActive']
    if 'controller' in override:
        animator = next(components[index] for index in entities[0]['components'] if components[index]['type'] == 'Animator')
        animator.setdefault('props', {}).update({'animatorController': ref(override['controller']), 'enabled': False, 'cullingMode': 0})
    if 'shadowMeshPath' in override:
        renderer = next(components[index] for index in entity_at(override['shadowMeshPath'])['components'] if components[index]['type'] == 'MeshRenderer')
        renderer.setdefault('props', {}).update({'castShadows': True, 'receiveShadows': True})

    destination = ROOT / 'assets' / category.lower() / (name + '.prefab')
    ARTIFACTS[destination] = (json.dumps({'version': '2.0', 'refs': refs, 'entities': entities, 'components': components, 'root': 0}, indent=2) + '\n').encode()
    REPORT.append({'source': str(source.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest(), 'vertices': vertices, 'indices': indices_count, 'clips': clip_paths})

ARTIFACTS[OUT / 'manifest.json'] = (json.dumps(FILES, indent=2) + '\n').encode()
ARTIFACTS[OUT / 'conversion-report.json'] = (json.dumps(REPORT, indent=2) + '\n').encode()
extra_mats = [path for path in OUT.rglob('*.mat') if path.is_file() and path not in SOURCE_MATS]
if extra_mats:
    raise RuntimeError(f'Unexpected extra native materials: {extra_mats}')
stale = [path for path in OUT.rglob('*') if path.is_file() and path not in ARTIFACTS and path not in SOURCE_MATS]
changed = [path for path, value in ARTIFACTS.items() if not path.exists() or path.read_bytes() != value]
if '--check' in sys.argv:
    if changed or stale:
        raise RuntimeError(f'Native farming assets are stale: {changed + stale}')
else:
    for path in changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(ARTIFACTS[path])
    for path in stale:
        path.unlink()
print(f'Converted {len(REPORT)} props into {len(FILES) + len(REPORT)} native assets; {len(changed)} changed')
