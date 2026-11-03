"""Recovered roof support construction and framework UV/holes mapping.

Support streams come from pure recovered mathematics; authored surface mapping
retains the established projection and cutter contract. No trigger replay or
GPU readback is performed. Full original-vs-port checks live in tests.
"""
from pathlib import Path
import json,struct,hashlib,math
from geometry import add,sub,scale,dot,cross,unit,length,area,clean,rectangle,subtract_convex,validate
import native_dormer_clip as dormer_clip
from recovered_roof_surface import capture_trigger
sha=lambda b:hashlib.sha256(b).hexdigest()


def read(path,h=None):
 b=Path(path).read_bytes()
 if h and sha(b)!=h:raise ValueError('Source hash mismatch: '+str(path))
 return b

def clip_plane(poly,n,d):
 if not poly:return []
 out=[]
 for a,b in zip(poly,poly[1:]+poly[:1]):
  av=dot(n,a)+d;bv=dot(n,b)+d;ai=av>=-1e-10;bi=bv>=-1e-10
  if ai:out.append(a)
  if ai!=bi:out.append(add(a,scale(sub(b,a),av/(av-bv))))
 return out

def hole_planes(raw):
 """Original boxes or explicitly bounded inward cubic editor-support planes."""
 return dormer_clip.support_clip(raw)['planes']

