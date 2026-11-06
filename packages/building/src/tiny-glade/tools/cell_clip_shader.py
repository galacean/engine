"""Same projected-convex union predicate as the recovered provider adapter.
Only storage access changes (float4 buffer to integer data texture).
"""
def wrap(pair,family):
 world,instance={'brick':('v2','v13'),'wood':('v0','v2'),'roof':('v0','v6')}[family]
 # Use an explicit cache record index, independent of visible draw ordering.
 vertex=pair['vert']['source'];fragment=pair['frag']['source']
 indirection={'brick':'storage_0_2','roof':'storage_7_0','wood':'storage_6_0'}[family]
 helper=f'''flat out uint resident_cell_id;
 uint residentCell(int i){{ivec2 s=textureSize({indirection},0);return texelFetch({indirection},ivec2((i/4)%s.x,(i/4)/s.x),0)[i%4];}}
 '''
 pair['vert']['source']=vertex.replace('void main(){original_main();',helper+'void main(){original_main();resident_cell_id=residentCell(gl_InstanceID);')
 helper='''flat in uint resident_cell_id;
 uniform highp usampler2D cell_clip;
 vec4 cellPlane(uint i){ivec2 s=textureSize(cell_clip,0);return uintBitsToFloat(texelFetch(cell_clip,ivec2(int(i)%s.x,int(i)/s.x),0));}
 bool cellContains(uint id,vec3 q){
  vec4 h=cellPlane(id);if(h.y<0.0)return false;if(h.y==0.0)return true;uint cursor=uint(h.x);
  for(uint j=0u;j<uint(h.y);++j){uint n=uint(cellPlane(cursor).x),first=cursor+1u;cursor=first+n;bool yes=true;
   for(uint k=0u;k<n;++k){if(!(dot(cellPlane(first+k),vec4(q,1.0))>=-0.00001)){yes=false;break;}}if(yes)return true;
  }return false;
 }
 '''
 pair['frag']['source']=fragment.replace('void main(){',helper+'void main(){if(!cellContains(resident_cell_id,'+world+'))discard;',1)
 return pair
