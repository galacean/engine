Shader "BuildingUnit/decoration_stone_frame/57605dac0a7fe764" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_6_0;
      usampler2D storage_0_0;
      usampler2D uniform_ViewConstants_natural;
      usampler2D storage_19_0;
      usampler2D storage_21_0;
      usampler2D uniform_ColorLibraryData_natural;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_20_0;
      sampler2DArray roof_colors_tex;
      sampler2DArray wall_color_data_brick_colors;
      sampler2DArray halftimber_colors_tex;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Normal;
        vec2 Vertex_UV;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        flat uint v0;
        vec3 v1;
        vec3 v2;
        float v7;
        flat float v8;
        vec2 v9;
        flat int v10;
        flat vec2 v11;
        flat int v12;
        flat uint v13;
      };
      BuildingVaryings gs_vin;

      uint vs_out_v0 = 0u;
      vec3 vs_out_v1 = vec3(0.0);
      vec3 vs_out_v2 = vec3(0.0);
      float vs_out_v7 = 0.0;
      float vs_out_v8 = 0.0;
      vec2 vs_out_v9 = vec2(0.0);
      int vs_out_v10 = 0;
      vec2 vs_out_v11 = vec2(0.0);
      int vs_out_v12 = 0;
      uint vs_out_v13 = 0u;
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
    uint wallspace_x_range_packed;
    uint seed;
    uint wall_slot_is_wooden_packed;
    float mesh_size_x;
};

