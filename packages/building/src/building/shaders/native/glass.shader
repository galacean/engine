Shader "BuildingUnit/glass/d49349e0e4362b90" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_6_0;
      usampler2D storage_0_1;
      usampler2D uniform_ViewConstants_natural;
      usampler2D uniform_FrameCounter_natural;
      usampler2D uniform_MaterialData_natural;
      usampler2D uniform_FrameConstants_natural;
      sampler2D resource0;
      sampler2D resource1;
      sampler2D resource2;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Color;
        vec3 Vertex_Normal;
        vec2 Vertex_UV;
        int is_glass;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        vec3 v0;
        vec3 v2;
        vec2 v3;
        flat uint v4;
        flat uint v5;
        flat vec3 v6;
        flat uint v7;
      };
      BuildingVaryings gs_vin;

      vec3 vs_out_v0 = vec3(0.0);
      vec3 vs_out_v2 = vec3(0.0);
      vec2 vs_out_v3 = vec2(0.0);
      uint vs_out_v4 = 0u;
      uint vs_out_v5 = 0u;
      vec3 vs_out_v6 = vec3(0.0);
      uint vs_out_v7 = 0u;
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
    uint _bit_field_backing_0;
    float light_intensity;
    uint has_albedo_texture;
    uint albedo_texture;
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
vec3 vs_v1 = vec3(0.0);






ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_6_0,0);return texelFetch(storage_6_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_InstanceData_natural vs_read_material_data_nani_instance_data_1(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_1,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return vs_InstanceData_natural(vs_Affine3Packed_natural(vs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),es_t3.x,uintBitsToFloat(es_t3.y),es_t3.z,es_t3.w);}
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
    mat3x4 _566 = transpose(mat4x3(vec3(es_h1.xform.data.data[0], es_h1.xform.data.data[1], es_h1.xform.data.data[2]), vec3(es_h1.xform.data.data[3], es_h1.xform.data.data[4], es_h1.xform.data.data[5]), vec3(es_h1.xform.data.data[6], es_h1.xform.data.data[7], es_h1.xform.data.data[8]), vec3(es_h1.xform.data.data[9], es_h1.xform.data.data[10], es_h1.xform.data.data[11])));
    vec3 _529 = vec4(gs_attr.Vertex_Position, 1.0) * _566;
    vec3 _569 = _529 * 0.4000000059604644775390625;
    ivec3 _595 = ivec3(floor(_569));
    vec3 _596 = fract(_569);
    vec2 _584 = vs_tgOpt_hash3v2(uvec3(_595));
    vec2 _585 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(1, 0, 0)));
    vec2 _586 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(0, 1, 0)));
    vec2 _587 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(1, 1, 0)));
    vec2 _588 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(0, 0, 1)));
    vec2 _589 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(1, 0, 1)));
    vec2 _590 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(0, 1, 1)));
    vec2 _591 = vs_tgOpt_hash3v2(uvec3(_595 + ivec3(1)));
    vec3 _1507 = (_596 * _596) * (vec3(3.0) - (vec3(2.0) * _596));
    float _660 = _1507.x;
    float _661 = 1.0 - _660;
    float _663 = _1507.y;
    float _664 = 1.0 - _663;
    float _666 = _1507.z;
    float _667 = 1.0 - _666;
    vec2 _574 = clamp((((((((((((_584 * _661) * _664) * _667) + (((_585 * _660) * _664) * _667)) + (((_586 * _661) * _663) * _667)) + (((_587 * _660) * _663) * _667)) + (((_588 * _661) * _664) * _666)) + (((_589 * _660) * _664) * _666)) + (((_590 * _661) * _663) * _666)) + (((_591 * _660) * _663) * _666)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 pos_ws = _529 + (vec3(_574.x, 0.0, _574.y) * 0.0599999986588954925537109375);
    gl_Position = renderer_MVPMat * vec4(pos_ws, 1.0);
    vs_out_v0 = gs_attr.Vertex_Color;
    vs_v1 = vec4(gs_attr.Vertex_Normal, 0.0) * _566;
    vs_out_v2 = pos_ws;
    vs_out_v3 = gs_attr.Vertex_UV * 0.75;
    vs_out_v4 = es_h0;
    vs_out_v5 = uint(gs_attr.is_glass);
    vs_out_v6 = vec4(vec3(0.0), 1.0) * _566;
    vs_out_v7 = (es_h1._bit_field_backing_0 << uint(1)) >> uint(1);
}


void vs_main(){vs_original_main();}

      BuildingVaryings vert() {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v4 = vs_out_v4;
        _gs_vout.v5 = vs_out_v5;
        _gs_vout.v6 = vs_out_v6;
        _gs_vout.v7 = vs_out_v7;
        return _gs_vout;
      }

      // --- Fragment Stage ---
struct fs__Array_natural_float12
{
    float data[12];
};
fs__Array_natural_float12 fs_masonryMake_Array_natural_float12(float v[12]){fs__Array_natural_float12 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];r.data[3]=v[3];r.data[4]=v[4];r.data[5]=v[5];r.data[6]=v[6];r.data[7]=v[7];r.data[8]=v[8];r.data[9]=v[9];r.data[10]=v[10];r.data[11]=v[11];return r;}


struct fs_Affine3Packed_natural
{
    fs__Array_natural_float12 data;
};

struct fs_InstanceData_natural
{
    fs_Affine3Packed_natural xform;
    uint _bit_field_backing_0;
    float light_intensity;
    uint has_albedo_texture;
    uint albedo_texture;
};

const uvec2[4] fs__141 = uvec2[4](uvec2(0u), uvec2(0u, 1u), uvec2(1u), uvec2(1u, 0u));

struct fs_Tex2D_natural
{
    uint bindless_handle;
};
float fs__2310 = 0.0;
vec3 fs__2453 = vec3(0.0);
vec4 fs__2712 = vec4(0.0);


struct fs_Engine_FrameCounter_natural{
    uint index;
};
fs_Engine_FrameCounter_natural fs_frame_counter = fs_Engine_FrameCounter_natural(0u);

struct fs_Engine_ViewConstants_natural{
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
fs_Engine_ViewConstants_natural fs_current_view = fs_Engine_ViewConstants_natural(mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), mat4(0.0), vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0), mat4(0.0), mat4(0.0), vec4(0.0), 0.0, 0.0, 0.0, 0.0);

