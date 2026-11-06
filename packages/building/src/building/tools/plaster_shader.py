"""Rebind original plaster vertex pointers into one packed uint4 arena.
The original vertex noise and fragment erosion expressions remain intact.
"""
import re

def adapt(msl, fragment, reflection):
 # Physical pointer is represented by two words in the 48-byte original ABI.
 fragment=re.sub(r'layout\(buffer_reference\) buffer uvec4Pointer(?:\s*\{.*?\})?;', '', fragment, flags=re.S)
 fragment=fragment.replace('uvec4Pointer verts_gpu_address;', 'uvec2 verts_gpu_address;')
 # Match the retained Metal diagnostic sampler's unsigned array-layer ABI.
 fragment=fragment.replace('float(_581 - 4)', 'float(uint(_581 - 4))')
 for t in reflection['types'].values():
  for member in t.get('members',[]):
   if member.get('physical_pointer'):
    member['type']='uvec2';member.pop('physical_pointer');member.pop('array_stride',None)
 return fragment

def vertex(msl, fragment, reflection, view_source):
 structs='\n'.join(m.group() for m in re.finditer(r'struct \w+\s*\{.*?\};',fragment,re.S))
 view=re.search(r'layout\([^)]*std140[^)]*\) uniform ViewConstants_natural\s*\{.*?\}\s*\w+;',view_source,re.S).group()
 header='#version 450\n'+structs+'\n'+view+'\n'
 header+='layout(set = 8, binding = 0, std430) readonly buffer Ind { uint _member0[]; } nani_instance_indirection_buffer;\n'
 header+='layout(set = 0, binding = 1, std430) readonly buffer Instances { PlasterInstanceData_natural _member0[]; } material_data_nani_instance_data;\n'
 header+='uniform highp usampler2D plaster_vertices;\nuvec4 plasterVertex(uint p){ivec2 s=textureSize(plaster_vertices,0);return texelFetch(plaster_vertices,ivec2(int(p)%s.x,int(p)/s.x),0);}\n'
 for r in reflection['outputs']:
  name=r['name'].replace('.','_');typ=reflection['types'].get(r['type'],{}).get('name',r['type'])
  header+=f'layout(location = {r["location"]}) '+('flat 'if typ=='uint'else '')+f'out {typ} {name};\n'
 body=msl[msl.index('    _MatrixStorage_float3x3_ColMajornatural entryPoint'):msl.rindex('    return out;')]
 body=body.replace(' = {};',';').replace('out.','').replace('fast::','').replace('int(gl_BaseVertex)','0')
 start=body.index('        uint2 _807 =');end=body.index('        float3 _353 =',start)
 body=body[:start]+'''        uint address = material_data_nani_instance_data._member0[nani_instance_indirection_buffer._member0[_27]].verts_gpu_address.x + uint(_227 / 16);
        uvec4 vdata0 = plasterVertex(address);
        uvec4 vdata1 = plasterVertex(address + 1u);
        uvec4 _338 = plasterVertex(address + 2u);
'''+body[end:]
 body=re.sub(r'spvUnsafeArray<float3, 3> (\w+) = spvUnsafeArray<float3, 3>\(\{ (.*?) \}\);',r'vec3 \1[3] = vec3[3](\2);',body)
 body=re.sub(r'_MatrixStorage_float3x3_ColMajornatural\{ \{ (.*?) \} \}',r'_MatrixStorage_float3x3_ColMajornatural(vec3[3](\1))',body)
 # MSL exports three columns; GLSL exports one logical varying below.
 body=re.sub(r'    entryPointParam_vs_main_frag_tangent_to_world_data_[012] = .*?;\n','',body)
 body=body.replace('_MatrixStorage_float3x3_ColMajornatural entryPointParam_vs_main_frag_tangent_to_world;', '')
 for n in (2,3,4):
  body=re.sub(r'\b'+f'float{n}x{n}'+r'\b',f'mat{n}',body)
  for a,b in [('float','vec'),('uint','uvec'),('int','ivec')]:body=re.sub(r'\b'+a+str(n)+r'\b',b+str(n),body)
 body=re.sub(r'as_type<(?:float|vec[234])>', 'uintBitsToFloat',body)
 # Original MSL column multiplication corresponds to the original GLSL row ABI.
 body=body.replace('current_view.world_to_sample * pos_ws','pos_ws * current_view.world_to_sample')
 if 'reinterpret_cast' in body or 'as_type' in body:raise ValueError('Unconverted plaster operation')
 return header+'void main(){\n'+body+'}\n'

def flatten(source,stage):
 direction='out' if stage=='vert' else 'in'
 pattern=r'layout\(location = 9\) '+direction+r' _MatrixStorage_float3x3_ColMajornatural (\w+);'
 match=re.search(pattern,source);name=match[1]
 replacement='_MatrixStorage_float3x3_ColMajornatural '+name+';\n'+'\n'.join(f'layout(location = {9+i}) {direction} vec3 plaster_basis{i};' for i in range(3))
 source=source[:match.start()]+replacement+source[match.end():]
 if stage=='frag':
  pos=source.index('{',source.index('void main()'))+1;source=source[:pos]+''.join(f'{name}.data[{i}]=plaster_basis{i};' for i in range(3))+source[pos:]
 else:
  pos=source.rindex('}');source=source[:pos]+''.join(f'plaster_basis{i}={name}.data[{i}];' for i in range(3))+source[pos:]
 return source
