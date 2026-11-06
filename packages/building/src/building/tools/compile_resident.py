"""Compile geometry/rule/unit intent without material/depth/vertex audit passes.
Recovered shape producers remain an explicit local provider. Roof placements
produce design anchors and initial state; the resident GPU owns gravity updates.
"""
from pathlib import Path
import argparse,sys,json,copy,hashlib,subprocess,runpy,time,struct

def main(kernel=None):
 p=argparse.ArgumentParser();p.add_argument('--resources',type=Path,required=True);p.add_argument('--provider',type=Path,required=True);p.add_argument('--baseline',type=Path,required=True);p.add_argument('--document',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--gpu-feedback',action='store_true');p.add_argument('--construction-cache',type=Path);a=p.parse_args()
 sys.path.insert(0,str(a.provider));import project,arrangements,overrides
 if a.gpu_feedback:
  from functools import partial
  from resident_construction import build
  buildings=partial(build,provider=a.provider)
 else:
  from building_source import build as buildings
 from roof_placements import generate as generate_roof, boundaries as generate_boundaries
 from roof_contexts import context as roof_context, pitched_topology
 from connection_inventory import inventory
 if a.gpu_feedback:
  from roof_support import from_bundle
 else:
  from native_roof_surface import from_bundle
  from native_shingle_rule import context_from_bundle
 baseline=json.loads(a.baseline.read_text());baseline['request']=project.validate(baseline['request']);doc=project.validate(json.loads(a.document.read_text()));out=a.output.resolve();out.mkdir(parents=True,exist_ok=False);t=time.perf_counter();timings={}
 def checkpoint(name,start):timings[name]=(time.perf_counter()-start)*1000;print(name,timings[name],flush=True)
 if 'construction'not in doc:raise ValueError('Resident authoring compiler requires a construction geometry owner')
 start=time.perf_counter()
 if doc['construction']==baseline['request']['construction']:
  source=baseline['render']['construction']['source'];bundle_path=Path(baseline['render']['effective_source_bundle']);mapping=source['mapping']
 else:
  if a.construction_cache:
   from construction_cache import get_or_build
   source=get_or_build(doc['construction'],a.provider,a.construction_cache,buildings)
  else:source=buildings(doc['construction'],out/'native-source')
  bundle_path=Path(source['bundle_path']);mapping=source['mapping']
  if source.get('construction_cache'):timings['constructionCacheHit']=source['construction_cache']['hit']
  if not source.get('construction_cache',{}).get('hit') and source.get('construction_timings_ms'):timings['constructionStagesMs']=source['construction_timings_ms']
 bundle=json.loads(bundle_path.read_text());checkpoint('constructionMs',start);start=time.perf_counter()
 resolved=copy.deepcopy(doc);del resolved['construction'];supports={}
 for g in resolved['geometries']:
  s=g.get('source',{})
  if s.get('type')in ('building_roof','building_wall'):
   if s['type']=='building_wall':
    from native_wall_support import from_bundle as wall_support
   wid=mapping[s['building_id']];roof=s['type']=='building_roof';support=(from_bundle(bundle,wid,kernel=kernel) if roof and a.gpu_feedback else (from_bundle if roof else wall_support)(bundle,wid))
   if roof:supports[wid]=support
   shape=copy.deepcopy(support['geometry']);shape['id']=g['id'];g['geometry']=shape;g['source']={'type':'native_roof'if roof else'native_wall','wall_id':wid}
 ordinary=[b for b in resolved['bindings']if next(g for g in resolved['geometries']if g['id']==b['geometry_id']).get('source',{}).get('type')!='connection']
 if any(next(g for g in resolved['geometries']if g['id']==b['geometry_id']).get('source',{}).get('type')!='native_roof'for b in ordinary):raise ValueError('This resident compiler currently accepts building-roof bindings')
 bound={next(g for g in resolved['geometries']if g['id']==b['geometry_id'])['source']['wall_id']for b in ordinary}
 if bound!={r['wall_id']for r in bundle['families']['roofs']['data']['instances']}:raise ValueError('Every main roof must have one resident binding')
 template=a.resources.resolve(strict=True);root=out/'compiled/native-context/work/scene/gpu';root.mkdir(parents=True)
 fixed=['roof.vertices.bin','roof.indices.bin','brick.vertices.bin','brick.indices.bin','decorator-meshes','decorator-textures','window-glass-textures','wooden-plank-meshes','wooden-plank-textures','plaster-textures','plaster_index_mesh.indices.u32']
 for name in fixed:(root/name).symlink_to((template/name).resolve(strict=True),target_is_directory=(template/name).is_dir())
 def read(rec):
  path=Path(rec if isinstance(rec,str)else rec.get('file',rec.get('path',rec.get('output'))));raw=path.read_bytes()
  if isinstance(rec,dict)and rec.get('sha256')and hashlib.sha256(raw).hexdigest()!=rec['sha256']:raise ValueError('Source changed: '+str(path))
  return raw
 def put(name,data):q=root/name;q.write_bytes(data);return str(q)
 glob=bundle['globals'];cols={k:read(v)for k,v in glob['slot_arrays'].items()};cols={k:v+bytes(4096-len(v))for k,v in cols.items()}
 paths={k:put(k+'.bin',v)for k,v in cols.items()};put('stone_foundation.u32',cols['stone_foundation']);put('diagnostic-frame.bin',read(glob['frame']));put('frame-counter.bin',read(glob['frame_counter']));(root.parent/'color-library-base.bin').write_bytes(read(glob['color_library']))
 camera={k:baseline['render']['camera'][k]for k in ('eye','target','projection','halfExtent','near','far')};runpy.run_path(str(a.provider.parent/'scene-reuse/native-scene/gpu/camera.py'))['write'](root,camera)
 bindings={'frame':str(root/'diagnostic-frame.bin'),'frameCounter':str(root/'frame-counter.bin'),'identity':paths['identity'],'wallColors':paths['wall'],'roofColors':paths['roof']};(root/'resource-bindings.json').write_text(json.dumps(bindings))
 native=runpy.run_path(str(a.provider.parent/'scene-reuse/native-scene/gpu/render.py'));draws=[]
 def brick(id,raw):
  if raw:put(id+'.instances.bin',raw);draws.append({'id':id,'family':'brick'})
 for row in bundle['families']['walls']['data']['pending_instances']:brick('wall-'+str(row['wall_id']),read(row))
 brick('connection-bricks',native['connection_bricks'](bundle['families']['connections']['data']['outputs'],read))
 contact=native['roof_connection_instances'](bundle,read)
 if contact['brick'] or contact['wooden_plank']:raise ValueError('Flat/pitched contact units require an additional resident family adapter')
 if any(read(r)for r in bundle['families']['walls']['data']['timber'])or any(read(r)for r in bundle['families']['boards']['data']['rows']):raise ValueError('Native structural timber has not been admitted to this resident compiler')
 for family in ('chimney',):brick(family,read(bundle['families'][family]['data']))
 for row in bundle['families']['platform']['data']['instances']:brick('platform-'+str(row['wall_id']),read(row))
 for row in bundle['families']['supports']['data']['outputs']:brick('support-'+str(row['wall_id']),read(row['64']))
 if bundle['families']['foundation']['data']['commands_hex']or bundle['families']['autoclutter']['data']['instances']:raise ValueError('Foundation/autoclutter requires additional resident render adapters')
 for row in bundle['families']['floors']['data']:
  if any(x!=0 for x in struct.unpack_from('<2f',read(row),24)):raise ValueError('Visible floor surfaces require the floor renderer adapter')
 for row in bundle['families']['decorators']['data']['instances']:
  if row['subset']not in (2,3) and read(row):raise ValueError('Unsupported decorator family')
  if row['subset']==3 and struct.unpack_from('<I',read(row),56)[0] and struct.unpack_from('<II',read(row),56)!=(1,2):raise ValueError('Unresolved glass texture binding')
 for subset,kind in [(2,'frame'),(3,'glass')]:
  rows=[]
  for row in bundle['families']['decorators']['data']['instances']:
   if row['subset']!=subset:continue
   id=f'decorator-{row["id"]}-{row["index"]}';put(id+'.bin',read(row));rows.append({**row,'file':id+'.bin','mesh_name':row['mesh'].split('/')[-1]});draws.append({'id':id,'family':kind})
  (root/('cottage-window-'+kind+'-instances.json')).write_text(json.dumps({'results':rows}))
 plaster=bundle['families']['plaster']['data'];put('cottage-plaster.instances48.bin',read(plaster['instances48']));(root/'cottage-plaster-instances.json').write_text(json.dumps(plaster['packed']));(root/'plaster-geometry.json').write_text(json.dumps({'results':plaster['rows']}))
 holes=out/'holes.json';holes.write_text(json.dumps(bundle['families']['dormers']['data']['blueprint_holes']))
 if a.gpu_feedback:
  from dormer_bins import write as write_dormer_bins
  write_dormer_bins(bundle['families']['dormers']['data']['blueprint_holes'],root)
 else:subprocess.run([sys.executable,str(a.provider.parent/'scene-reuse/native-scene/gpu/bin-holes.py'),str(holes),str(root),'unit'],check=True,capture_output=True)
 def resources(destination):
  destination.mkdir(parents=True)
  for name in fixed+list(paths.keys()):
   src=root/name
   if src.exists():(destination/name).symlink_to(src.resolve(),target_is_directory=src.is_dir())
  for name in ['resource-bindings.json','diagnostic-view.bin','diagnostic-frame.bin','frame-counter.bin','unit.counts.bin','unit.holes.bin','stone_foundation.u32','wooden.bin','halftimber.bin']:
   if not(destination/name).exists():(destination/name).symlink_to((root/name).resolve())
  (destination.parent/'color-library-base.bin').symlink_to(root.parent/'color-library-base.bin')
 retained=out/'compiled/retained-roof/retained/work/scene/gpu';resources(retained);(retained/'unit.instances.bin').write_bytes(b''.join(read(r)for r in bundle['families']['dormers']['data']['instances']))
 checkpoint('geometryAndResourcesMs',start);start=time.perf_counter();plans=[];manifests=[];variants=[];plan_records=[];pack_jobs=[]
 for n,b in enumerate(ordinary):
  g=next(g for g in resolved['geometries']if g['id']==b['geometry_id']);wid=g['source']['wall_id'];owner=out/f'compiled/binding-{n:04d}';owner.mkdir();ctx=roof_context(bundle,supports[wid],owner/'native-overlap',kernel=kernel) if a.gpu_feedback else context_from_bundle(bundle,wid,directory=owner/'native-overlap');ctx['geometry']['id']=g['id'];seed=0 if b['seed']=='source'else b['seed']
  plan=generate_roof(ctx['geometry'],ctx,b['footprint'],seed,kernel=kernel) if a.gpu_feedback and b['rule']['type']=='overlap_rows' else arrangements.generate(ctx['geometry'],b['rule'],b['footprint'],seed,context=ctx if b['rule']['type']=='overlap_rows' else None)
  if b['rule']['type']!='overlap_rows':
   if a.gpu_feedback:
    edges=generate_boundaries(ctx['geometry'],ctx,b['footprint'],seed,plan['cells'],kernel=kernel)
    plan.update(connection_roof_design=edges['roof_design'],gravity_timeline=edges['gravity_timeline'])
   else:
    edges=arrangements.generate({'type':'native_roof_boundaries','geometry_id':g['id']},{'type':'roof_boundary_assembly'},b['footprint'],seed,context={'surface':ctx['geometry'],'native_context':ctx,'layout_cells':plan['cells']})
    plan['connection_render_metadata']=edges['source_render_metadata']
   plan.update(connection_cells=edges['cells'],connection_arrangement=edges['arrangement'],first_row_closure_pairs=edges['first_row_closure_pairs'])
  # Normalize the producer's logical anchor once; GPU consumers do not reinterpret source polygons.
  for cell in plan['cells']+plan.get('connection_cells',[]):
   anchor=overrides._anchor(cell)
   if anchor is not None:cell['anchor_uv']=anchor
  plan.update(geometry_id=g['id'],binding_id=b['id']);deps=[{'parent_cell_id':x['ordinary_cell_id'],'child_cell_id':x['connection_cell_id']}for x in plan.get('first_row_closure_pairs',[])]
  plan['override_resolution']=overrides.resolve(plan['cells']+plan.get('connection_cells',[]),'roof_tile',b['id'],[],dependencies=deps)
  pp=owner/'layout.json';pp.write_text(json.dumps(plan));plans.append({'binding_id':b['id'],'unit_id':b['unit_id'],'file':str(pp)});plan_records.append((b,wid,owner,plan))
 checkpoint('arrangementMs',start);start=time.perf_counter()
 for b,wid,owner,plan in plan_records:
  for role,cells,mkey in [('layout',plan['cells'],'source_render_metadata'),('connections',plan.get('connection_cells',[]),'connection_render_metadata')]:
   if not cells:continue
   target=owner/role;r=target/'work/scene/gpu';resources(r);md=None
   if plan.get(mkey)is not None:
    mp=target/'source-render-metadata.json';mp.write_text(json.dumps(plan[mkey],sort_keys=True,separators=(',',':')));md={'file':str(mp),'sha256':hashlib.sha256(mp.read_bytes()).hexdigest()}
   from unit_clip import make_buffer
   if any('clip_polygons_world'in c or 'clip_polygons_uv'in c or 'clip_polygon_uv'in c for c in cells):
    clip,_=make_buffer(cells);(r/'cell-clip.bin').write_bytes(clip)
   design=plan.get('roof_design' if role=='layout' else 'connection_roof_design')
   spec={'cells':cells,'slot':next(x['slot']for x in glob['color_rows']if x['wall_id']==wid),'source_render_metadata':md,'unit':'roof_tile'}
   if design:
    spec.pop('source_render_metadata')
    spec['roof_design']=design
   (target/'cells.json').write_text(json.dumps(spec));index=len(manifests)
   if design:
    timeline=copy.deepcopy(plan['gravity_timeline'])
    for step in timeline:step['instance_count']=len(cells)
    (target/'feedback.json').write_text(json.dumps({'schema':'roof-gravity-v1','steps':timeline}))
   packed_units=kernel.pack(spec) if kernel else None
   for unit in ('roof_tile','brick','wooden_plank'):
    packed=r/('unit.instances.bin'if unit=='roof_tile'else unit+'.bin')
    if packed_units is not None:packed.write_bytes(packed_units[unit])
    else:
     ip=target/(unit+'.json');ip.write_text(json.dumps({**spec,'unit':unit}));pack_jobs.append({'input':str(ip),'output':str(packed)})
    if unit!='roof_tile':variants.append({'group':index,'unit':unit,'file':str(packed)})
   (target/'manifest.json').write_text(json.dumps({'status':'prepared','source_render_metadata':md}));manifests.append({'binding_id':b['id'],'role':role,'unit_id':'roof_tile','file':str(target/'manifest.json')})
 if pack_jobs:
  batch=out/'pack-jobs.json';batch.write_text(json.dumps(pack_jobs));subprocess.run([sys.executable,str(Path(__file__).with_name('pack_units.py')),str(a.provider),str(batch)],check=True,capture_output=True)
 checkpoint('packingMs',start)
 start=time.perf_counter();topology=pitched_topology(bundle,supports) if a.gpu_feedback else arrangements.generate({'type':'roof_contacts'},{'type':'roof_contact_assembly'},context={'bundle':bundle,'directory':out/'contacts'})['topology'];checkpoint('connectionTopologyMs',start);assembly={'draws':draws,'plans':plans,'unit_manifests':manifests,'resolved_geometries':resolved['geometries'],'resolved_bindings':resolved['bindings'],'construction':{'source':source,'mapping':mapping},'roof_connections':{'cells':[],'resolution':{'assignments':[]},'topology':topology},'camera':camera,'effective_source_bundle':str(bundle_path)}
 prepared={'schema':'resident-prepared-v1','pipeline':'galacean-feedback-v1' if a.gpu_feedback else 'resident-v1','output':str(out),'request':doc,'revision':baseline['revision']+1,'render':assembly};(out/'prepared.json').write_text(json.dumps(prepared));(out/'variants.json').write_text(json.dumps(variants))
 lab={'revision':prepared['revision'],'kind':'layout','document':doc,'request':doc,'camera':{**camera,'view_projection':list(struct.unpack_from('<16f',(root/'diagnostic-view.bin').read_bytes(),384))},'width':256,'height':256,'draws':draws,'counts':{'geometry_count':len(ordinary)},'cells':[],'geometries':resolved['geometries'],'bindings':resolved['bindings'],'surfaces':[g for g in resolved['geometries']if 'geometry'in g],'construction':assembly['construction'],'connection_inventory':inventory(doc,assembly),'scope_notes':[]}
 if kernel:timings.update(runtimeKernelMs=kernel.milliseconds,runtimeKernelCalls=kernel.calls,geometryBackend='engine-next-javascript',roofArrangementBackend='engine-next-typescript',constructionBackend='native-recovery-provider')
 (out/'lab-scene.json').write_text(json.dumps(lab));timings['totalMs']=(time.perf_counter()-t)*1000;(out/'timings.json').write_text(json.dumps(timings));print(json.dumps(timings))
if __name__=='__main__':
 if '--gpu-feedback' in sys.argv:
  from runtime_kernel import RuntimeKernel
  with RuntimeKernel() as kernel:main(kernel)
 else:main()
