"""Export authoring results + original meshes/shaders into a resident GPU package.
Does not consume audit varyings, depth, gbuffer, screenshots or expanded meshes.
Assets remain local, content-addressed and excluded from source control.
"""
from pathlib import Path
import argparse, json, hashlib, struct, re, os, shutil
from port_shader import port

class Export:
 def __init__(self, investigation, current, output, *, static_package=None, shared_asset_url=None):
  self.i=investigation;self.j=json.loads(current.read_text());self.out=output;output.mkdir(parents=True,exist_ok=True)
  self.static_package=Path(static_package).resolve() if static_package else None
  if shared_asset_url and not self.static_package:raise ValueError('Shared assets require a prepared package')
  self.shared_asset_url=shared_asset_url;self.shared_files=set()
  self.static_textures=json.loads((self.static_package/'scene.json').read_text())['textures'] if self.static_package else None
  self.native=Path(self.j['output'])/'compiled/native-context/work/scene/gpu';self.programs={};self.assets={};self.textures={};self.draws=[]
 def blob(self,data):
  source=data if isinstance(data,Path) else None
  if source is not None:data=source.read_bytes()
  h=hashlib.sha256(data).hexdigest();name=h+'.bin';p=self.out/name
  if self.shared_asset_url and (self.static_package/name).is_file():
   if name not in self.shared_files and source!=self.static_package/name and hashlib.sha256((self.static_package/name).read_bytes()).hexdigest()!=h:raise ValueError('Shared asset changed: '+name)
   self.shared_files.add(name);return name
  if not p.exists():
   if source is not None:
    try:os.link(source,p)
    except OSError:shutil.copyfile(source,p)
   else:p.write_bytes(data)
  return name
 def texture(self,name):
  if name in self.textures:return name
  if self.static_textures is not None:
   if name not in self.static_textures:raise ValueError('Texture absent from prepared asset package: '+name)
   record=self.static_textures[name]
   for file in dict.fromkeys(record['levels']+record['compressed']):
    if not re.fullmatch(r'[0-9a-f]{64}\.bin',file) or self.blob(self.static_package/file)!=file:raise ValueError('Prepared texture changed: '+file)
   self.textures[name]=record;return name
  from PIL import Image
  candidates=[self.i/'full-reuse/shaders/texture-manifest.json',self.native/'decorator-textures/manifest.json',self.native/'window-glass-textures/manifest.json',self.native/'wooden-plank-textures/manifest.json',self.native/'plaster-textures/manifest.json']
  rec=None
  for p in candidates:
   if not p.exists():continue
   rows=json.loads(p.read_text());rows=rows if isinstance(rows,list) else rows.get('textures',[])
   rec=next((x for x in rows if x['name']==name),None)
   if rec:break
  if not rec:raise ValueError('Missing texture '+name)
  pngs=rec.get('decoded',rec.get('decodedImages',[]))
  if not pngs:
   pngs=next((v for v in rec.values() if isinstance(v,list) and v and isinstance(v[0],dict) and 'file' in v[0] and 'mip' in v[0]),[])
  levels=[];compressed=[];payload=Path(rec['rawPayloadFile']).read_bytes();layer_size=sum(rec['mipByteLengthsPerLayer']);fmt=rec['format']['formatValue']
  for mip in range(rec['mipCount']):
   packed=[];parts=[];w=max(1,rec['width']>>mip);h=max(1,rec['height']>>mip)
   for layer in range(rec['arrayLayers']):
    offset=layer*layer_size+sum(rec['mipByteLengthsPerLayer'][:mip]);chunk=payload[offset:offset+rec['mipByteLengthsPerLayer'][mip]]
    packed.append(chunk)
    if fmt==37:im=Image.frombytes('RGBA',(w,h),chunk)
    elif fmt in (145,146):im=Image.frombytes('RGBA',(w,h),chunk,'bcn',(7,'BC7'))
    elif fmt==139:im=Image.frombytes('L',(w,h),chunk,'bcn',(4,'BC4'))
    else:raise ValueError('Unsupported VkFormat '+str(fmt))
    parts.append(im.convert('RGBA').tobytes())
   levels.append(self.blob(b''.join(parts)))
   compressed.append(self.blob(b''.join(packed)))
  self.textures[name]={'width':rec['width'],'height':rec['height'],'layers':rec['arrayLayers'],'srgb':rec['format']['formatValue']==146,'levels':levels,'compressed':compressed,'vkFormat':fmt}
  return name
 def program(self,family):
  if family in self.programs:return self.programs[family]
  prefixes={'roof':self.i/'full-reuse/shaders/original/nani_instanced_roof','brick':self.i/'full-reuse/shaders/original/wall_brick_lod0','frame':self.i/'scene-reuse/gpu/decorator-shaders/nani_solid_vertex_color_window'}
  prefixes['glass']=self.i/'scene-reuse/gpu/decorator-shaders/nani_solid_vertex_color_window_glass'
  prefixes['wood']=self.i/'scene-reuse/gpu/wooden-plank/nani_wooden_plank'
  prefixes['plaster']=self.i/'scene-reuse/lighting/plaster-shaders/nani_plaster'
  base_family=family.removesuffix('_clip').removesuffix('_roof');prefix=prefixes[base_family]; pair={}
  for n,stage in enumerate(['vert','frag']):
   path=Path(str(prefix)+f'.{n}');source=path.with_suffix(path.suffix+'.glsl').read_text() if path.with_suffix(path.suffix+'.glsl').exists() else '';reflection=json.loads(path.with_suffix(path.suffix+'.reflection.json').read_text())
   if base_family=='wood' and stage=='frag':
    from wood_shader import source as wood_source
    source=wood_source(Path(str(prefix)+'.1.metal').read_text(),Path(str(prefix)+'.0.glsl').read_text(),reflection,(self.i/'full-reuse/shaders/original/nani_instanced_roof.1.glsl').read_text())
   if base_family=='plaster':
    from plaster_shader import adapt,vertex,flatten
    frag=adapt('',Path(str(prefix)+'.1.glsl').read_text(),reflection)
    source=flatten(vertex(Path(str(prefix)+'.0.metal').read_text(),frag,reflection,(self.i/'full-reuse/shaders/original/nani_instanced_roof.0.glsl').read_text()) if stage=='vert' else frag,stage)
   active={x['location'] for x in json.loads(Path(str(prefix)+'.1.reflection.json').read_text()).get('inputs',[])}
   if family.startswith('brick_roof'):active.add(13)
   if family=='plaster':active.update((9,10,11))
   pair[stage]=port(source,reflection,stage,active,instance_binding=(0,0) if base_family=='roof' else None);pair[stage]['original_sha256']=hashlib.sha256(source.encode()).hexdigest()
  if family.removesuffix('_clip').endswith('_roof'):
   from dormer_shader import wrapper
   w=wrapper((self.i/'full-reuse/shaders/original/nani_instanced_roof.1.glsl').read_text())
   world,instance=('v2','v13') if base_family=='brick' else ('v0','v2')
   frag=pair['frag']['source'];extra='flat in uint v13;\n' if base_family=='brick' else ''
   frag=frag.replace('void main(){original_main();',extra+w+'\nvoid main(){if(domainContains('+instance+','+world+'))discard;original_main();')
   pair['frag']['source']=frag
  if family.endswith('_clip'):
   from cell_clip_shader import wrap
   pair=wrap(pair,base_family)
  self.programs[family]=pair;return pair
 def draw(self,id,family,root,instances,*,binding=None,variant=None,group=None):
  program_name=family+('_roof' if variant and family in ('brick','wood') else '');program_name+=('_clip' if variant and (root/'cell-clip.bin').exists() else '');program=self.program(program_name);r=json.loads((root/'resource-bindings.json').read_text());data=instances.read_bytes();stride=80 if family=='wood' else 48 if family=='plaster' else 64;count=len(data)//stride
  ind=struct.pack('<'+'I'*count,*range(count));common={'5:0':root/'diagnostic-view.bin','4:0':Path(r['frame']),'3:0':Path(r['frameCounter'])}
  if family=='roof':
   attrs=[{'location':0,'size':3,'stride':12,'offset':0,'file':self.blob(root/'roof.vertices.bin')}];indices=root/'roof.indices.bin'
   storage={'7:0':ind,'0:0':data,'10:0':Path(r['identity']),'8:1':Path(r['roofColors']),'9:1':root/('unit.counts.bin' if instances.name.startswith('unit') else 'roof-current.counts.bin'),'9:0':root/('unit.holes.bin' if instances.name.startswith('unit') else 'roof-current.holes.bin')}
   tex={'roof_colors_tex':'roof_colors','material_data_roof_tile_damage':'roof/roof_tile_damage','material_data_roof_tile_normal':'roof/roof_tile_normal'}
  elif family=='brick':
   vb=self.blob(root/'brick.vertices.bin');attrs=[{'location':n,'size':3 if n<2 else 1,'integer':n==2,'stride':28,'offset':n*12,'file':vb}for n in range(3)];indices=root/'brick.indices.bin'
   storage={'0:2':ind,'0:1':data,'9:0':root/('stone_foundation.u32' if (root/'stone_foundation.u32').exists() else 'stone_foundation.bin'),'8:1':Path(r['roofColors']),'7:0':Path(r['wallColors']),'10:0':Path(r['identity'])};common['0:0']=b'\0'*16;common['11:0']=root.parent/'color-library-base.bin';tex={'roof_colors_tex':'roof_colors','wall_color_data_brick_colors':'brick_colors'}
  elif family=='wood':
   if any(struct.unpack_from('<QII',data,offset+64)[:2]!=(0,0) for offset in range(0,len(data),80)):raise ValueError('Wood window-cut pointers require a separate supported ABI')
   mesh='wooden_plank';attrs=[{'location':n,'size':1 if n==3 else 2 if n==2 else 3,'integer':n==3,'stride':4 if n==3 else 8 if n==2 else 12,'offset':0,'file':self.blob(root/'wooden-plank-meshes'/f'{mesh}.{key}.bin')}for n,key in enumerate(['Vertex_Position','Vertex_Normal','Vertex_UV','is_bevel'])];indices=root/'wooden-plank-meshes'/f'{mesh}.indices.bin'
   storage={'6:0':ind,'0:0':data,'9:0':root/'wooden.bin','8:0':root/'halftimber.bin'}
   tex={'wooden_wall_colors_tex':'timberframe','halftimber_colors_tex':'timberframe','material_data_wood_roughness':'wood_detail/roughness','material_data_dirtpath_heightmap':'dirtpath_heightmap'}
  elif family=='plaster':
   attrs=[];indices=root/'plaster_index_mesh.indices.u32'
   rows=json.loads((root/'cottage-plaster-instances.json').read_text())['results'];sources=json.loads((root/'plaster-geometry.json').read_text())['results']
   arena=bytearray();locations=[]
   for wall in sources:
    for rec in wall['buffers']:
     raw=Path(rec['file']).read_bytes();locations.append((wall['wall_id'],int(rec['resource_address'],0),len(raw),len(arena)//16));arena.extend(raw)
   data=bytearray(data)
   for idx,row in enumerate(rows):
    address=struct.unpack_from('<Q',data,idx*48+32)[0];matches=[(base,offset)for wid,base,length,offset in locations if wid==row['wall_id'] and base<=address<base+length]
    if len(matches)!=1:raise ValueError('Ambiguous plaster pointer owner')
    base,offset=matches[0]
    if (address-base)%16:raise ValueError('Unaligned plaster pointer')
    struct.pack_into('<II',data,idx*48+32,offset+(address-base)//16,0)
   storage={'8:0':ind,'0:1':bytes(data),'7:0':Path(r['wallColors'])};tex={'wall_color_data_plaster_colors':'plaster_colors','material_data_mortar':'mortar','material_data_normal_map':'default_normal'}
  elif family in ('frame','glass'):

   doc=json.loads((root/('cottage-window-'+family+'-instances.json')).read_text());row=next(x for x in doc['results'] if Path(x['file']).name==instances.name); mesh=row.get('mesh_name') or (Path(row['mesh']).name if 'mesh'in row else None)
   if not mesh:raise ValueError('Decorator producer must identify its template mesh')
   attrs=[{'location':n,'size':1 if n==4 else 2 if n==3 else 3,'integer':n==4,'stride':4 if n==4 else 8 if n==3 else 12,'offset':0,'file':self.blob(root/'decorator-meshes'/f'{mesh}.{key}.bin')} for n,key in enumerate(['Vertex_Position','Vertex_Color','Vertex_Normal','Vertex_UV']+(['is_glass'] if family=='glass' else []))];indices=root/'decorator-meshes'/f'{mesh}.indices.bin'
   storage={'19:0':ind,'0:0':data};tex={'window_colors_window_colors':'timberframe'}
   if family=='glass':
    storage={'6:0':ind,'0:1':data};common['0:0']=struct.pack('<8I',0,0,0,0,1,0,0,0);tex={'resource0':'menu/feedback/think','resource1':'menu/feedback/aww','resource2':'window_glass'}
  resources={}
  for stage in program.values():
   for s in stage['storage']: resources[s['name']]={'kind':'storage','file':self.blob(storage[f'{s["set"]}:{s["binding"]}'])}
   for u in stage['uniforms']: resources[u['name']]={'kind':'uniform','file':self.blob(common[f'{u["set"]}:{u["binding"]}'])}
   for t in stage['textures']:resources[t['name']]={'kind':'texture','texture':self.texture(tex[t['name']]),'array':t['type']=='texture2DArray'}
  if program_name.endswith('_clip'):resources['cell_clip']={'kind':'storage','file':self.blob(root/'cell-clip.bin')}
  if family=='plaster':resources['plaster_vertices']={'kind':'storage','file':self.blob(bytes(arena))}
  if variant and family in ('brick','wood'):
   for key,file in [('roof','unit.instances.bin'),('counts','unit.counts.bin'),('holes','unit.holes.bin')]:resources['domain_'+key]={'kind':'storage','file':self.blob(root/file)}
  direct={'file':self.blob(data),'stride':64} if family=='roof' else None
  feedback_path=root.parents[2]/'feedback.json'
  if direct and variant and feedback_path.exists():direct['feedback']=json.loads(feedback_path.read_text())
  self.draws.append({'instance_buffer':direct,'variant':variant,'group':group,'id':id,'family':family,'binding_id':binding,'program':program_name,'indirection':{'brick':'storage_0_2','roof':'storage_7_0','wood':'storage_6_0','frame':'storage_19_0','glass':'storage_6_0','plaster':'storage_8_0'}[family],'count':count,'attributes':attrs,'indices':self.blob(indices),'indexCount':indices.stat().st_size//4,'resources':resources})
 def run(self):
  n=self.native
  for d in self.j['render']['draws']:
   if d['family']=='brick' and not d.get('binding_id'):self.draw(d['id'],'brick',n,n/(d['id']+'.instances.bin'))
   elif d['family'] in ('frame','glass'):self.draw(d['id'],d['family'],n,n/(d['id']+'.bin'))
  self.draw('plaster','plaster',n,n/'cottage-plaster.instances48.bin')
  retained=Path(self.j['output'])/'compiled/retained-roof/retained/work/scene/gpu'
  self.draw('native-roof-retained','roof',retained,retained/'unit.instances.bin')
  groups=[];variant_file=Path(self.j['output'])/'variants.json' if self.j.get('schema')=='resident-prepared-v1' else self.out.parent/'variants/variants.json';variants=json.loads(variant_file.read_text()) if variant_file.exists() else []
  for idx,entry in enumerate(self.j['render']['unit_manifests']):
   p=Path(entry['file']).parent/'work/scene/gpu';self.draw(f'generic-{idx}','roof',p,p/'unit.instances.bin',binding=entry['binding_id'],variant='roof_tile',group=idx)
   spec=json.loads((Path(entry['file']).parent/'cells.json').read_text());groups.append({'id':idx,'binding_id':entry['binding_id'],'role':entry['role'],'cells':spec['cells']})
   for v in variants:
    if v['group']==idx:self.draw(f'generic-{idx}-{v["unit"]}','wood' if v['unit']=='wooden_plank' else 'brick',p,Path(v['file']),binding=entry['binding_id'],variant=v['unit'],group=idx)
  plans=[]
  for entry in self.j['render']['plans']:
   plan=json.loads(Path(entry['file']).read_text());plans.append({'binding_id':entry['binding_id'],'cells':plan['cells']+plan.get('connection_cells',[]),'dependencies':plan['override_resolution'].get('dependencies',[])})
  m={'pipeline':self.j.get('pipeline','resident-v1'),'authoring_resources':str(self.native.resolve()),'plans':plans,'schema':'tiny-glade-resident-v1','width':256,'height':256,'groups':groups,'document':self.j['request'],'revision':self.j['revision'],'programs':self.programs,'textures':self.textures,'draws':self.draws,'source':'Original natural-layout instance ABI and shipped template geometry. Authoring stage is still the native recovery pipeline.'}
  if self.shared_asset_url:m['sharedAssets']={'baseUrl':self.shared_asset_url,'files':sorted(self.shared_files)}
  (self.out/'scene.json').write_text(json.dumps(m,ensure_ascii=False));print(json.dumps({'draws':len(self.draws),'instances':sum(d['count']for d in self.draws),'programs':len(self.programs),'textures':len(self.textures)}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('investigation',type=Path);p.add_argument('current',type=Path);p.add_argument('output',type=Path);p.add_argument('--static-package',type=Path);p.add_argument('--shared-asset-url');a=p.parse_args();Export(a.investigation,a.current,a.output,static_package=a.static_package,shared_asset_url=a.shared_asset_url).run()
