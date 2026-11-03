"""Request-owned native topology with optimized observation and family scheduling.

Original source validation, identities, geometry producers and unsupported-input
boundaries remain authoritative. No cached scene is substituted for a fresh build.
"""
from pathlib import Path
import sys,runpy,json,hashlib,time
from construction_prepare import prepare

def _write(path,value):
 Path(path).write_text(json.dumps(value,separators=(',',':'),allow_nan=False)+'\n')


def capture_current(scene, output_dir, provider, timings):
 provider=Path(provider);S=provider.parent/'scene-reuse'
 downstream=runpy.run_path(str(provider/'dynamic-native-downstream.py'))
 adapted=downstream['adapted']
 from structure_native import load as structure
 kernels=structure(provider)
 out=Path(output_dir);out.mkdir(parents=True,exist_ok=True)
 if any(out.iterdir()):raise ValueError('Capture needs an empty private output directory')
 if getattr(scene,'render_capture_started',False):raise ValueError('A fresh native owner is required')
 scene.render_capture_started=True;r=scene.r;l=scene.live
 def stage(name,fn):
  started=time.perf_counter();result=fn();timings[name]=(time.perf_counter()-started)*1000;return result
 from construction_decorators import build_decorators
 stage('decoratorContext',lambda:build_decorators(scene,out/'dormer-source',provider))
 conn=stage('connections',lambda:kernels['run_live'](r,l))
 merlons=stage('roofContacts',lambda:runpy.run_path(str(S/'native-scene/merlons.py'))['detect'](r,l,out/'roof-contacts'))
 _,world,_,public,plat=stage('platform',lambda:downstream['platform'](scene,out/'platform'))
 whole=stage('walls',lambda:kernels['walls'](scene,conn,plat,out/'walls',roof_connections=merlons['report']))
 r.current_scene_inputs={'connections':conn,'platform':plat,'roof_connections':merlons,'output_dir':str(out/'cpu'),'semantic_request':{'buildings':scene.requests}}
 def load(p):
  p=str(p)
  if p=='native-scene/globals.py':
   mod=adapted(S/p,{'snapshot=json.loads(source.read_text())':'snapshot={}',"hashlib.sha256(source.read_bytes()).hexdigest()":"hashlib.sha256(b'{}').hexdigest()"})
   original=mod['build']
   def colors(*args):
    data=original(*args);data['color_scope']='Original colors_of with new-scene empty override collections and original constructor defaults; Roof color comes from actual create_roof command. No Cottage owner color records.';return data
   return {'build':colors}
  if p=='native-scene/floors.py':
   return adapted(S/p,{"(1<<32)|(0xffffffff-i)":"live['owner'].roof_records[wid]['entity']","for i in range(N)));r.put(initmsg":"for i,wid in enumerate(ids)));r.put(initmsg",";assert cn==152;cmd=bytes(u.mem_read(cp,cn))":"\n  if cn==0:return out # Original complete construct_floors selected no bottom surfaces.\n  assert cn==152;cmd=bytes(u.mem_read(cp,cn))"})
  if p=='edited-decorators/live-chimney.py':
   return adapted(S/p,{"live['walls'][6]":(3,"live['walls'][live['ids'][0]]"),"[(6,bytes(u.mem_read(nested,48)))]":"[(live['ids'][0],bytes(u.mem_read(nested,48)))]","assert struct.unpack('<Q',u.mem_read(master+40,8))[0]==0\n r.put(master+24,'<3Q',256,r.alloc(256*8),0)":"# Preserve native retired-owner Vec; drain with original function after TLS binding.","counts=r.blob(bytes([32])*256)":"r.call(0x1014b0f68,[bufres]);assert struct.unpack('<Q',u.mem_read(master+40,8))[0]==0\n counts=r.blob(bytes([32])*256)"})
  if p=='native-scene/roof.py':
   from recovered_roof_prepare import run
   return {'run':run}
  if p=='parameters/audit-support-wrappers-native.py':
   from construction_supports import run
   def supports(*,existing,output_dir,pair_rows,roof_triggers):
    return run(*existing,world=world,public=public,pair_rows=pair_rows,roof_triggers=roof_triggers,output_dir=output_dir,provider=provider)
   return {'run':supports}
  return runpy.run_path(str(S/p))
 result=stage('prepare',lambda:prepare(r,l,whole,out/'cpu',load=load,scene_sources=S/'native-scene'))
 result['native_owner_capture']={k:whole['producer_partition'][k]for k in ['file','sha256']}
 result['construction_timings_ms']=dict(timings)
 result['boundaries']=['Fresh original native topology with event-only observations; not full Bevy command application','Original Cottage terrain and explicit semantic dormers; no inherited Cottage building records','Dynamic query capacity7; deletion/reordering and nonempty arch masks fail closed','Recovered roof placement and fresh static animation; GPU gravity and vertex deformation stay resident']
 Path(out/'cpu/bundle.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
 return result

def build(source, output_dir, *, provider, previous_mapping=None):
    """Build once in a fresh private directory; never overwrite a published bundle.

    The caller owns atomic publication/version ordering. Failures raise and retain
    failure.json in this private workspace; no partial bundle is returned as ready.
    Default is CPU-only, for a caller which subsequently binds Surface intents.
    Resident rendering consumes the returned immutable bundle.
    """
    D=Path(provider).resolve();S=D.parent/'scene-reuse'
    sys.path.insert(0,str(D))
    from building_source import validate,native_specs,dormer_specs,MAX_BUILDINGS,_digest
    timings={};start=time.perf_counter()
    document = validate(source, previous_mapping)
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        raise ValueError('building_source.build requires an empty private output directory')
    _write(out / 'source.json', document)
    sys.path.insert(0, str(D))
    from construction_runtime import make_replay_class
    DynamicScene=runpy.run_path(str(D/'dynamic_native_scene.py'))['DynamicScene']
    DynamicScene.__init__.__globals__['Replay']=make_replay_class()
    scene = None
    stage = 'create-native-owner'
    try:
        started=time.perf_counter();scene = DynamicScene();timings['ownerInit']=(time.perf_counter()-started)*1000
        started=time.perf_counter()
        ids = scene.create_buildings(native_specs(document))
        mapping = dict(zip(document['identity_order'], ids))
        if previous_mapping is not None and any(mapping[k] != v for k, v in previous_mapping.items()):
            raise ValueError('Original native allocation changed an existing building identity')
        scene.dormer_specs,dormer_identity=dormer_specs(document,mapping)
        timings['createBuildings']=(time.perf_counter()-started)*1000
        stage = 'capture-current-native-scene'
        bundle = capture_current(scene,out/'native',D,timings)
        bundle_path = out / 'native/cpu/bundle.json'
        environment_files = [S / 'cottage-terrain-u16.bin', S / 'cottage-PathRast.bin',
                             S / 'cottage-snapshot-chunks.json', S / 'cottage-raster-decoding.json']
        provenance = {
            'source_file': str(out / 'source.json'), 'source_sha256': _digest(out / 'source.json'),
            'environment': {'type': 'original_cottage_terrain', 'height_range': [-2.5, 20.0],
                'sampling_fix': False, 'road_raster': 'original PathRast; absent cobblestone rasters restored zero by original loader contract',
                'files': [{'file': str(p), 'sha256': _digest(p)} for p in environment_files]},
            'building_sources': 'fresh original Wall constructor section + complete original create_roof; no saved Cottage Wall/Roof/instance records',
            'identity': 'Persistent identity_order maps to original fresh allocation. Display list reordering ignored; append preserves current IDs. Deletion/reordering of accepted identities rejected.',
            'lifecycle': 'Fresh native typed-resource bundle per request; not original UI/history or whole Bevy command application',
            'road_arch_boundary': 'Nonempty original road arch masks fail closed in current dynamic downstream',
            'capacity': MAX_BUILDINGS,
            'native_execution': scene.r.provenance(),
            'native_owner_capture': bundle['native_owner_capture'],
            'sources': [{'file': str(p), 'sha256': _digest(p)} for p in [Path(__file__),D/'building_source.py',D/'dynamic_native_scene.py',D/'dynamic-native-downstream.py',Path(__file__).with_name('construction_prepare.py'),Path(__file__).with_name('structure_native.py'),Path(__file__).with_name('construction_supports.py'),Path(__file__).with_name('recovered_roof_prepare.py'),Path(__file__).with_name('construction_decorators.py'),Path(__file__).with_name('recovered_trigger_binding.py'),Path(__file__).with_name('construction_runtime.py')]]}
        provenance['dormer_identity']=dormer_identity
        if scene.dormer_specs:
            provenance['dormer_sources']='Original semantic serde -> runtime -> roof transform cache -> subtype library -> original Cottage/Gothic blueprint producers'
            provenance['sources'].extend({'file':str(D/name),'sha256':_digest(D/name)}for name in ('native_dormer_source.py','native_dormer_assets.py'))
        metadata = {'document': document, 'mapping': mapping, 'provenance': provenance}
        _write(out / 'building-source.json', metadata)
        bundle['building_source'] = {'file': str(out / 'building-source.json'), 'sha256': _digest(out / 'building-source.json'), 'mapping': mapping}
        for p in [out / 'source.json', out / 'building-source.json']:
            bundle['artifacts'].append({'file': str(p), 'byte_size': p.stat().st_size, 'sha256': _digest(p), 'role': 'current-output'})
        bundle['producer_sources'].append({'file': str(Path(__file__)), 'sha256': _digest(Path(__file__))})
        _write(bundle_path, bundle)
        report = {'status': 'prepared', 'bundle_path': str(bundle_path), 'mapping': mapping,
                  'provenance': provenance, 'bundle_sha256': _digest(bundle_path)}
        timings['total']=(time.perf_counter()-start)*1000
        report['construction_timings_ms']=timings
        _write(out / 'result.json', report)
        return report
    except Exception as exc:
        import traceback
        failure = {'status': 'failed', 'stage': stage, 'error': str(exc), 'traceback': traceback.format_exc()}
        if scene is not None:
            from unicorn.arm64_const import UC_ARM64_REG_PC
            failure['pc'] = hex(scene.u.reg_read(UC_ARM64_REG_PC)); failure['tail'] = scene.r.tail
        _write(out / 'failure.json', failure)
        raise
    finally:
        if scene is not None:
            scene.r.close()
