"""Pack Unity's resolved meshes/materials/terrain into deterministic gallery assets."""
import argparse, array, hashlib, io, json, math, struct, sys, re
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
data=json.loads((a.raw/'scene.json').read_text());source_files=set();output_files=[]
def write(name,content):
 (a.output/name).write_bytes(content);output_files.append(name);return name
def encode(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'),sort_keys=True).encode()
def rgb(c):return [c[k] for k in ('r','g','b')]
def xyz(v):return [v['x'],v['y'],-v['z']]
def texture(path):
 if not path:return None
 source_files.add(path);src=a.source/path
 name=hashlib.sha256(path.encode()).hexdigest()[:12]+'.png'
 if name not in output_files:
  image=Image.open(src).convert('RGBA'); image.thumbnail((1024,1024),Image.Resampling.LANCZOS);b=io.BytesIO();image.save(b,format='PNG');write(name,b.getvalue())
 return name
# Keep a finite ribbon following the authored river, rather than a rectangular valley.
BANK_MARGIN=10.0
VEGETATION_MARGIN=8.0
ROCK_CONTACT_MARGIN=2.0
verts=data['river']['positions'];origin=data['riverPosition'];points=[];corrections=[];prev=float('inf')
for i in range(0,len(verts),2):
 u,v=verts[i:i+2];position=[(u[k]+v[k])*.5+origin[k] for k in ('x','y','z')];original=position[1];position[1]=min(prev,original);prev=position[1]
 if abs(original-prev)>1e-5:corrections.append({'point':i//2,'originalHeight':original,'height':prev})
 position[2]*=-1;points.append({'id':'valley-'+str(i//2),'position':position,'width':math.hypot(u['x']-v['x'],u['z']-v['z']),'flowSpeed':1,'bankFeather':0.15})

def bank_distance(x,z):
 best=float('inf')
 for aa,bb in zip(points,points[1:]):
  ap,bp=aa['position'],bb['position'];dx,dz=bp[0]-ap[0],bp[2]-ap[2]
  fraction=max(0.0,min(1.0,((x-ap[0])*dx+(z-ap[2])*dz)/(dx*dx+dz*dz)))
  half_width=(aa['width']+(bb['width']-aa['width'])*fraction)*0.5
  best=min(best,math.hypot(x-ap[0]-dx*fraction,z-ap[2]-dz*fraction)-half_width)
 return best
# Resolve contact using the original world bounds, including cliffs whose pivots are far from the bank.
def touches_river(inst):
 low,high=inst['boundsMin'],inst['boundsMax']
 for aa,bb in zip(points,points[1:]):
  ap,bp=aa['position'],bb['position'];length=math.hypot(bp[0]-ap[0],bp[2]-ap[2]);steps=max(1,math.ceil(length))
  for step in range(steps+1):
   f=step/steps;x=ap[0]+(bp[0]-ap[0])*f;z=ap[2]+(bp[2]-ap[2])*f
   dx=max(low['x']-x,0,x-high['x']);dz=max(-high['z']-z,0,z+low['z'])
   if math.hypot(dx,dz)<=(aa['width']+(bb['width']-aa['width'])*f)*0.5+ROCK_CONTACT_MARGIN:return True
 return False
source_instance_count=len(data['instances'])
kept_instances=[i for i in data['instances'] if (touches_river(i) if ('Rock' in i['name'] or 'Cliff' in i['name']) else bank_distance(i['position']['x'],-i['position']['z'])<=VEGETATION_MARGIN)]
removed_instances=[i['id'] for i in data['instances'] if i not in kept_instances]
data['instances']=kept_instances
used_materials={m for i in kept_instances for m in i['materials']}
data['materials']=[m for m in data['materials'] if m['id'] in used_materials]

# Shared glTF mesh buffers. All original LOD instances are retained; runtime selects a single LOD.
gltf={'asset':{'version':'2.0','generator':'River Valley Unity export v1'},'buffers':[{}],'bufferViews':[],'accessors':[],'meshes':[],'nodes':[],'materials':[],'textures':[],'images':[],'samplers':[{'wrapS':10497,'wrapT':10497,'minFilter':9987,'magFilter':9729}],'scenes':[{'nodes':[]}],'scene':0};binary=bytearray();texture_ids={}
def buffer(content,target=None):
 while len(binary)%4:binary.append(0)
 view={'buffer':0,'byteOffset':len(binary),'byteLength':len(content)}
 if target:view['target']=target
 gltf['bufferViews'].append(view);binary.extend(content);return len(gltf['bufferViews'])-1
def accessor(values,kind,component=5126):
 n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind];fmt='f' if component==5126 else 'I';flat=[x for v in values for x in (v if isinstance(v,list) else [v])];content=struct.pack('<'+str(len(flat))+fmt,*flat);acc={'bufferView':buffer(content,34962 if n>1 else 34963),'componentType':component,'count':len(values),'type':kind}
 if kind=='VEC3':acc.update(min=[min(v[i] for v in values) for i in range(3)],max=[max(v[i] for v in values) for i in range(3)])
 gltf['accessors'].append(acc);return len(gltf['accessors'])-1
def gltf_texture(path):
 if path not in texture_ids:
  filename=texture(path);raw=(a.output/filename).read_bytes();gltf['images'].append({'bufferView':buffer(raw),'mimeType':'image/png'});gltf['textures'].append({'source':len(gltf['images'])-1,'sampler':0});texture_ids[path]=len(gltf['textures'])-1
 return texture_ids[path]
material_ids={}
for m in data['materials']:
 mat={'name':m['name'],'pbrMetallicRoughness':{'baseColorFactor':rgb(m['color'])+[1],'metallicFactor':0,'roughnessFactor':m['roughness']},'doubleSided':m['foliage'],'extras':{'sourceId':m['id'],'foliage':m['foliage']}}
 if m['diffuse']:mat['pbrMetallicRoughness']['baseColorTexture']={'index':gltf_texture(m['diffuse'])}
 if m['normal']:mat['normalTexture']={'index':gltf_texture(m['normal'])}
 if m['foliage']:mat.update(alphaMode='MASK',alphaCutoff=m['cutoff'])
 material_ids[m['id']]=len(gltf['materials']);gltf['materials'].append(mat)
mesh_by_id={m['id']:m for m in data['meshes']};mesh_buffers={};mesh_ids={}
for inst in data['instances']:
 mesh=mesh_by_id[inst['mesh']];key=(inst['mesh'],tuple(inst['materials']))
 if key not in mesh_ids:
  if inst['mesh'] not in mesh_buffers:
   attrs={'POSITION':accessor([xyz(v) for v in mesh['positions']],'VEC3'),'NORMAL':accessor([xyz(v) for v in mesh['normals']],'VEC3')}
   if mesh['uv']:attrs['TEXCOORD_0']=accessor([[v['x'],1-v['y']] for v in mesh['uv']],'VEC2')
   if mesh['tangents']:attrs['TANGENT']=accessor([xyz(v)+[v['w']] for v in mesh['tangents']],'VEC4')
   if mesh['colors']:attrs['COLOR_0']=accessor([rgb(v)+[v['a']] for v in mesh['colors']],'VEC4')
   indices=[]
   for sm in mesh['subMeshes']:
    ids=sm['indices'];indices.append(accessor([v for i in range(0,len(ids),3) for v in [ids[i],ids[i+2],ids[i+1]]],'SCALAR',5125))
   mesh_buffers[inst['mesh']]=(attrs,indices)
  attrs,indices=mesh_buffers[inst['mesh']];mesh_ids[key]=len(gltf['meshes']);gltf['meshes'].append({'name':mesh['id'],'primitives':[{'attributes':attrs,'indices':v,'material':material_ids[inst['materials'][min(i,len(inst['materials'])-1)]]} for i,v in enumerate(indices)]})
 q=inst['rotation'];node={'name':inst['id'],'mesh':mesh_ids[key],'translation':xyz(inst['position']),'rotation':[-q['x'],-q['y'],q['z'],q['w']],'scale':[inst['scale'][k] for k in ('x','y','z')],'extras':{k:inst[k] for k in ['name','lod','lodGroup','lodThreshold']}}
 gltf['scenes'][0]['nodes'].append(len(gltf['nodes']));gltf['nodes'].append(node)
# Terrain detail instances are generated deterministically from the original density map.
# Unity does not serialize individual grass blades; retain the authored patch coverage and dimensions.
t=data['terrain'];detail_instances=0;detail_info=[]
height_samples=array.array('f');height_samples.frombytes((a.raw/'heights.f32').read_bytes())
density=array.array('H');density.frombytes((a.raw/'details.u16').read_bytes());dr=t['detailResolution'];hn=t['resolution']
def terrain_height(x,z):
 gx=(x-t['position']['x'])/t['size']['x']*(hn-1);gz=(z-t['position']['z'])/t['size']['z']*(hn-1)
 ix=min(hn-2,max(0,int(gx)));iz=min(hn-2,max(0,int(gz)));fx=gx-ix;fz=gz-iz
 aa=height_samples[iz*hn+ix];bb=height_samples[iz*hn+ix+1];cc=height_samples[(iz+1)*hn+ix];dd=height_samples[(iz+1)*hn+ix+1]
 return aa+(bb-aa)*fx+(cc-aa)*fz if fx+fz<=1 else dd+(cc-dd)*(1-fx)+(bb-dd)*(1-fz)
def random01(seed):
 seed=(seed^61)^(seed>>16);seed=(seed*9)&0xffffffff;seed^=seed>>4;seed=(seed*0x27d4eb2d)&0xffffffff;seed^=seed>>15
 return seed/4294967296
for layer,detail in enumerate(t['details']):
 if not detail['texture']:raise ValueError('Mesh terrain details need an explicit exporter')
 grass_material=len(gltf['materials']);gltf['materials'].append({'name':'River Valley terrain grass','pbrMetallicRoughness':{'baseColorFactor':rgb(detail['healthy'])+[1],'baseColorTexture':{'index':gltf_texture(detail['texture'])},'metallicFactor':0,'roughnessFactor':1},'alphaMode':'MASK','alphaCutoff':0.5,'doubleSided':True})
 chunks={}
 for z in range(dr):
  for x in range(dr):
   for blade in range(density[(layer*dr+z)*dr+x]):
    seed=(layer*dr*dr+z*dr+x)*31+blade
    wx=t['position']['x']+(x+random01(seed))*t['size']['x']/dr;wz=t['position']['z']+(z+random01(seed+1))*t['size']['z']/dr;wy=terrain_height(wx,wz)
    if bank_distance(wx,-wz)>VEGETATION_MARGIN:continue
    width=detail['minWidth']+(detail['maxWidth']-detail['minWidth'])*random01(seed+2);height=detail['minHeight']+(detail['maxHeight']-detail['minHeight'])*random01(seed+3)
    chunk=chunks.setdefault((int((wx-t['position']['x'])/16),int((wz-t['position']['z'])/16)),[[],[],[],[],[]])
    pos,norm,uv,ids,colors=chunk;angle=random01(seed+4)*math.pi
    for turn in [0,math.pi/2]:
     dx=math.cos(angle+turn)*width*.5;dz=math.sin(angle+turn)*width*.5;start=len(pos)
     pos.extend([[wx-dx,wy,-wz+dz],[wx+dx,wy,-wz-dz],[wx-dx,wy+height,-wz+dz],[wx+dx,wy+height,-wz-dz]])
     norm.extend([[0,1,0]]*4);uv.extend([[0,1],[1,1],[0,0],[1,0]]);ids.extend([start,start+2,start+1,start+1,start+2,start+3])
     colors.extend([[0.28,0.32,0.24,1],[0.28,0.32,0.24,1],[1,1,1,1],[1,1,1,1]])
    detail_instances+=1
 for key,(pos,norm,uv,ids,colors) in sorted(chunks.items()):
  mi=len(gltf['meshes']);gltf['meshes'].append({'name':'terrain-grass-'+str(key),'primitives':[{'attributes':{'POSITION':accessor(pos,'VEC3'),'NORMAL':accessor(norm,'VEC3'),'TEXCOORD_0':accessor(uv,'VEC2'),'COLOR_0':accessor(colors,'VEC4')},'indices':accessor(ids,'SCALAR',5125),'material':grass_material}]})
  gltf['scenes'][0]['nodes'].append(len(gltf['nodes']));gltf['nodes'].append({'name':'terrain-grass-'+str(key),'mesh':mi})
 detail_info.append({**detail,'texture':texture(detail['texture']),'chunks':len(chunks)})
write('terrain-details.u16',(a.raw/'details.u16').read_bytes())
gltf['buffers'][0]['byteLength']=len(binary);js=encode(gltf);js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4);write('scenery.glb',struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
# Exact Unity height samples, row reversed once for right-handed Z. Runtime uses the same triangles.
t=data['terrain'];n=t['resolution'];heights=array.array('f');heights.frombytes((a.raw/'heights.f32').read_bytes());heights=array.array('f',[v for z in range(n-1,-1,-1) for v in heights[z*n:(z+1)*n]]);write('terrain.f32',heights.tobytes())
alphas=array.array('f');alphas.frombytes((a.raw/'alphas.f32').read_bytes());ar=t['alphaResolution'];layers=[]
for i,l in enumerate(t['layers']):
 layers.append({'diffuse':texture(l['diffuse']),'normal':texture(l['normal']),'tileSize':[l['tileSize']['x'],l['tileSize']['y']],'tileOffset':[l['tileOffset']['x'],l['tileOffset']['y']],'normalScale':l['normalScale'],'roughness':1-l['smoothness']})
assert len(layers)<=4,'Terrain shader supports up to four authored layers'
pixels=bytes(max(0,min(255,round(alphas[(z*ar+x)*len(layers)+c]*255))) if c<len(layers) else 0 for z in range(ar) for x in range(ar) for c in range(4));image=Image.frombytes('RGBA',(ar,ar),pixels);out=io.BytesIO();image.save(out,format='PNG');write('terrain-weights.png',out.getvalue())
# Retain HDR values; face orientation is handled by the same Unity -> GL world reflection.
sky=array.array('f');sky.frombytes((a.raw/'sky.f32').read_bytes());write('sky.rgba16f',b''.join(struct.pack('<e',max(-65504,min(65504,v))) for v in sky))
spacing=t['size']['x']/(n-1);origin_x=t['position']['x'];origin_z=-t['position']['z']-t['size']['z']
cells=[z*(n-1)+x for z in range(n-1) for x in range(n-1) if bank_distance(origin_x+(x+0.5)*spacing,origin_z+(z+0.5)*spacing)<=BANK_MARGIN+spacing/math.sqrt(2)]
manifest={'version':2,'sourcePackage':'Stylized Water 2 1.7.0','coordinateConversion':{'position':'[x,y,-z]','rotation':'[-x,-y,z,w]','winding':'reversed','uv':'[u,1-v]','heightRows':'reversed','units':'metres'},'corridor':{'bankMargin':BANK_MARGIN,'vegetationMargin':VEGETATION_MARGIN,'rockContactMargin':ROCK_CONTACT_MARGIN,'sourceInstanceCount':source_instance_count,'removedInstances':removed_instances,'sourceCellCount':(n-1)**2},'originalWater':{'keywords':data.get('waterKeywords',[]),'properties':data.get('waterProperties',[])},'originalPostProcess':data.get('postProcess',[]),'terrain':{'origin':[t['position']['x'],-t['position']['z']-t['size']['z']],'columns':n,'rows':n,'cellIndices':cells,'spacing':t['size']['x']/(n-1),'layers':layers,'alphaResolution':ar,'detailResolution':dr,'detailCount':detail_instances,'details':detail_info},'points':points,'profileCorrections':corrections,'camera':{'position':xyz(data['camera']['position']),'forward':xyz(data['camera']['forward']),'fov':data['camera']['fov']},'sun':{'forward':xyz(data['sun']['forward']),'color':rgb(data['sun']['color']),'intensity':data['sun']['intensity']},'skySize':data['skySize'],'instances':[{**i,'position':xyz(i['position']),'boundsMin':[i['boundsMin']['x'],i['boundsMin']['y'],-i['boundsMax']['z']],'boundsMax':[i['boundsMax']['x'],i['boundsMax']['y'],-i['boundsMin']['z']]} for i in data['instances']],'materials':data['materials']}
source_files.update(p['texture'] for p in data.get('waterProperties',[]) if p.get('texture'));
source_files.update(['Assets/StylizedWater2/_Demo/RiverDemo.unity','Assets/StylizedWater2/_Demo/DemoAssets/Terrain/SWS_DemoRiverTerrain.asset',data['skyPath']]);source_files.update(str(p.relative_to(a.source)) for folder in ['Models','Prefabs','Materials'] for p in (a.source/'Assets/StylizedWater2/_Demo/DemoAssets'/folder).rglob('*') if p.is_file())
manifest['sources']=[{'path':path,'sha256':hashlib.sha256((a.source/path).read_bytes()).hexdigest(),'guid':(re.search(r'guid: ([0-9a-f]+)',(a.source/(path+'.meta')).read_text()).group(1) if (a.source/(path+'.meta')).exists() else None)} for path in sorted(source_files)]
manifest['files']=[{'path':name,'bytes':(a.output/name).stat().st_size,'sha256':hashlib.sha256((a.output/name).read_bytes()).hexdigest()} for name in sorted(output_files)]
manifest['contentHash']=hashlib.sha256(encode(manifest)).hexdigest();write('scene.json',encode(manifest));print('Packed',len(data['instances']),'renderers,',len(data['meshes']),'meshes;',n,'height grid,',len(layers),'layers;',manifest['contentHash'])
