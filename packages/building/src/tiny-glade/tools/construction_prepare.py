"""Production family scheduler derived from retained native-scene/prepare.py.
The caller supplies request-owned producers, including shared platform support
resources. Native CPU topology is retained; roofs use recovered deterministic
placement. GPU simulation and deformation are performed by the resident renderer.
"""
from pathlib import Path
import struct,json,hashlib,contextlib,time

def prepare(r,live,whole_report,output_dir,*,load,scene_sources):
 out=Path(output_dir);out.mkdir(parents=True,exist_ok=True);families={};timings={};ctx=r.edited_decorator_context;records=ctx['records'];m=r.mu
 @contextlib.contextmanager
 def boundary():
  old=dict(r.adapters);tls={a:bytes(m.mem_read(a,8))for a in [0x1032b98c8,0x1032b9a00]}
  try:yield
  finally:
   r.adapters.clear();r.adapters.update(old)
   for a,b in tls.items():m.mem_write(a,b)
 def binary(family,name,raw):
  path=out/family/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw);return {'file':str(path),'byte_size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 def stage(name,fn):
  started=time.perf_counter()
  with boundary():data=fn()
  timings[name]=(time.perf_counter()-started)*1000
  if isinstance(data,dict):data.pop('provenance',None)
  path=out/name/'results.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,separators=(',',':'))+'\n');families[name]={'status':'returned','report':str(path),'data':data};print('PREPARED',name,'heap',hex(r.heap),flush=True);return data
 # Same immutable original source inputs as caller, all mutable geometry comes live.
 source={'request':whole_report.get('current_input_provenance',{}).get('semantic_request'),'render_slots':{wid:struct.unpack('<I',m.mem_read(p+0x274,4))[0]for wid,p in live['walls'].items()},'roofs88':{wid:bytes(m.mem_read(p,88)).hex()for wid,p in live['roofptrs'].items()},'blueprint_ids':[x['id']for x in records]}
 source['surfaces']=live['pubmod']['capture_public'](r,live['public'])
 families['walls']={'status':'returned','data':whole_report}
 def upload():
  _,j=load('gpu/capture-wall-sparse-upload.py')['run'](r,whole_report,out/'wall_upload')
  for row in j['rows']:
   for key in ['file','sparse_index_file']:row[key]=str(out/'wall_upload'/row[key])
  j['storage_file']=str(out/'wall_upload/whole-wall-sparse-storage64.bin');return j
 stage('wall_upload',upload)
 globals_=stage('globals',lambda:load('native-scene/globals.py')['build'](r,live,out/'globals'))
 roofs=stage('roofs',lambda:load('native-scene/roof.py')['run'](r,live,out/'roofs'))
 def deco():
  commands=load('edited-decorator-instances/live-builders.py')['build'](r)['generate'](records);instances=load('edited-decorator-instances/live-updaters.py')['build'](r)['generate'](commands)
  for row in instances:row.update(binary('decorators',f"id{row['id']}-render{row['index']}.instance64.bin",bytes.fromhex(row['hex'])))
  return {'commands':commands,'instances':instances,'blueprints':records,'smoke_scope':'CPU updater only; effect GPU excluded'}
 stage('decorators',deco)
 def dormers():
  api=load('edited-decorators/live-dormer-tiles.py')['build'](r,live,ctx['cache'],ctx['blueprints']);rows=api['regenerate']()
  for row in rows:row.update(binary('dormers',f"wall{row['wall_id']}.instances64.bin",bytes.fromhex(row['hex'])))
  holes=[]
  for row in records:
   v=row['vectors']['dormer_holes'];raw=bytes.fromhex(v['hex']);holes.append({'decorator_id':row['id'],'wall_id':row['wall_id'],**binary('dormers',f"deco{row['id']}.holes48.bin",raw),'raw_hex':raw.hex()})
  return {'instances':rows,'blueprint_holes':holes}
 stage('dormers',dormers)
 def chimney():
  api=load('edited-decorators/live-chimney.py')['build'](r,live,ctx['derived']);row=api['regenerate'](records);row.update(binary('chimney','instances64.bin',bytes.fromhex(row['hex'])));return row
 stage('chimney',chimney)
 stage('floors',lambda:load('native-scene/floors.py')['run'](r,live,roofs['animations'],out/'floors'))
 def auto():
  api=load('autoclutter/capture.py');registry,meta=load('autoclutter/registry.py')['build'](r);vec,raw=api['candidates'](r,records);state,objects=api['on_windows'](r,registry,vec);commands,_=api['manage'](r,state);components=load('autoclutter-time/capture-animation.py')['components'](r,commands);animation=load('autoclutter-time/live-animation.py')['build'](r,components);settled=animation['advance'](120);assert all(x['progress']==1 for x in settled)
  updater=load('autoclutter-instances/updaters.py')['build'](r);frames=updater['frames'](settled);pool,material=load('autoclutter-instances/material-pool.py')['build'](r);ubers=updater['uber'](settled,pool,r.blob(bytes([0xa5])*256));rows=frames+ubers
  for i,row in enumerate(rows):row.update(binary('autoclutter',f'instance{i}.bin',bytes.fromhex(row['hex64'])))
  return {'instances':rows,'components':components,'settled':settled,'registry':meta,'material_pool':material,'material_ssbo':binary('autoclutter','materials36.bin',bytes.fromhex(material['uploads'][0]['raw36_hex'])),'commands':binary('autoclutter','commands.bin',commands),'candidates':binary('autoclutter','candidates80.bin',raw),'objects':binary('autoclutter','objects104.bin',objects)}
 stage('autoclutter',auto)
 def plaster():
  event=next(e for e in whole_report['emitted_messages'] if e['name']=='RecalculatePlasterCmd');ids=[x[1] for x in struct.iter_unpack('<QQ',bytes.fromhex(event['hex']))];rows=[]
  for wid in ids:
   row=load('parameters/plaster-native-capture.py')['run_live'](r,live,wid,r.whole_wall_context['holes']);assert row['status']=='root-returned';row.pop('provenance',None)
   for i,b in enumerate(row['buffers']):b.update(binary('plaster',f'wall{wid}-side{i}.vertices48.bin',bytes.fromhex(b['raw_hex'])))
   row['patch_file']=binary('plaster',f'wall{wid}.patches32.bin',b''.join(bytes.fromhex(x)for x in row['patches32_hex']));rows.append(row)
  if rows:packed=load('gpu/capture-plaster-instances.py')['run_live'](r,live,rows,out/'plaster',prefix='plaster')
  else:
   binary('plaster','plaster.instances48.bin',b'');packed={'results':[],'count':0}
  packed.pop('provenance',None)
  return {'rows':rows,'packed':packed,'instances48':str(out/'plaster/plaster.instances48.bin')}
 stage('plaster',plaster)
 def foundation():
  result=load('edited-walls/foundation-native.py')['run_live'](r,live)
  if result['commands_hex']:
   packed=load('edited-walls/foundation-instances.py')['run_live'](r,live,result,out/'foundation');packed.pop('provenance',None);result['packed']=packed
  return result
 stage('foundation',foundation)
 def boards():
  result=load('edited-walls/boards-native.py')['run_live'](r,live)
  for row in result['rows']:row.update(binary('boards',f"wall{row['wall_id']}.instances{row['stride']}.bin",bytes.fromhex(row['hex'])))
  for i,row in enumerate(result['buffers']):row.update(binary('boards',f'buffer{i}.bin',bytes.fromhex(row['raw_hex'])))
  return result
 stage('boards',boards)
 conn=r.current_scene_inputs['connections']
 # Original spawn_stitch_bricks is a selected geometry producer, including the
 # style0 Cottage branch. Never treat a nonempty transform list as already drawn.
 load('native-scene/stitch-bricks.py')['build'](r,live,conn,out/'connections/stitch-bricks')
 if r.current_scene_inputs.get('roof_connections')is not None:
  stage('roof_connections',lambda:load('native-scene/merlons.py')['construct'](r,live,r.current_scene_inputs['roof_connections'],conn,out/'roof_connections'))
 stage('connections',lambda:conn);stage('platform',lambda:r.current_scene_inputs['platform'])
 def supports():
  triggers=ctx['cache']['trigger_geometry']()[0];roof_triggers={wid:triggers+i*72 for i,wid in enumerate(live['ids'])};pairs=[dict(p,capacity=len(p['points']))for p in conn['outputs']['intersections']]
  return load('parameters/audit-support-wrappers-native.py')['run'](existing=(r,live),output_dir=out/'supports',pair_rows=pairs,roof_triggers=roof_triggers)
 stage('supports',supports)
 result={'stage_timings_ms':timings,'schema':'native-scene-bundle-v1','status':'prepared','source':source,'globals':globals_,'families':families,'boundaries':['Fresh original native producer bundle, not full Bevy ECS scheduler','Controlled native settled animation, no historical clock','No external clutter packs; historical mod state unknown','Roof rectangular/no-mask and current Floor8 bottom consumer remain explicit supported input guards'],'provenance':r.provenance()}
 artifacts={}
 def discover(value):
  if isinstance(value,dict):
   for v in value.values():discover(v)
  elif isinstance(value,list):
   for v in value:discover(v)
  elif isinstance(value,str) and value.startswith('/') and len(value)<4096:
   p=Path(value)
   if p.is_file():
    raw=p.read_bytes();artifacts[str(p)]={'file':str(p),'byte_size':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'role':'current-output'if p.is_relative_to(out.parent)else'shared-source'}
 discover(result);result['artifacts']=list(artifacts.values())
 result['producer_sources']=[{'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(list(scene_sources.glob('*.py'))+list((scene_sources.parent/'edited-decorator-instances').glob('*.py')))]
 path=out/'bundle.json';result['manifest']=str(path);path.write_text(json.dumps(result,separators=(',',':'))+'\n');return result
