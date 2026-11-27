Shader "BuildingUnit/frame/2be4a0d6b4011499" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_19_0;
      usampler2D storage_0_0;
      usampler2D uniform_ViewConstants_natural;
      usampler2D uniform_FrameCounter_natural;
      sampler2DArray window_colors_window_colors;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Color;
        vec3 Vertex_Normal;
        vec2 Vertex_UV;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        vec3 v1;
        vec2 v3;
        flat uint v4;
        flat uint v5;
      };
      BuildingVaryings gs_vin;

      vec3 vs_out_v1 = vec3(0.0);
      vec2 vs_out_v3 = vec2(0.0);
      uint vs_out_v4 = 0u;
      uint vs_out_v5 = 0u;
      // --- Vertex Stage ---
struct vs__Array_natural_float12
{
    float data[12];
};
vs__Array_natural_float12 vs_masonryMake_Array_natural_float12(float v[12]){vs__Array_natural_float12 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];r.data[3]=v[3];r.data[4]=v[4];r.data[5]=v[5];r.data[6]=v[6];r.data[7]=v[7];r.data[8]=v[8];r.data[9]=v[9];r.data[10]=v[10];r.data[11]=v[11];return r;}


struct vs_Affine3Packed_natural
{
    vs__Array_natural_float12 data;
};

struct vs_InstanceData_natural
{
    vs_Affine3Packed_natural xform;
    uint is_semitransparent;
    uint color_id;
    uint pad0;
    uint pad1;
};



