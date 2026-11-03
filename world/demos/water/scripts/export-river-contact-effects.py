"""Read-only SW2 v1.7 RiverDemo extraction; no Unity project or importer changes."""
import argparse, hashlib, json, re, shutil
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--source-project', required=True, type=Path)
p.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/contact-effects')
a = p.parse_args()
root = a.source_project / 'Assets/StylizedWater2'
scene = root / '_Demo/RiverDemo.unity'
source = scene.read_text()
vfx = re.search(r"--- !u!4 &516333830\n(.*?)(?=\n--- !u!)", source, re.S)[1]
for field, expected in [("m_LocalRotation", "{x: 0, y: 0, z: 0, w: 1}"), ("m_LocalPosition", "{x: 0, y: 0, z: 0}"), ("m_LocalScale", "{x: 1, y: 1, z: 1}")]:
    if f"{field}: {expected}" not in vfx: raise ValueError("VFX parent is no longer an identity transform")
refs = {}
for kind, name in [('splash', 'WaterfallSplash'), ('splash', 'WaterSplash_Collision'), ('mist', 'WaterfallMist'), ('whitewater', 'RiverMouth')]:
    path = root / f'Prefabs/Effects/{name}.prefab'
    guid = re.search(r'^guid: (\w+)', Path(str(path)+'.meta').read_text(), re.M)[1]
    refs[guid] = (kind, name, path)
points = []
for block in re.split(r'(?=^--- !u!)', source, flags=re.M):
    match = re.search(r'm_SourcePrefab: .*guid: (\w+)', block)
    if not match or match[1] not in refs: continue
    kind, name, _ = refs[match[1]]
    props = dict(re.findall(r'propertyPath: ([^\n]+)\n\s+value: ([^\n]*)', block))
    if props.get('m_IsActive') == '0': continue
    # The reference VFX parent is identity, and instances have direct position overrides.
    parent = re.search(r'm_TransformParent: \{fileID: (\d+)\}', block)[1]
    if parent != '516333830': raise ValueError('Unexpected VFX hierarchy; re-export world transforms with Unity')
    xyz = [float(props[f'm_LocalPosition.{axis}']) for axis in 'xyz']
    xyz[2] *= -1
    instance = re.search(r'--- !u!1001 &(\d+)', block)[1]
    points.append(dict(id='sw2-fx-'+instance, kind=kind, prefab=name, sourceGuid=match[1], position=xyz))
if len(points) != 12: raise ValueError('Reference scene changed; review emitter selection')
a.output.mkdir(parents=True, exist_ok=True)
files = []
for name in ['WaterfallSplash_5x5.png', 'WaterSplash_6x6.png', 'WaterMist_5x5.png']:
    src = root / 'Materials/Effects/Textures' / name
    shutil.copyfile(src, a.output/name)
    files.append(dict(path=name, sha256=hashlib.sha256(src.read_bytes()).hexdigest(), bytes=src.stat().st_size))
inputs = [scene] + [x[2] for x in refs.values()]
manifest = dict(version=1, source='Stylized Water 2 v1.7.0', coordinateConversion='Unity left-handed to right-handed: negate Z',
                inputs=[dict(path=str(f.relative_to(a.source_project)), sha256=hashlib.sha256(f.read_bytes()).hexdigest()) for f in inputs],
                files=files, emitters=points)
(a.output/'scene.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(f'Exported {len(points)} emitter anchors and {len(files)} unchanged texture atlases')