struct fs_Engine_MaterialData_natural{
    fs_Tex2D_natural curtains_texture;
    fs_Tex2D_natural indoors_texture;
};
fs_Engine_MaterialData_natural fs_material_data = fs_Engine_MaterialData_natural(fs_Tex2D_natural(0u), fs_Tex2D_natural(0u));

struct fs_Engine_FrameConstants_natural{
    vec4 sun_color;
    vec4 sky_low_color;
    vec4 sky_high_color;
    vec4 fog_tint_thickness;
    vec4 fake_light_color;
    vec4 fake_light_dir;
    vec4 fake_light2_color;
    vec4 fake_light2_dir;
    float time_since_startup_secs;
    float delta_time_seconds;
    float ev_mult;
    uint glade_theme_id;
    uvec2 world_render_resolution;
    uint game_time_sec;
    float game_time_frac;
    vec3 editing_highlight_color;
    float time_of_day;
    vec3 dir_to_sun;
    uint camera_idx;
    vec3 dir_to_moon;
    uint render_overrides;
    vec3 dir_to_primary_directional_light;
    float main_view_lod_scale;
    vec4 main_view_eye_position;
    float fog_relative_extinction;
    uint highlighted_transient_stair_edge_id;
    uvec2 swapchain_dims;
    float swapchain_aspect_ratio;
    uint is_photomode;
    uint is_topdown_mode;
    uint is_firstperson_mode;
    vec3 brush_position;
    float eraser_size_multiplier;
    uint roof_highlighted_slot_id;
    uint roof_highlight_mode;
    uint wall_highlighted_slot_id;
    uint wall_highlight_mode;
    uint highlight_bricks_to_delete;
    float wind_strength;
    float tree_canopy_cone_angle_mult;
    float tree_canopy_max_cone_cull_dist_range;
    vec4 debug_tweakers;
    vec3 ground_fog;
    float moonswap;
};
fs_Engine_FrameConstants_natural fs_frame_constants = fs_Engine_FrameConstants_natural(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), 0.0, 0.0, 0.0, 0u, uvec2(0u), 0u, 0.0, vec3(0.0), 0.0, vec3(0.0), 0u, vec3(0.0), 0u, vec3(0.0), 0.0, vec4(0.0), 0.0, 0u, uvec2(0u), 0.0, 0u, 0u, 0u, vec3(0.0), 0.0, 0u, 0u, 0u, 0u, 0u, 0.0, 0.0, 0.0, vec4(0.0), vec3(0.0), 0.0);
uvec2 fs_entryPointParam_ps_main_gbuffer = uvec2(0u);
vec3 fs_entryPointParam_ps_main_emissive = vec3(0.0);