def from_bundle(bundle,wall_id=6,*,kernel=None):
 if isinstance(bundle,(str,Path)):bundle=json.loads(read(bundle))
 if bundle.get('schema')!='native-scene-bundle-v1' or bundle.get('status')!='prepared':raise ValueError('Prepared original bundle required')
 rows=[x for x in bundle['families']['roofs']['data']['instances']if x['wall_id']==wall_id]
 if len(rows)!=1 or not rows[0]['pitched']:raise ValueError('One current pitched native roof required')
 row=rows[0];raw=bytes.fromhex(row['roof88_hex']);read(row['file'],row['sha256'])
 if bundle['source']['roofs88'][str(wall_id)]!=raw.hex():raise ValueError('Current source Roof88 differs from original producer input')
 if struct.unpack_from('<I',raw,8)[0] not in (0,1):raise ValueError('This adapter supports native circular and rectangular roofs')
 capture=capture_trigger(raw,wall_id);base=capture['base_y'];streams=capture['streams'];tt=bytes.fromhex(streams['triangles']['hex']);nn=bytes.fromhex(streams['normals']['hex']);uu=bytes.fromhex(streams['uvs']['hex'])
 holes=[]
 for h in bundle['families']['dormers']['data']['blueprint_holes']:
  if h['wall_id']!=wall_id:continue
  data=read(h['file'],h['sha256'])
  if len(data)%48:raise ValueError('Dormer hole stride mismatch')
  if any(struct.unpack_from('<I',data,i+12)[0]!=row['slot']for i in range(0,len(data),48)):raise ValueError('Hole source slot differs from target roof owner')
  for i in range(0,len(data),48):
   clip=dormer_clip.support_clip(data[i:i+48]);planes=clip.pop('planes');holes.append({'decorator_id':h['decorator_id'],'raw48_hex':data[i:i+48].hex(),'planes':planes,'support_clip':clip})
 patches=[];seen={};duplicates=[];degenerate=[];total_area=0;hole_area=0
 for i in range(streams['triangles']['count']):
  source_uv=list(struct.unpack_from('<6f',uu,i*24));pair_uv=[source_uv[j:j+2]for j in [0,2,4]];f=struct.unpack_from('<9f',tt,i*36);tri=[add(list(f[j:j+3]),[0,base,0])for j in [0,3,6]];key=tuple(sorted(tuple(x)for x in tri))
  if key in seen:duplicates.append({'triangle':i,'same_geometry_as':seen[key]});continue
  seen[key]=i;normal=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));source_normal=struct.unpack_from('<3f',nn,i*36)
  if length(normal)<1e-10:degenerate.append(i);continue
  if dot(normal,source_normal)<0:tri[1],tri[2]=tri[2],tri[1];pair_uv[1],pair_uv[2]=pair_uv[2],pair_uv[1];normal=scale(normal,-1)
  n=unit(normal);u=unit(sub(tri[1],tri[0]));v=cross(n,u);origin=tri[0];uv=[[dot(sub(p,origin),u),dot(sub(p,origin),v)]for p in tri];xmin=min(p[0]for p in uv);ymin=min(p[1]for p in uv);origin=add(origin,add(scale(u,xmin),scale(v,ymin)));uv=clean([[p[0]-xmin,p[1]-ymin]for p in uv]);width=max(p[0]for p in uv);height=max(p[1]for p in uv)
  outside=subtract_convex(rectangle(0,0,width,height),uv);cutters=[]
  for h in holes:
   poly=tri
   for axis,d in h['planes']:poly=clip_plane(poly,axis,d)
   q=clean([[dot(sub(p,origin),u),dot(sub(p,origin),v)]for p in poly])
   if q:cutters.append({'polygon':q,'source_decorator_id':h['decorator_id']})
  geometry={'type':'plane','id':f'native-roof-{wall_id}-triangle-{i}','origin':origin,'u_axis':u,'v_axis':v,'width':width,'height':height,'holes':[{'polygon':p}for p in outside]+[{'polygon':c['polygon']}for c in cutters]};validate(geometry)
  total_area+=area(uv)
  remaining=[uv]
  for c in cutters:remaining=[fragment for p in remaining for fragment in subtract_convex(p,c['polygon'])]
  kept=sum(area(p)for p in remaining);hole_area+=area(uv)-kept
  patches.append({'triangle_index':i,'geometry':geometry,'native_world_triangle':tri,'native_mesh_uv':pair_uv,'source_unoriented_uv':source_uv,'surface_triangle_uv':uv,'cutters':cutters,'uncut_area':area(uv),'retained_area':kept})
 result={'status':'mapped-native-roof-support-patches','wall_id':wall_id,'slot':row['slot'],'patches':patches,'capture':capture,'native_holes':holes,'duplicates_removed':duplicates,'degenerate_triangles_skipped':degenerate,'area':total_area,'hole_area':hole_area,'provenance':{'bundle_canonical_sha256':sha(json.dumps(bundle,sort_keys=True).encode()),'roof88_hex':raw.hex(),'source_instances_file':row['file'],'source_instances_sha256':row['sha256'],'scope':__doc__,'domain_policy':'Original trigger triangles become planar patches; exact duplicate triangles are represented once. Original UV topology remains recorded; shared original mesh UV chart is retained with explicit physical-distance scales; local patch frames only map the shared grid. This is not an isometric/geodesic parameterization.','hole_policy':'Original DormerHole48 cubic predicate is retained in native_holes.support_clip.domain. Box holes remain exact. Tapered holes use inward cubic chords with a recorded world local-X side-error bound (default 0.1 mm); near tangency this is not a bound on roof intersection displacement. Original GPU continues to consume unmodified hole48. Replacement units use Surface-normal extrusion of this bounded support cut, not full original 3D predicate equivalence.','limitations':['Support mesh is used by original decorator placement/collision, not the per-tile render mesh or exact continuous roof profile.','Original UV islands have gaps, so shared-chart rows do not imply continuity across roof-side/ridge chart seams.','Edge tiles and ridge tiles are assembly objects; replacing the whole main roof owner removes them along with main slope tiles.','Original dormer tiles and decorators are separate preserved source owners.']}}

 result['geometry'],result['uv_mapping']=shared_geometry(result,validator=kernel.validate if kernel else validate)
 result['provenance']['resource_bindings']={key:bundle['globals'][key]for key in ['frame','frame_counter','slot_arrays','color_library']}
 result['provenance']['source_holes']=bundle['families']['dormers']['data']['blueprint_holes']
 return result

