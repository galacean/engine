"""Original no-window-cut wood specialization, retaining material expressions.
The native pointer branch is unsupported in WebGL. Caller MUST validate all
window_cut_buffer_address/window_cut_list words are zero before selecting it.
"""
import re
from port_shader import ident

def source(msl, vertex, reflection, roof_fragment, *, with_cuts=False, gable=False):
 if gable and not with_cuts:raise ValueError('Gable transport retains its complete cut branch')
 # Optimized IDs are pinned to the two retained original modules. Share only
 # transport operations; gable skew/ray bounds and material expressions stay native.
 ids = dict(start='_152', list='_3367', cursor='_5423', load='_3386', record='_3373',
            q0='_3416', q1='_3418', q2='_3420', origin='_3423', metric='_3187', ray='_3186',
            hit='_5715', projected='_4730', final='_5798', packed='_4819', uv='_5787') if gable else dict(
            start='_174', list='_3432', cursor='_5479', load='_3451', record='_3438',
            q0='_3481', q1='_3483', q2='_3485', origin='_3488', metric='_3252', ray='_3251',
            hit='_5762', projected='_4795', final='_5859', packed='_4884', uv='_5837')
 body=msl[msl.index('    float3 '+ids['start']+' ='):msl.rindex('    return out;')]
 if with_cuts:
  # The full-cut template requires an owned data-buffer binding. Physical native
  # addresses are never imported; remove only their null-address guard and loads.
  guard='            if (all(material_data_nani_instance_data._member0[in.vs_out_instance_index].window_cut_buffer_address == uint2(0u)))'
  start=body.index(guard);end=body.index('            uint '+ids['list'],start)
  body=body[:start]+body[end:]
  start=body.index('                    uint '+ids['load']+' =');end=body.index('                    float3 '+ids['origin'],start)
  body=body[:start]+f'''                    uint {ids['record']} = decorationCutWord({ids['list']} + {ids['cursor']});
                    uint4 {ids['q0']} = decorationCutQuad({ids['record']} * 12u);
                    uint4 {ids['q1']} = decorationCutQuad({ids['record']} * 12u + 4u);
                    uint4 {ids['q2']} = decorationCutQuad({ids['record']} * 12u + 8u);
                    float2 decorationCutScale = float2({ids['q2']}.z == 0u ? 1.0 : as_type<float>({ids['q2']}.z), {ids['q2']}.w == 0u ? 1.0 : as_type<float>({ids['q2']}.w));
                    float decorationDistanceScale = fast::min(decorationCutScale.x, decorationCutScale.y);
'''+body[end:]
  body=re.sub(r'as_type<float[23]>', 'uintBitsToFloat',body)
  body=re.sub(r'material_data_window_cut_sdf.sample\(samplers_lnc_iso, (\w+)\.xy, uint\(rint\(\1\.z\)\), level\(0.0\)\)',r'decorationCutSample(\1, decorationDistanceScale)',body)
  # Inverse XY scaling changes the ray metric, not just texture coordinates.
  # min(scale)*nativeDistance is a conservative field; its directional bound is
  # length(rayXY*(min(scale)/scale)); ratios <=1 avoid squared-length overflow.
  # Original bevel constants/back cap are retained; anisotropic distance is a
  # conservative field, not an exact Euclidean distance in the resized shape.
  metric=f"float {ids['metric']} = length({ids['ray']});"
  if body.count(metric) != 1:raise ValueError('Original cut ray metric changed')
  body=body.replace(metric,f"float {ids['metric']} = length({ids['ray']} * (float2(decorationDistanceScale) / decorationCutScale));")
  body=body.replace('select(', 'mix(')
  # Original reversed-depth min becomes forward-depth max in Engine's GLES
  # projection. Keep the recovered hit, surface normal and ray iterations intact.
  body=body.replace(f"current_view.view_to_sample * (current_view.world_to_view * float4({ids['hit']}, 1.0))",f"renderer_MVPMat * float4({ids['hit']}, 1.0)")
  body=body.replace(f"fast::min(({ids['projected']}.xyz / float3({ids['projected']}.w)).z, gl_FragCoord.z)",f"fast::max(({ids['projected']}.z / {ids['projected']}.w) * 0.5 + 0.5, gl_FragCoord.z)")
  body=body.replace(f"    uint2 {ids['packed']};", f"    masonrySdfHitLocal = {ids['final']};\n    uint2 {ids['packed']};")
 else:
  start=body.index('    if (_2030 != 0u)');a=body.index('{',start);depth=1;b=a+1
  while depth:
   depth+=(body[b]=='{')-(body[b]=='}');b+=1
  assert body[b:].lstrip().startswith('else')
  a=body.index('{',b);depth=1;b=a+1
  while depth:
   depth+=(body[b]=='{')-(body[b]=='}');b+=1
  body=body[:start]+body[a+1:b-1]+body[b:]
 body=body.replace('in.','').replace('out.','').replace('fast::','').replace('discard_fragment();','discard;')
 for n in [2,3,4]:
  for m in [2,3,4]:body=body.replace(f'float{n}x{m}',f'mat{n}x{m}')
  for a,b in [('float','vec'),('uint','uvec'),('int','ivec'),('bool','bvec')]:body=re.sub(r'\b'+a+str(n)+r'\b',b+str(n),body)
 body=body.replace('as_type<float>','uintBitsToFloat').replace('dfdx','dFdx').replace('dfdy','dFdy')
 body=re.sub(r'(\w+)\.sample\(samplers_llr, (\w+)\.xy, uint\(rint\(\2\.z\)\), bias\(current_view.mip_bias\)\)',r'texture(sampler2DArray(\1,samplers_llr),\2,current_view.mip_bias)',body)
 body=body.replace(f"material_data_wood_roughness.sample(samplers_llr, {ids['uv']}, bias(current_view.mip_bias))",f"texture(sampler2D(material_data_wood_roughness,samplers_llr),{ids['uv']},current_view.mip_bias)")
 body=body.replace('material_data_dirtpath_heightmap.sample(samplers_llr, (_5859.xz * 0.0500000007450580596923828125), bias(current_view.mip_bias))','texture(sampler2D(material_data_dirtpath_heightmap,samplers_llr),(_5859.xz * 0.0500000007450580596923828125),current_view.mip_bias)')
 if any(x in body for x in ['.sample','reinterpret_cast','as_type','select(']):raise ValueError('Unconverted MSL operation')
 header=vertex[:vertex.index('layout(')]
 seen=set()
 for text in (vertex,roof_fragment):
  for m in re.finditer(r'layout\([^)]*std140[^)]*\) uniform \w+\s*\{.*?\}\s*\w+;',text,re.S):
   name=re.search(r'uniform (\w+)',m.group())[1]
   if name not in seen:header+=m.group()+'\n';seen.add(name)
 # Use the original reflected types and descriptor locations.
 for r in reflection['ssbos']:
  t=reflection['types'][r['type']]['members'][0]['type'];typ=reflection['types'][t]['name'] if t in reflection['types'] else t
  # Gable reflection retains block type names (both StructuredBuffer), not
  # resource variables. MSL's entrypoint establishes the names at these slots.
  variable = {(0,0):'material_data_nani_instance_data',(8,0):'wooden_wall_colors_ids'}[(r['set'],r['binding'])] if gable else ident(r['name'])
  header+=f'layout(set = {r["set"]}, binding = {r["binding"]}, std430) readonly buffer B{r["set"]}_{r["binding"]} {{ {typ} _member0[]; }} {variable};\n'
 for r in reflection['separate_images']:
  if r['name']=='material_data.window_cut_sdf' and not with_cuts:continue
  header+=f'layout(set = {r["set"]}, binding = {r["binding"]}) uniform {r["type"]} {ident(r["name"])};\n'
 header+='layout(set = 2, binding = 1) uniform sampler samplers_llr;\n'
 for r in reflection['inputs']:
  header+=f'layout(location = {r["location"]}) '+('flat ' if r['type'] in ('int','uint') else '')+f'in {r["type"]} {ident(r["name"])};\n'
 header+='layout(location = 0) out uvec2 entryPointParam_ps_main_gbuffer;\n'
 if with_cuts:
  constants = [('float2','_5332'),('float3','_5704'),('bool','_5751'),('float4','_6275')] if gable else [('float2','_5395'),('float3','_5751'),('bool','_5796')]
  for typ,name in constants:
   declaration=f'constant {typ} {name} = {{}};'
   if declaration not in msl:raise ValueError('Original cut zero initializer changed')
  header+='''uniform highp usampler2D decorationWindowCuts;
uniform mat4 renderer_MVPMat;
vec3 masonrySdfHitLocal;
uint decorationCutWord(uint p){ivec2 s=textureSize(decorationWindowCuts,0);return texelFetch(decorationWindowCuts,ivec2(int(p/4u)%s.x,int(p/4u)/s.x),0)[int(p%4u)];}
uvec4 decorationCutQuad(uint p){return uvec4(decorationCutWord(p),decorationCutWord(p+1u),decorationCutWord(p+2u),decorationCutWord(p+3u));}
vec4 decorationCutSample(vec3 uv, float distanceScale){float r=textureLod(sampler2DArray(material_data_window_cut_sdf,samplers_llr),uv,0.0).r;return vec4(((r*255.0-128.0)/127.0)*distanceScale);}
'''
  constants_glsl=''.join(f"const {('vec'+typ[-1]) if typ.startswith('float') else typ} {name}={('vec'+typ[-1]+'(0.0)') if typ.startswith('float') else 'false'};\n" for typ,name in constants)
  header=header.replace('vec3 masonrySdfHitLocal;\n','vec3 masonrySdfHitLocal;\n'+constants_glsl)
 return header+'void main(){\n'+body+'}\n'