struct vs_Engine_ViewConstants_natural{
    mat4 view_to_clip;
    mat4 clip_to_view;
    mat4 view_to_sample;
    mat4 sample_to_view;
    mat4 world_to_view;
    mat4 view_to_world;
    mat4 world_to_sample;
    mat4 clip_to_prev_clip;
    mat4 prev_clip_to_clip;
    mat4 prev_view_to_prev_clip;
    mat4 prev_clip_to_prev_view;
    mat4 prev_world_to_prev_view;
    mat4 prev_view_to_prev_world;
    vec2 sample_offset_pixels;
    vec2 sample_offset_clip;
    vec2 prev_sample_offset_pixels;
    vec2 prev_sample_offset_clip;
    mat4 pad0;
    mat4 pad1;
    vec4 pad2;
    float pad3;
    float pad4;
    float pad5;
    float mip_bias;
};
vs_Engine_ViewConstants_natural vs_current_view = vs_Engine_ViewConstants_natural(mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0), mat4(0.0), mat4(0.0), vec4(0.0), 0.0, 0.0, 0.0, 0.0);
vec3 vs_v0 = vec3(0.0);
vec3 vs_v2 = vec3(0.0);



ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_19_0,0);return texelFetch(storage_19_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_InstanceData_natural vs_read_material_data_nani_instance_data_1(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return vs_InstanceData_natural(vs_Affine3Packed_natural(vs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),es_t3.x,es_t3.y,es_t3.z,es_t3.w);}
uint vs_tgOpt_jenkins(uint x){
  x += x << 10u;
  x ^= x >> 6u;
  x += x << 3u;
  x ^= x >> 11u;
  return x + (x << 15u);
}
uint vs_tgOpt_mixU(uint a, uint b){
  uint h = ((a * 1664525u + b) + 1013904223u) * 1664525u;
  h ^= h >> 11u;
  h ^= (h << 7u) & 2636928640u;
  h ^= (h << 15u) & 4022730752u;
  return h ^ (h >> 18u);
}
vec2 vs_tgOpt_hash3v2(uvec3 c){
  uint h0 = vs_tgOpt_mixU(c.x, vs_tgOpt_mixU(c.y, vs_tgOpt_jenkins(c.z)));
  uint h1 = vs_tgOpt_jenkins(h0);
  return vec2(
    uintBitsToFloat((h0 & 8388607u) | 1065353216u) - 1.0,
    uintBitsToFloat((h1 & 8388607u) | 1065353216u) - 1.0
  );
}

void vs_original_main()
{
    uint _17 = uint(gl_InstanceID);
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_17));
vs_InstanceData_natural es_h1=vs_read_material_data_nani_instance_data_1(int(es_h0));
    mat3x4 _549 = transpose(mat4x3(vec3(es_h1.xform.data.data[0], es_h1.xform.data.data[1], es_h1.xform.data.data[2]), vec3(es_h1.xform.data.data[3], es_h1.xform.data.data[4], es_h1.xform.data.data[5]), vec3(es_h1.xform.data.data[6], es_h1.xform.data.data[7], es_h1.xform.data.data[8]), vec3(es_h1.xform.data.data[9], es_h1.xform.data.data[10], es_h1.xform.data.data[11])));
    vec3 _512 = vec4(gs_attr.Vertex_Position, 1.0) * _549;
    vec3 _552 = _512 * 0.4000000059604644775390625;
    ivec3 _578 = ivec3(floor(_552));
    vec3 _579 = fract(_552);
    vec2 _567 = vs_tgOpt_hash3v2(uvec3(_578));
    vec2 _568 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(1, 0, 0)));
    vec2 _569 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(0, 1, 0)));
    vec2 _570 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(1, 1, 0)));
    vec2 _571 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(0, 0, 1)));
    vec2 _572 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(1, 0, 1)));
    vec2 _573 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(0, 1, 1)));
    vec2 _574 = vs_tgOpt_hash3v2(uvec3(_578 + ivec3(1)));
    vec3 _1490 = (_579 * _579) * (vec3(3.0) - (vec3(2.0) * _579));
    float _643 = _1490.x;
    float _644 = 1.0 - _643;
    float _646 = _1490.y;
    float _647 = 1.0 - _646;
    float _649 = _1490.z;
    float _650 = 1.0 - _649;
    vec2 _557 = clamp((((((((((((_567 * _644) * _647) * _650) + (((_568 * _643) * _647) * _650)) + (((_569 * _644) * _646) * _650)) + (((_570 * _643) * _646) * _650)) + (((_571 * _644) * _647) * _649)) + (((_572 * _643) * _647) * _649)) + (((_573 * _644) * _646) * _649)) + (((_574 * _643) * _646) * _649)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 pos_ws = _512 + (vec3(_557.x, 0.0, _557.y) * 0.0599999986588954925537109375);
    gl_Position = renderer_MVPMat * vec4(pos_ws, 1.0);
    vs_v0 = gs_attr.Vertex_Color;
    vs_out_v1 = vec4(gs_attr.Vertex_Normal, 0.0) * _549;
    vs_v2 = pos_ws;
    vs_out_v3 = gs_attr.Vertex_UV;
    vs_out_v4 = es_h1.is_semitransparent;
    vs_out_v5 = es_h1.color_id;
}


void vs_main(){vs_original_main();}

      BuildingVaryings vert(BuildingAttributes _gs_attr_in) {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v1 = vs_out_v1;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v4 = vs_out_v4;
        _gs_vout.v5 = vs_out_v5;
        return _gs_vout;
      }

      // --- Fragment Stage ---
const uvec2[4] fs__81 = uvec2[4](uvec2(0u), uvec2(0u, 1u), uvec2(1u), uvec2(1u, 0u));

struct fs_Engine_FrameCounter_natural{
    uint index;
};
fs_Engine_FrameCounter_natural fs_frame_counter = fs_Engine_FrameCounter_natural(0u);
uvec2 fs_entryPointParam_ps_main_gbuffer = uvec2(0u);

ivec2 fs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 fs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 fs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}
float fs_tgDdy(float x){return -dFdy(x);}
vec2 fs_tgDdy(vec2 x){return -dFdy(x);}
vec3 fs_tgDdy(vec3 x){return -dFdy(x);}
vec4 fs_tgDdy(vec4 x){return -dFdy(x);}

void fs_read_uniform_FrameCounter_natural(){
ivec2 es_s=textureSize(uniform_FrameCounter_natural,0);
uvec4 es_t0=texelFetch(uniform_FrameCounter_natural,ivec2(0%es_s.x,0/es_s.x),0);
fs_frame_counter.index=es_t0.x;
}
void fs_original_main()
{
    if ((gs_vin.v4 & 1u) != 0u)
    {
        if (all(notEqual((uvec2(gl_FragCoord.xy) & uvec2(1u)), fs__81[fs_frame_counter.index & 3u])))
        {
            discard;
        }
    }
    uint _449 = gs_vin.v5 + (gs_vin.v5 << 10u);
    uint _451 = _449 ^ (_449 >> 6u);
    uint _453 = _451 + (_451 << 3u);
    uint _455 = _453 ^ (_453 >> 11u);
    int _144 = int(gs_vin.v5);
    vec4 _473 = texture(window_colors_window_colors, vec3((gs_vin.v3 * 0.5) + vec2(uintBitsToFloat(((_455 + (_455 << 15u)) & 8388607u) | 1065353216u) - 1.0), float(_144)));
    vec3 _476 = _473.xyz;
    vec3 _812;
    if (_144 == 0)
    {
        _812 = _476 * 0.699999988079071044921875;
    }
    else
    {
        _812 = _476;
    }
    vec3 _522 = (normalize(gs_vin.v1) * 0.5) + vec3(0.5);
    vec3 _630 = sqrt(clamp(_812, vec3(0.0), vec3(1.0)));
    uint _645 = (uint((clamp(_630.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_630.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_630.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _828 = uvec2(((uint((clamp(_522.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_522.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_522.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u, _645);
    _828.y = _645 | 117440512u;
    fs_entryPointParam_ps_main_gbuffer = _828;
}


void fs_main(){fs_read_uniform_FrameCounter_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