def shared_geometry(mapping,*,validator=validate):
 """Preserve the original global mesh UV; choose explicit distance scales.
 U scale is total native lower-rim edge length / native U span.
 V scale is the native profile-edge length / its V span: rectangle U=.25,
 circle U=0 (the existing native periodic-chart seam).
 These are parameterization conventions derived from original support edges,
 not an assertion that the roof is isometric or that every point has that metric.
 """
 edges={}
 for p in mapping['patches']:
  uv=p['native_mesh_uv'];world=p['native_world_triangle']
  for a,b,x,y in zip(uv,uv[1:]+uv[:1],world,world[1:]+world[:1]):
   key=tuple(sorted((tuple(a),tuple(b))))
   if key not in edges:edges[key]={'uv':[a,b],'world':[x,y],'length':length(sub(x,y)),'triangle_index':p['triangle_index']}
 ue=[e for e in edges.values()if all(abs(p[1])<1e-7 for p in e['uv'])and abs(e['uv'][1][0]-e['uv'][0][0])>1e-7]
 shape_tag=struct.unpack_from('<I',bytes.fromhex(mapping['provenance']['roof88_hex']),8)[0]
 if shape_tag not in (0,1):raise ValueError('Original analytic roof shape required for UV metric')
 profile_u=0 if shape_tag==0 else .25
 ve=[e for e in edges.values()if all(abs(p[0]-profile_u)<1e-7 and -1e-7<=p[1]<=1+1e-7 for p in e['uv'])and abs(e['uv'][1][1]-e['uv'][0][1])>1e-7]
 if not ue or not ve:raise ValueError('Native roof UV boundary scale source absent')
 us=sum(e['length']for e in ue)/sum(abs(e['uv'][1][0]-e['uv'][0][0])for e in ue);vs=sum(e['length']for e in ve)/sum(abs(e['uv'][1][1]-e['uv'][0][1])for e in ve)
 vertices=[];uvs=[];nativeuv=[];indices=[];vertexmap={};holes=[]
 for p in mapping['patches']:
  keys=[]
  for world,uv in zip(p['native_world_triangle'],p['native_mesh_uv']):
   k=tuple(world+uv)
   if k not in vertexmap:vertexmap[k]=len(vertices);vertices.append(world);nativeuv.append(uv);uvs.append([uv[0]*us,uv[1]*vs])
   keys.append(vertexmap[k])
  if area([uvs[i]for i in keys])<0:keys[1],keys[2]=keys[2],keys[1]
  indices.append(keys)
  g=p['geometry'];origin=g['origin'];u=g['u_axis'];v=g['v_axis'];loc=[[dot(sub(w,origin),u),dot(sub(w,origin),v)]for w in p['native_world_triangle']];a,b,c=loc;delta1=sub(b,a);delta2=sub(c,a);det=delta1[0]*delta2[1]-delta1[1]*delta2[0]
  for cutter in p['cutters']:
   polygon=[]
   for q in cutter['polygon']:
    d=sub(q,a);beta=(d[0]*delta2[1]-d[1]*delta2[0])/det;gamma=(delta1[0]*d[1]-delta1[1]*d[0])/det;coords=[sum(weight*uv[k]for weight,uv in zip([1-beta-gamma,beta,gamma],p['native_mesh_uv']))for k in range(2)];polygon.append([coords[0]*us,coords[1]*vs])
   polygon=clean(polygon)
   if polygon:holes.append({'polygon':polygon})
 geometry={'type':'triangulated','id':f'native-roof-{mapping["wall_id"]}','width':max(q[0]for q in uvs),'height':max(q[1]for q in uvs),'vertices':vertices,'uv':uvs,'triangles':indices,'holes':holes};validator(geometry)
 return geometry,{'original_uv':nativeuv,'scale':[us,vs],'scale_u_edges':ue,'scale_v_edges':ve,'source':'Original trigger UV chart retained; physical-distance scale from original boundary edges. No tile center fitting.','chart_policy':('Original circular UV retained: 15 circumferential sectors at u0..1, 9 pitched profile bands at v0..1, separate tip island near v2..2.1. U0 and U1 are the original periodic cut; this chart does not weld or coordinate cross-cut layout cells.' if shape_tag==0 else 'Original UV islands/gaps retained (main slopes v0..1, ridge v2..2.1). One layout grid spans the full shared chart; triangle pieces only clip/map it.'),'metric_convention':{'shape_tag':shape_tag,'u':'total original lower-rim length / original U span','v_profile_u':profile_u,'v':'original profile-edge length / original V span','is_isometric':False},'ridge_duplicate_policy':'Original exact duplicate triangles are deduplicated by world vertex equality before mapping.'}