struct vs__MatrixStorage_float3x3_ColMajornatural
{
    vec3 data[3];
};
vs__MatrixStorage_float3x3_ColMajornatural vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3 v[3]){vs__MatrixStorage_float3x3_ColMajornatural r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];return r;}




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
vec3 vs_v3 = vec3(0.0);
vec3 vs_v4 = vec3(0.0);
float vs_v5 = 0.0;
vec3 vs_v6 = vec3(0.0);
vs__MatrixStorage_float3x3_ColMajornatural vs_v14 = vs__MatrixStorage_float3x3_ColMajornatural(vec3[3](vec3(0.0), vec3(0.0), vec3(0.0)));

ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_6_0,0);return texelFetch(storage_6_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_InstanceData_natural vs_read_material_data_nani_instance_data_1(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return vs_InstanceData_natural(vs_Affine3Packed_natural(vs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),es_t3.x,es_t3.y,es_t3.z,uintBitsToFloat(es_t3.w));}
uint vs_word_wall_color_data_wall_color_ids_1(int p){ivec2 sz=textureSize(storage_19_0,0);return texelFetch(storage_19_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_wall_color_data_wall_color_ids_1(int i){return vs_word_wall_color_data_wall_color_ids_1((i*1)+0);}
uint vs_word_wall_identity_data_slot_wall_ids_1(int p){ivec2 sz=textureSize(storage_21_0,0);return texelFetch(storage_21_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_wall_identity_data_slot_wall_ids_1(int i){return vs_word_wall_identity_data_slot_wall_ids_1((i*1)+0);}
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
    uint _36 = uint(gl_InstanceID);
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_36));
vs_InstanceData_natural es_h1=vs_read_material_data_nani_instance_data_1(int(es_h0));
    mat3x4 _764 = transpose(mat4x3(vec3(es_h1.xform.data.data[0], es_h1.xform.data.data[1], es_h1.xform.data.data[2]), vec3(es_h1.xform.data.data[3], es_h1.xform.data.data[4], es_h1.xform.data.data[5]), vec3(es_h1.xform.data.data[6], es_h1.xform.data.data[7], es_h1.xform.data.data[8]), vec3(es_h1.xform.data.data[9], es_h1.xform.data.data[10], es_h1.xform.data.data[11])));
    vec3 _727 = vec4(gs_attr.Vertex_Position, 1.0) * _764;
    vec3 _767 = _727.xyz * 0.4000000059604644775390625;
    ivec3 _793 = ivec3(floor(_767));
    vec3 _794 = fract(_767);
    vec2 _782 = vs_tgOpt_hash3v2(uvec3(_793));
    vec2 _783 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(1, 0, 0)));
    vec2 _784 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(0, 1, 0)));
    vec2 _785 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(1, 1, 0)));
    vec2 _786 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(0, 0, 1)));
    vec2 _787 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(1, 0, 1)));
    vec2 _788 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(0, 1, 1)));
    vec2 _789 = vs_tgOpt_hash3v2(uvec3(_793 + ivec3(1)));
    vec3 _1705 = (_794 * _794) * (vec3(3.0) - (vec3(2.0) * _794));
    float _858 = _1705.x;
    float _859 = 1.0 - _858;
    float _861 = _1705.y;
    float _862 = 1.0 - _861;
    float _864 = _1705.z;
    float _865 = 1.0 - _864;
    vec2 _772 = clamp((((((((((((_782 * _859) * _862) * _865) + (((_783 * _858) * _862) * _865)) + (((_784 * _859) * _861) * _865)) + (((_785 * _858) * _861) * _865)) + (((_786 * _859) * _862) * _864)) + (((_787 * _858) * _862) * _864)) + (((_788 * _859) * _861) * _864)) + (((_789 * _858) * _861) * _864)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 pos_ws = _727 + (vec3(_772.x, 0.0, _772.y) * 0.0599999986588954925537109375);
    bool _1715 = (es_h1.wall_slot_is_wooden_packed & 2147483648u) != 0u;
    int _2035 = _1715 ? 1536 : 512;
    vec2 _536 = unpackHalf2x16(es_h1.wallspace_x_range_packed);
    uint _1762 = es_h1.wall_slot_is_wooden_packed & 2147483647u;
    uint _1775 = vs_read_wall_identity_data_slot_wall_ids_1(int(_1762)) & 65535u;
    uint _1780 = _1775 ^ 7993234u;
    uint _1820 = _1780 + (_1780 << 10u);
    uint _1822 = _1820 ^ (_1820 >> 6u);
    uint _1824 = _1822 + (_1822 << 3u);
    uint _1826 = _1824 ^ (_1824 >> 11u);
    uint _1782 = _1775 ^ 3450234u;
    uint _1842 = _1782 + (_1782 << 10u);
    uint _1844 = _1842 ^ (_1842 >> 6u);
    uint _1846 = _1844 + (_1844 << 3u);
    uint _1848 = _1846 ^ (_1846 >> 11u);
    vec2 _1793 = (((vec2(mix(_536.x, _536.y, ((gs_attr.Vertex_Position.x / (es_h1.mesh_size_x * 0.5)) * 0.5) + 0.5), pos_ws.y) * 0.100000001490116119384765625) * 0.699999988079071044921875) + vec2(float(_1775) * 0.20000000298023223876953125)) + vec2(uintBitsToFloat(((_1826 + (_1826 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_1848 + (_1848 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    uint _1796 = es_h1.seed ^ 292478890u;
    uint _1864 = _1796 + (_1796 << 10u);
    uint _1866 = _1864 ^ (_1864 >> 6u);
    uint _1868 = _1866 + (_1866 << 3u);
    uint _1870 = _1868 ^ (_1868 >> 11u);
    float _1878 = uintBitsToFloat(((_1870 + (_1870 << 15u)) & 8388607u) | 1065353216u) - 1.0;
    vec2 _1988;
    if (_1878 > 0.89999997615814208984375)
    {
        _1988 = _1793 * 3.0;
    }
    else
    {
        _1988 = _1793 + vec2(0.61000001430511474609375 * _1878);
    }
    vec2 _1989;
    if (int((_2035 & 512) != 0) == 1)
    {
        _1989 = _1988 * 2.2000000476837158203125;
    }
    else
    {
        _1989 = _1988;
    }
    vec2 _2002;
    if (_1715)
    {
        _2002 = gs_attr.Vertex_UV;
    }
    else
    {
        _2002 = _1989;
    }
    gl_Position = renderer_MVPMat * vec4(pos_ws, 1.0);
    vs_out_v0 = es_h1.seed;
    vs_out_v1 = vec4(gs_attr.Vertex_Normal, 0.0) * _764;
    vs_out_v2 = pos_ws.xyz;
    vs_v3 = vec3(0.0);
    vs_v4 = vec3(0.0);
    vs_v5 = 0.0;
    vs_v6 = vec3(0.0);
    vs_out_v7 = 0.0;
    vs_out_v8 = -100000.0;
    vs_out_v9 = _2002;
    vs_out_v10 = int(vs_read_wall_color_data_wall_color_ids_1(int(_1762)));
    vs_out_v11 = vec2(100000.0);
    vs_out_v12 = _2035;
    vs_out_v13 = es_h0;
    vs_v14 = vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3[](vec3(0.0), vec3(0.0), vec3(0.0)));
}


void vs_main(){vs_original_main();}

      BuildingVaryings vert(BuildingAttributes _gs_attr_in) {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v1 = vs_out_v1;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v7 = vs_out_v7;
        _gs_vout.v8 = vs_out_v8;
        _gs_vout.v9 = vs_out_v9;
        _gs_vout.v10 = vs_out_v10;
        _gs_vout.v11 = vs_out_v11;
        _gs_vout.v12 = vs_out_v12;
        _gs_vout.v13 = vs_out_v13;
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
    uint wallspace_x_range_packed;
    uint seed;
    uint wall_slot_is_wooden_packed;
    float mesh_size_x;
};

struct fs_Engine_ColorLibraryData_natural{
    vec4 temp_color_1;
    vec4 temp_color_2;
    vec4 temp_color_3;
    vec4 roof_color_1;
    vec4 roof_color_2;
    vec4 sky_low_day;
    vec4 sky_high_day;
    vec4 sun_tint_day;
    vec4 sky_low_dusk;
    vec4 sky_high_dusk;
    vec4 sun_tint_dusk;
    vec4 indirect_light_tint;
    vec4 fence_color_1;
    vec4 fence_color_2;
    vec4 flower_color_1;
    vec4 flower_color_2;
    vec4 canopy_color_1;
    vec4 canopy_color_2;
    vec4 grass_1;
    vec4 grass_2;
    vec4 path;
    vec4 sky_base;
    vec4 sky_horizon;
    vec4 sky_clouds_1;
    vec4 sky_clouds_2;
    vec4 terrain_1;
    vec4 terrain_2;
    vec4 terrain_flattened;
    vec4 wall_1;
    vec4 wall_2;
    vec4 wall_moss;
    vec4 wall_bricks;
    vec4 ivy_branch;
    vec4 ivy_leaf_1;
    vec4 ivy_leaf_2;
    vec4 terrain_highlight;
    vec4 night_tint;
};
fs_Engine_ColorLibraryData_natural fs_color_library_data = fs_Engine_ColorLibraryData_natural(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0));

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

ivec2 fs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 fs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 fs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}
float fs_tgDdy(float x){return -dFdy(x);}
vec2 fs_tgDdy(vec2 x){return -dFdy(x);}
vec3 fs_tgDdy(vec3 x){return -dFdy(x);}
vec4 fs_tgDdy(vec4 x){return -dFdy(x);}

fs_InstanceData_natural fs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return fs_InstanceData_natural(fs_Affine3Packed_natural(fs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),es_t3.x,es_t3.y,es_t3.z,uintBitsToFloat(es_t3.w));}
uint fs_word_halftimber_colors_ids_1(int p){ivec2 sz=textureSize(storage_20_0,0);return texelFetch(storage_20_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_halftimber_colors_ids_1(int i){return fs_word_halftimber_colors_ids_1((i*1)+0);}
void fs_read_uniform_ColorLibraryData_natural(){
ivec2 es_s=textureSize(uniform_ColorLibraryData_natural,0);
uvec4 es_t28=texelFetch(uniform_ColorLibraryData_natural,ivec2(28%es_s.x,28/es_s.x),0);
uvec4 es_t30=texelFetch(uniform_ColorLibraryData_natural,ivec2(30%es_s.x,30/es_s.x),0);
uvec4 es_t31=texelFetch(uniform_ColorLibraryData_natural,ivec2(31%es_s.x,31/es_s.x),0);
fs_color_library_data.wall_1=vec4(uintBitsToFloat(es_t28.x),uintBitsToFloat(es_t28.y),uintBitsToFloat(es_t28.z),uintBitsToFloat(es_t28.w));
fs_color_library_data.wall_moss=vec4(uintBitsToFloat(es_t30.x),uintBitsToFloat(es_t30.y),uintBitsToFloat(es_t30.z),uintBitsToFloat(es_t30.w));
fs_color_library_data.wall_bricks=vec4(uintBitsToFloat(es_t31.x),uintBitsToFloat(es_t31.y),uintBitsToFloat(es_t31.z),uintBitsToFloat(es_t31.w));
}
void fs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t8=texelFetch(uniform_FrameConstants_natural,ivec2(8%es_s.x,8/es_s.x),0);
uvec4 es_t17=texelFetch(uniform_FrameConstants_natural,ivec2(17%es_s.x,17/es_s.x),0);
uvec4 es_t18=texelFetch(uniform_FrameConstants_natural,ivec2(18%es_s.x,18/es_s.x),0);
uvec4 es_t19=texelFetch(uniform_FrameConstants_natural,ivec2(19%es_s.x,19/es_s.x),0);
fs_frame_constants.glade_theme_id=es_t8.w;
fs_frame_constants.brush_position=vec3(uintBitsToFloat(es_t17.x),uintBitsToFloat(es_t17.y),uintBitsToFloat(es_t17.z));
fs_frame_constants.eraser_size_multiplier=uintBitsToFloat(es_t17.w);
fs_frame_constants.wall_highlight_mode=es_t18.w;
fs_frame_constants.highlight_bricks_to_delete=es_t19.x;
}
void fs_original_main()
{
    if (gs_vin.v2.y < gs_vin.v8)
    {
        discard;
    }
    bool _140 = (gs_vin.v12 & 8) != 0;
    bool _146 = (gs_vin.v12 & 16) != 0;
    bool _152 = (gs_vin.v12 & 2048) != 0;
    bool _160 = (gs_vin.v12 & 256) != 0;
    bool _1872;
    if (!_140)
    {
        _1872 = gs_vin.v7 > (-2.5);
    }
    else
    {
        _1872 = false;
    }
    bool _1873;
    if (_1872)
    {
        _1873 = gs_vin.v2.y < gs_vin.v7;
    }
    else
    {
        _1873 = false;
    }
    if (_1873)
    {
        discard;
    }
    else
    {
        bool _1874;
        if (_140)
        {
            _1874 = gs_vin.v2.y > gs_vin.v7;
        }
        else
        {
            _1874 = false;
        }
        if (_1874)
        {
            discard;
        }
    }
    uint color_id = uint(gs_vin.v10);
    vec3 _1916;
    if ((gs_vin.v12 & 2) != 0)
    {
        _1916 = texture(roof_colors_tex, vec3((vec2(uvec2(gs_vin.v0)) * 0.20000000298023223876953125) + (gs_vin.v2.xz * 0.20000000298023223876953125), float(color_id))).xyz * 0.699999988079071044921875;
    }
    else
    {
        vec2 _1878;
        if (_160)
        {
            _1878 = gs_vin.v9 + vec2(0.20999999344348907470703125);
        }
        else
        {
            _1878 = gs_vin.v9;
        }
        bool _1875;
        if (color_id == 1u)
        {
            _1875 = true;
        }
        else
        {
            _1875 = color_id == 0u;
        }
        vec3 _1901;
        if (_1875)
        {
            _1901 = pow(fs_color_library_data.wall_bricks.xyz, vec3(1.2999999523162841796875));
        }
        else
        {
            _1901 = pow(fs_color_library_data.wall_moss.xyz, vec3(1.0)) * 0.800000011920928955078125;
        }
        int _285 = int(color_id);
        bool _1879;
        if (_285 == 0)
        {
            _1879 = true;
        }
        else
        {
            _1879 = _285 == 4;
        }
        bool _1880;
        if (_1879)
        {
            _1880 = true;
        }
        else
        {
            _1880 = _285 == 10;
        }
        bool _1881;
        if (_1880)
        {
            _1881 = true;
        }
        else
        {
            _1881 = _285 == 12;
        }
        vec3 _1887;
        if (_1881)
        {
            _1887 = texture(wall_color_data_brick_colors, vec3(_1878 + vec2(0.85000002384185791015625), 0.0)).xyz;
        }
        else
        {
            bool _1882;
            if (_285 == 1)
            {
                _1882 = true;
            }
            else
            {
                _1882 = _285 == 5;
            }
            vec3 _1888;
            if (_1882)
            {
                _1888 = pow(texture(wall_color_data_brick_colors, vec3(_1878 + vec2(0.449999988079071044921875), 1.0)).xyz, vec3(1.10000002384185791015625));
            }
            else
            {
                bool _1883;
                if (_285 == 2)
                {
                    _1883 = true;
                }
                else
                {
                    _1883 = _285 == 7;
                }
                vec3 _1889;
                if (_1883)
                {
                    _1889 = texture(wall_color_data_brick_colors, vec3(_1878, 2.0)).xyz;
                }
                else
                {
                    bool _1884;
                    if (_285 == 3)
                    {
                        _1884 = true;
                    }
                    else
                    {
                        _1884 = _285 == 6;
                    }
                    bool _1885;
                    if (_1884)
                    {
                        _1885 = true;
                    }
                    else
                    {
                        _1885 = _285 == 8;
                    }
                    bool _1886;
                    if (_1885)
                    {
                        _1886 = true;
                    }
                    else
                    {
                        _1886 = _285 == 9;
                    }
                    vec3 _1890;
                    if (_1886)
                    {
                        _1890 = texture(wall_color_data_brick_colors, vec3(_1878, 3.0)).xyz;
                    }
                    else
                    {
                        vec3 _1891;
                        if (_285 == 11)
                        {
                            _1891 = texture(wall_color_data_brick_colors, vec3(_1878, 4.0)).xyz;
                        }
                        else
                        {
                            _1891 = vec3(0.0);
                        }
                        _1890 = _1891;
                    }
                    _1889 = _1890;
                }
                _1888 = _1889;
            }
            _1887 = _1888;
        }
        bool _504 = color_id == 7u;
        bool _1892;
        if (_504)
        {
            _1892 = true;
        }
        else
        {
            _1892 = color_id == 2u;
        }
        bool _1893;
        if (_1892)
        {
            _1893 = true;
        }
        else
        {
            _1893 = color_id == 11u;
        }
        vec3 _1915;
        if ((gs_vin.v12 & 512) != 0)
        {
            uint _528 = gs_vin.v0 ^ 8902390u;
            uint _1302 = _528 + (_528 << 10u);
            uint _1304 = _1302 ^ (_1302 >> 6u);
            uint _1306 = _1304 + (_1304 << 3u);
            uint _1308 = _1306 ^ (_1306 >> 11u);
            _1915 = mix(_1887, mix(_1901, _1887, bvec3(_1893)), vec3(mix(0.0, 0.5, smoothstep(0.20000000298023223876953125, 0.800000011920928955078125, uintBitsToFloat(((_1308 + (_1308 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1915 = _1887;
        }
        vec3 _1917;
        if (_160)
        {
            bool _1911;
            if (_504)
            {
                _1911 = true;
            }
            else
            {
                _1911 = color_id == 2u;
            }
            uint _592 = gs_vin.v0 ^ 239085u;
            uint _1324 = _592 + (_592 << 10u);
            uint _1326 = _1324 ^ (_1324 >> 6u);
            uint _1328 = _1326 + (_1326 << 3u);
            uint _1330 = _1328 ^ (_1328 >> 11u);
            _1917 = mix(_1915, fs_color_library_data.wall_1.xyz, vec3(mix(0.0, _1911 ? 0.20000000298023223876953125 : 0.4000000059604644775390625, smoothstep(0.0, 0.800000011920928955078125, uintBitsToFloat(((_1330 + (_1330 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1917 = _1915;
        }
        _1916 = _1917;
    }
    vec3 _671 = normalize(gs_vin.v1);
    vec3 _1978;
    bool _2043;
    if (!((gs_vin.v12 & 64) != 0))
    {
        uint _1919;
        if ((gs_vin.v12 & 4096) != 0)
        {
            _1919 = fs_frame_constants.wall_highlight_mode;
        }
        else
        {
            _1919 = 0u;
        }
        vec3 _1981;
        bool _2046;
        if (_1919 == 1u)
        {
            _2046 = true;
            _1981 = mix(_1916, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        }
        else
        {
            bool _1375 = _1919 == 2u;
            vec3 _1982;
            if (_1375)
            {
                _1982 = mix(_1916, vec3(0.5), vec3(0.100000001490116119384765625));
            }
            else
            {
                _1982 = _1916;
            }
            _2046 = _1375 ? true : false;
            _1981 = _1982;
        }
        bool _1922;
        if (fs_frame_constants.highlight_bricks_to_delete == 1u)
        {
            _1922 = distance(fs_frame_constants.brush_position.xz, gs_vin.v11) < (1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier);
        }
        else
        {
            _1922 = false;
        }
        vec3 _1979;
        if (_1922)
        {
            _1979 = mix(_1916, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
        }
        else
        {
            _1979 = _1981;
        }
        _2043 = _1922 ? true : _2046;
        _1978 = _1979;
    }
    else
    {
        _2043 = false;
        _1978 = _1916;
    }
    vec3 _1977;
    if (_152)
    {
        _1977 = mix(_1916, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
    }
    else
    {
        _1977 = _1978;
    }
    vec3 _1976;
    if (int((gs_vin.v12 & 1024) != 0) == 1)
    {
        _1976 = texture(halftimber_colors_tex, vec3(gs_vin.v9, float(int(fs_read_halftimber_colors_ids_1(int(fs_read_material_data_nani_instance_data(int(gs_vin.v13)).wall_slot_is_wooden_packed & 2147483647u)))))).xyz;
    }
    else
    {
        _1976 = _1977;
    }
    vec3 _2092;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        vec2 _863 = gs_vin.v2.xz * 0.4000000059604644775390625;
        vec2 _1446 = floor(_863 + vec2(dot(_863, vec2(0.3660254180431365966796875))));
        vec2 _1450 = (_863 - _1446) + vec2(dot(_1446, vec2(0.211324870586395263671875)));
        float _1451 = _1450.x;
        float _1452 = _1450.y;
        vec2 _2183 = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), bvec2(_1451 > _1452));
        vec4 _1458 = _1450.xyxy + vec4(0.211324870586395263671875, 0.211324870586395263671875, -0.57735025882720947265625, -0.57735025882720947265625);
        vec2 _1461 = _1458.xy - _2183;
        vec4 _1857 = _1458;
        _1857.x = _1461.x;
        _1857.y = _1461.y;
        vec2 _1466 = _1446 - vec2(289.0) * trunc(_1446 / vec2(289.0));
        vec3 _1472 = vec3(_1466.y) + vec3(0.0, _2183.y, 1.0);
        vec3 _1545 = ((_1472 * 34.0) + vec3(1.0)) * _1472;
        vec3 _1480 = ((_1545 - vec3(289.0) * trunc(_1545 / vec3(289.0))) + vec3(_1466.x)) + vec3(0.0, _2183.x, 1.0);
        vec3 _1552 = ((_1480 * 34.0) + vec3(1.0)) * _1480;
        vec3 _1496 = max(vec3(0.5) - vec3(dot(_1450, _1450), dot(_1857.xy, _1857.xy), dot(_1857.zw, _1857.zw)), vec3(0.0));
        vec3 _1497 = _1496 * _1496;
        vec3 _1501 = fract((_1552 - vec3(289.0) * trunc(_1552 / vec3(289.0))) * vec3(0.024390242993831634521484375)) * 2.0;
        vec3 _1503 = _1501 - vec3(1.0);
        vec3 _1506 = abs(_1503) - vec3(0.5);
        vec3 _1510 = _1503 - floor(_1501 + vec3(-0.5));
        _2092 = mix(_1976, vec3(0.699999988079071044921875), vec3(smoothstep(0.0, 1.0, smoothstep(-0.100000001490116119384765625, 0.0, gs_vin.v2.y) * clamp(_671.y, 0.0, 1.0)) * clamp(clamp((130.0 * dot((_1497 * _1497) * (vec3(1.792842864990234375) - (((_1510 * _1510) + (_1506 * _1506)) * 0.8537347316741943359375)), vec3((_1510.x * _1451) + (_1506.x * _1452), (_1510.yz * _1857.xz) + (_1506.yz * _1857.yw)))) + 0.75, 0.0, 1.0), _146 ? 0.0 : 0.4000000059604644775390625, _146 ? 0.100000001490116119384765625 : 1.0)));
    }
    else
    {
        _2092 = _1976;
    }
    vec3 _1565 = (_671 * 0.5) + vec3(0.5);
    vec3 _1673 = sqrt(clamp(_2092, vec3(0.0), vec3(1.0)));
    uint _1688 = (uint((clamp(_1673.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1673.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1673.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2170 = uvec2(((uint((clamp(_1565.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1565.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1565.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u, _1688);
    _2170.y = _1688 | (((7u | (uint(_152 ? true : _2043) << 3u)) | 128u) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _2170;
}


void fs_main(){fs_read_uniform_ColorLibraryData_natural();fs_read_uniform_FrameConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