ivec2 fs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 fs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 fs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}
float fs_tgDdy(float x){return -dFdy(x);}
vec2 fs_tgDdy(vec2 x){return -dFdy(x);}
vec3 fs_tgDdy(vec3 x){return -dFdy(x);}
vec4 fs_tgDdy(vec4 x){return -dFdy(x);}
vec4 fs_tgTexture(int i,vec2 uv,float bias){return i==0?texture(resource0,uv,bias):i==1?texture(resource1,uv,bias):texture(resource2,uv,bias);}
vec4 fs_tgTextureLod(int i,vec2 uv,float lod){return i==0?textureLod(resource0,uv,lod):i==1?textureLod(resource1,uv,lod):textureLod(resource2,uv,lod);}
vec4 fs_tgTextureGrad(int i,vec2 uv,vec2 dx,vec2 dy){return i==0?textureGrad(resource0,uv,dx,dy):i==1?textureGrad(resource1,uv,dx,dy):textureGrad(resource2,uv,dx,dy);}

fs_InstanceData_natural fs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_1,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return fs_InstanceData_natural(fs_Affine3Packed_natural(fs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),es_t3.x,uintBitsToFloat(es_t3.y),es_t3.z,es_t3.w);}
uint fs_tgOpt_jenkins(uint x){
  x += x << 10u;
  x ^= x >> 6u;
  x += x << 3u;
  x ^= x >> 11u;
  return x + (x << 15u);
}
uint fs_tgOpt_mixU(uint a, uint b){
  uint h = ((a * 1664525u + b) + 1013904223u) * 1664525u;
  h ^= h >> 11u;
  h ^= (h << 7u) & 2636928640u;
  h ^= (h << 15u) & 4022730752u;
  return h ^ (h >> 18u);
}
float fs_tgOpt_hash2f(uvec2 c){
  uint h = fs_tgOpt_mixU(c.x, fs_tgOpt_jenkins(c.y));
  return uintBitsToFloat((h & 8388607u) | 1065353216u) - 1.0;
}
void fs_read_uniform_FrameCounter_natural(){
ivec2 es_s=textureSize(uniform_FrameCounter_natural,0);
uvec4 es_t0=texelFetch(uniform_FrameCounter_natural,ivec2(0%es_s.x,0/es_s.x),0);
fs_frame_counter.index=es_t0.x;
}
void fs_read_uniform_ViewConstants_natural(){
ivec2 es_s=textureSize(uniform_ViewConstants_natural,0);
uvec4 es_t20=texelFetch(uniform_ViewConstants_natural,ivec2(20%es_s.x,20/es_s.x),0);
uvec4 es_t21=texelFetch(uniform_ViewConstants_natural,ivec2(21%es_s.x,21/es_s.x),0);
uvec4 es_t22=texelFetch(uniform_ViewConstants_natural,ivec2(22%es_s.x,22/es_s.x),0);
uvec4 es_t23=texelFetch(uniform_ViewConstants_natural,ivec2(23%es_s.x,23/es_s.x),0);
uvec4 es_t63=texelFetch(uniform_ViewConstants_natural,ivec2(63%es_s.x,63/es_s.x),0);
fs_current_view.view_to_world=mat4(uintBitsToFloat(es_t20.x),uintBitsToFloat(es_t21.x),uintBitsToFloat(es_t22.x),uintBitsToFloat(es_t23.x),uintBitsToFloat(es_t20.y),uintBitsToFloat(es_t21.y),uintBitsToFloat(es_t22.y),uintBitsToFloat(es_t23.y),uintBitsToFloat(es_t20.z),uintBitsToFloat(es_t21.z),uintBitsToFloat(es_t22.z),uintBitsToFloat(es_t23.z),uintBitsToFloat(es_t20.w),uintBitsToFloat(es_t21.w),uintBitsToFloat(es_t22.w),uintBitsToFloat(es_t23.w));
fs_current_view.mip_bias=uintBitsToFloat(es_t63.w);
}
void fs_read_uniform_MaterialData_natural(){
ivec2 es_s=textureSize(uniform_MaterialData_natural,0);
uvec4 es_t0=texelFetch(uniform_MaterialData_natural,ivec2(0%es_s.x,0/es_s.x),0);
uvec4 es_t1=texelFetch(uniform_MaterialData_natural,ivec2(1%es_s.x,1/es_s.x),0);
fs_material_data.curtains_texture=fs_Tex2D_natural(es_t0.x);
fs_material_data.indoors_texture=fs_Tex2D_natural(es_t1.x);
}
void fs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t8=texelFetch(uniform_FrameConstants_natural,ivec2(8%es_s.x,8/es_s.x),0);
fs_frame_constants.ev_mult=uintBitsToFloat(es_t8.z);
}
void fs_original_main()
{
fs_InstanceData_natural es_h0=fs_read_material_data_nani_instance_data(int(gs_vin.v4));
    if ((es_h0._bit_field_backing_0 >> uint(31)) != 0u)
    {
        if (all(notEqual((uvec2(gl_FragCoord.xy) & uvec2(1u)), fs__141[fs_frame_counter.index & 3u])))
        {
            discard;
        }
    }
    bool _164 = gs_vin.v5 != 0u;
    vec3 _2305;
    bool _2306;
    if (es_h0.has_albedo_texture != 0u)
    {
        vec3 _212 = fs_tgTexture(int(es_h0.albedo_texture), gs_vin.v3, fs_current_view.mip_bias).xyz;
        _2306 = (length(_212) > 0.119999997317790985107421875) ? true : _164;
        _2305 = _212;
    }
    else
    {
        _2306 = _164;
        _2305 = gs_vin.v0;
    }
    vec3 _1094 = dFdx(gs_vin.v2);
    vec3 _1101 = fs_tgDdy(gs_vin.v2);
    vec3 _328 = normalize(cross(_1094, _1101 * (-1.0)));
    vec3 _2598;
    if (_2306)
    {
        vec3 _346 = vec3(-_328.z, 0.0, _328.x);
        vec4 _1106 = fs_current_view.view_to_world * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 _365 = normalize(gs_vin.v2 - (_1106.xyz / vec3(_1106.w)));
        float _1135 = dot(_365, _328);
        vec3 hit_offset = (gs_vin.v2 + (_365 * (dot((gs_vin.v6 - (_328 * 0.20000000298023223876953125)) - gs_vin.v2, _328) / _1135))) - gs_vin.v6;
        float _424 = dot(hit_offset, _346);
        float _425 = hit_offset.y;
        vec2 _446 = vec2(((_424 - (_425 * (-0.300000011920928955078125))) + gs_vin.v6.x) + gs_vin.v6.y);
        ivec2 _1149 = ivec2(floor(_446));
        vec2 _1150 = fract(_446);
        float _2314 = fs_tgOpt_hash2f(uvec2(_1149));
        float _2321 = fs_tgOpt_hash2f(uvec2(_1149 + ivec2(1, 0)));
        float _2329 = fs_tgOpt_hash2f(uvec2(_1149 + ivec2(0, 1)));
        float _2338 = fs_tgOpt_hash2f(uvec2(_1149 + ivec2(1)));
        vec2 _1507 = (_1150 * _1150) * (vec2(3.0) - (vec2(2.0) * _1150));
        float _1182 = _1507.x;
        float _1183 = 1.0 - _1182;
        float _1185 = _1507.y;
        float _658 = _424 + ((((((1.0 - _1185) * ((_2314 * _1183) + (_2321 * _1182))) + ((_2329 * _1183) * _1185)) + ((_2338 * _1182) * _1185)) - 0.5) * 0.300000011920928955078125);
        float _2347;
        for (int _gs_once_0 = 0; _gs_once_0 < 1; _gs_once_0++) {
            float _1516 = abs(max(0.0, abs(_658) - 0.3549999892711639404296875));
            if (_1516 > 0.100000001490116119384765625)
            {
                _2347 = 0.0;
                break;
            }
            float _1520 = _1516 * 10.0;
            _2347 = 1.0 - ((_1520 * _1520) * (3.0 - (_1516 * 20.0)));
            break;
        }
        vec4 _715 = vec4(sqrt(fs_tgTextureGrad(int(fs_material_data.curtains_texture.bindless_handle), vec2(_658, _425 * (-1.0)) * vec2(3.0, 1.0), vec2(0.001000000047497451305389404296875, 0.0), vec2(0.0, 0.4000000059604644775390625)).xyz), 1.0) * (1.0 - _2347);
        vec3 hit_offset_1 = (gs_vin.v2 + (_365 * (dot((gs_vin.v6 - (_328 * 1.2000000476837158203125)) - gs_vin.v2, _328) / _1135))) - gs_vin.v6;
        float _733 = dot(hit_offset_1, _346);
        float _734 = hit_offset_1.y;
        vec2 _735 = vec2(_733, _734);
        float _739 = _734 * (-1.0);
        _735.y = _739;
        _2598 = clamp(mix(_715, vec4(vec3(0.07500000298023223876953125) + (sqrt(fs_tgTextureLod(int(fs_material_data.indoors_texture.bindless_handle), _735 + vec2(0.5), 4.5).xyz) * (0.4000000059604644775390625 * exp((-0.5) * ((_733 * _733) + (_739 * _739))))), 1.0), vec4(1.0 - _715.w)) * 0.4000000059604644775390625, vec4(0.0), vec4(1.0)).xyz;
    }
    else
    {
        _2598 = _2305 * 0.5;
    }
    vec3 _2665;
    if (es_h0.light_intensity > 0.0500000007450580596923828125)
    {
        vec3 _2445;
        if (gs_vin.v7 == 0u)
        {
            _2445 = vec3(0.87999999523162841796875, 0.84178292751312255859375, 0.21120001375675201416015625);
        }
        else
        {
            vec3 _2446;
            if (gs_vin.v7 == 1u)
            {
                _2446 = vec3(0.0, 0.300000011920928955078125, 1.5);
            }
            else
            {
                vec3 _2447;
                if (gs_vin.v7 == 2u)
                {
                    _2447 = vec3(0.16000001132488250732421875, 0.800000011920928955078125, 0.16000001132488250732421875);
                }
                else
                {
                    vec3 _2448;
                    if (gs_vin.v7 == 3u)
                    {
                        _2448 = vec3(0.480000019073486328125, 0.3200000226497650146484375, 1.60000002384185791015625);
                    }
                    else
                    {
                        _2448 = mix(fs__2453, vec3(0.800000011920928955078125, 0.16000001132488250732421875, 0.080000005662441253662109375), bvec3(gs_vin.v7 == 4u));
                    }
                    _2447 = _2448;
                }
                _2446 = _2447;
            }
            _2445 = _2446;
        }
        vec2 _849 = ((gs_vin.v2.xy + gs_vin.v2.zy) + vec2(1234.0)) * 0.20000000298023223876953125;
        ivec2 _1573 = ivec2(floor(_849));
        vec2 _1574 = fract(_849);
        float _2364 = fs_tgOpt_hash2f(uvec2(_1573));
        float _2382 = fs_tgOpt_hash2f(uvec2(_1573 + ivec2(1, 0)));
        float _2401 = fs_tgOpt_hash2f(uvec2(_1573 + ivec2(0, 1)));
        float _2421 = fs_tgOpt_hash2f(uvec2(_1573 + ivec2(1)));
        vec2 _1931 = (_1574 * _1574) * (vec2(3.0) - (vec2(2.0) * _1574));
        float _1606 = _1931.x;
        float _1607 = 1.0 - _1606;
        float _1609 = _1931.y;
        float mult = (mix(0.0, 1.0, clamp((((1.0 - _1609) * ((_2364 * _1607) + (_2382 * _1606))) + ((_2401 * _1607) * _1609)) + ((_2421 * _1606) * _1609), 0.0, 1.0)) * 0.60000002384185791015625) * es_h0.light_intensity;
        vec3 _2676;
        if (_2306)
        {
            _2676 = (_2445 * mult) * fs_frame_constants.ev_mult;
        }
        else
        {
            _2676 = ((_2445 * 0.20000000298023223876953125) * mult) * fs_frame_constants.ev_mult;
        }
        _2665 = _2676;
    }
    else
    {
        _2665 = vec3(0.0);
    }
    vec3 _1955 = (_328 * 0.5) + vec3(0.5);
    vec3 _2063 = sqrt(clamp(_2598, vec3(0.0), vec3(1.0)));
    uint _2078 = (uint((clamp(_2063.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_2063.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_2063.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2710 = uvec2(((uint((clamp(_1955.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1955.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1955.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + (uint((clamp(_2306 ? 0.07999999821186065673828125 : 0.800000011920928955078125, 0.0, 1.0) * 255.0) + 0.5) << uint(24)), _2078);
    _2710.y = _2078 | 117440512u;
    fs_entryPointParam_ps_main_gbuffer = _2710;
    fs_entryPointParam_ps_main_emissive = _2665;
}


void fs_main(){fs_read_uniform_FrameCounter_natural();fs_read_uniform_ViewConstants_natural();fs_read_uniform_MaterialData_natural();fs_read_uniform_FrameConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
