Shader "BuildingUnit/brick_roof/b5b5a9ab0eea8bfb" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D uniform_MaterialData_natural;
      usampler2D storage_0_2;
      usampler2D storage_0_1;
      usampler2D uniform_ViewConstants_natural;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_9_0;
      usampler2D storage_8_1;
      usampler2D storage_7_0;
      usampler2D storage_10_0;
      vec4 renderer_DormerGrid;
      usampler2D uniform_ColorLibraryData_natural;
      sampler2DArray roof_colors_tex;
      sampler2DArray wall_color_data_brick_colors;
      usampler2D domain_roof;
      usampler2D domain_counts;
      usampler2D domain_holes;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Normal;
        int is_bevel;
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
struct vs__Array_natural_uint5
{
    uint data[5];
};
vs__Array_natural_uint5 vs_masonryMake_Array_natural_uint5(uint v[5]){vs__Array_natural_uint5 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];r.data[3]=v[3];r.data[4]=v[4];return r;}


struct vs__Array_natural_uint3
{
    uint data[3];
};
vs__Array_natural_uint3 vs_masonryMake_Array_natural_uint3(uint v[3]){vs__Array_natural_uint3 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];return r;}


struct vs__Array_natural_uint2
{
    uint data[2];
};
vs__Array_natural_uint2 vs_masonryMake_Array_natural_uint2(uint v[2]){vs__Array_natural_uint2 r;r.data[0]=v[0];r.data[1]=v[1];return r;}


struct vs_InstancedWallData_natural
{
    vs__Array_natural_uint5 transform_matrix_packed;
    vs__Array_natural_uint3 transform_translation;
    vs__Array_natural_uint2 sin_deform_y_packed;
    vs__Array_natural_uint3 arch_and_wallspace_packed;
    uint seed;
    uint source_id;
    uint flags;
};

struct vs__MatrixStorage_float3x3_ColMajornatural
{
    vec3 data[3];
};
vs__MatrixStorage_float3x3_ColMajornatural vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3 v[3]){vs__MatrixStorage_float3x3_ColMajornatural r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];return r;}


struct vs_Engine_MaterialData_natural{
    uint use_highlight_draw_list;
};
vs_Engine_MaterialData_natural vs_material_data = vs_Engine_MaterialData_natural(0u);



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

struct vs_Engine_FrameConstants_natural{
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
vs_Engine_FrameConstants_natural vs_frame_constants = vs_Engine_FrameConstants_natural(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0), 0.0, 0.0, 0.0, 0u, uvec2(0u), 0u, 0.0, vec3(0.0), 0.0, vec3(0.0), 0u, vec3(0.0), 0u, vec3(0.0), 0.0, vec4(0.0), 0.0, 0u, uvec2(0u), 0.0, 0u, 0u, 0u, vec3(0.0), 0.0, 0u, 0u, 0u, 0u, 0u, 0.0, 0.0, 0.0, vec4(0.0), vec3(0.0), 0.0);
vec3 vs_v3 = vec3(0.0);
vec3 vs_v4 = vec3(0.0);
float vs_v5 = 0.0;
vec3 vs_v6 = vec3(0.0);
vs__MatrixStorage_float3x3_ColMajornatural vs_v14 = vs__MatrixStorage_float3x3_ColMajornatural(vec3[3](vec3(0.0), vec3(0.0), vec3(0.0)));

ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_material_data_instance_list(int p){ivec2 sz=textureSize(storage_0_2,0);return texelFetch(storage_0_2,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_material_data_instance_list(int i){return vs_word_material_data_instance_list((i*1)+0);}

vs_InstancedWallData_natural vs_read_material_data_instanced_wall_data_1(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_1,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return vs_InstancedWallData_natural(vs_masonryMake_Array_natural_uint5(uint[5](es_t0.x,es_t0.y,es_t0.z,es_t0.w,es_t1.x)),vs_masonryMake_Array_natural_uint3(uint[3](es_t1.y,es_t1.z,es_t1.w)),vs_masonryMake_Array_natural_uint2(uint[2](es_t2.x,es_t2.y)),vs_masonryMake_Array_natural_uint3(uint[3](es_t2.z,es_t2.w,es_t3.x)),es_t3.y,es_t3.z,es_t3.w);}
uint vs_word_stone_foundation_colors_ids_1(int p){ivec2 sz=textureSize(storage_9_0,0);return texelFetch(storage_9_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_stone_foundation_colors_ids_1(int i){return vs_word_stone_foundation_colors_ids_1((i*1)+0);}
uint vs_word_roof_colors_ids_1(int p){ivec2 sz=textureSize(storage_8_1,0);return texelFetch(storage_8_1,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_roof_colors_ids_1(int i){return vs_word_roof_colors_ids_1((i*1)+0);}
uint vs_word_wall_color_data_wall_color_ids_1(int p){ivec2 sz=textureSize(storage_7_0,0);return texelFetch(storage_7_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_wall_color_data_wall_color_ids_1(int i){return vs_word_wall_color_data_wall_color_ids_1((i*1)+0);}
uint vs_word_wall_identity_data_slot_wall_ids_1(int p){ivec2 sz=textureSize(storage_10_0,0);return texelFetch(storage_10_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
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
void vs_read_uniform_MaterialData_natural(){
ivec2 es_s=textureSize(uniform_MaterialData_natural,0);
uvec4 es_t0=texelFetch(uniform_MaterialData_natural,ivec2(0%es_s.x,0/es_s.x),0);
vs_material_data.use_highlight_draw_list=es_t0.x;
}
void vs_read_uniform_ViewConstants_natural(){
ivec2 es_s=textureSize(uniform_ViewConstants_natural,0);
uvec4 es_t20=texelFetch(uniform_ViewConstants_natural,ivec2(20%es_s.x,20/es_s.x),0);
uvec4 es_t21=texelFetch(uniform_ViewConstants_natural,ivec2(21%es_s.x,21/es_s.x),0);
uvec4 es_t22=texelFetch(uniform_ViewConstants_natural,ivec2(22%es_s.x,22/es_s.x),0);
uvec4 es_t23=texelFetch(uniform_ViewConstants_natural,ivec2(23%es_s.x,23/es_s.x),0);
vs_current_view.view_to_world=mat4(uintBitsToFloat(es_t20.x),uintBitsToFloat(es_t21.x),uintBitsToFloat(es_t22.x),uintBitsToFloat(es_t23.x),uintBitsToFloat(es_t20.y),uintBitsToFloat(es_t21.y),uintBitsToFloat(es_t22.y),uintBitsToFloat(es_t23.y),uintBitsToFloat(es_t20.z),uintBitsToFloat(es_t21.z),uintBitsToFloat(es_t22.z),uintBitsToFloat(es_t23.z),uintBitsToFloat(es_t20.w),uintBitsToFloat(es_t21.w),uintBitsToFloat(es_t22.w),uintBitsToFloat(es_t23.w));
}
void vs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t15=texelFetch(uniform_FrameConstants_natural,ivec2(15%es_s.x,15/es_s.x),0);
vs_frame_constants.highlighted_transient_stair_edge_id=es_t15.y;
}
void vs_original_main()
{
    bool _98 = vs_material_data.use_highlight_draw_list != 0u;
    uint _133 = (uint(_98) * 4194304u) + uint(gl_InstanceID);
uint es_h0=vs_read_material_data_instance_list(int(_133));
vs_InstancedWallData_natural es_h1=vs_read_material_data_instanced_wall_data_1(int(es_h0));
    vec2 _1352 = unpackHalf2x16(es_h1.sin_deform_y_packed.data[0]);
    vec2 _1354 = unpackHalf2x16(es_h1.sin_deform_y_packed.data[1]);
    uint _1359 = uint(int(es_h1.seed & 3u)) & 3u;
    int _1362 = -int(_1359 & 1u);
    int _1367 = 1 - int((_1359 >> uint(1)) << uint(1));
    float _1369 = float((~_1362) & _1367);
    float _1371 = float(_1362 & _1367);
    vec4 _1373 = vec4(_1369, 0.0, -_1371, 0.0);
    vec4 _1375 = vec4(_1371, 0.0, _1369, 0.0);
    mat4 _1377 = mat4(_1373, vec4(0.0, 1.0, 0.0, 0.0), _1375, vec4(0.0, 0.0, 0.0, 1.0));
    vec2 _1390 = unpackHalf2x16(es_h1.transform_matrix_packed.data[1]);
    mat3x4 _1466 = transpose(mat4x3(vec3(unpackHalf2x16(es_h1.transform_matrix_packed.data[0]), _1390.x), vec3(_1390.y, unpackHalf2x16(es_h1.transform_matrix_packed.data[2])), vec3(unpackHalf2x16(es_h1.transform_matrix_packed.data[3]), unpackHalf2x16(es_h1.transform_matrix_packed.data[4]).x), vec3(uintBitsToFloat(es_h1.transform_translation.data[0]), uintBitsToFloat(es_h1.transform_translation.data[1]), uintBitsToFloat(es_h1.transform_translation.data[2]))));
    mat3x4 _3150 = _1466;
    _3150[0][3] = _1466[0][3];
    mat3x4 _3152 = _3150;
    _3152[1][3] = _1466[1][3];
    mat3x4 _3154 = _3152;
    _3154[2][3] = _1466[2][3];
    vec4 _366 = vec4(gs_attr.Vertex_Position, 1.0) * _1377;
    vec3 vertex_rotated = _366.xyz;
    int _375 = int(es_h1.flags);
    mat3x4 _3163;
    if ((_375 & 32) != 0)
    {
        vec2 _1483 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[0]);
        vec3 _449 = vec3(_3150[0][2], _3152[1][2], _3154[2][2]) * mix(_1483.x, _1483.y, 0.5 - _366.x);
        mat3x4 _3156 = _3154;
        _3156[0][2] = _449.x;
        _3156[1][2] = _449.y;
        _3156[2][2] = _449.z;
        _3163 = _3156;
    }
    else
    {
        _3163 = _3154;
    }
    int _2847;
    if (_98)
    {
        _2847 = _375 | 4096;
    }
    else
    {
        _2847 = _375;
    }
    vec3 _2849;
    if ((_2847 & 4) != 0)
    {
        uint _1506 = es_h1.seed + (es_h1.seed << 10u);
        uint _1508 = _1506 ^ (_1506 >> 6u);
        uint _1510 = _1508 + (_1508 << 3u);
        uint _1512 = _1510 ^ (_1510 >> 11u);
        float _3176 = ((uintBitsToFloat(((_1512 + (_1512 << 15u)) & 8388607u) | 1065353216u) - 1.0) > 0.89999997615814208984375) ? 1.0 : 1.10000002384185791015625;
        _2849 = mix(vec3(_3176, _3176, 1.0), vec3(1.0499999523162841796875), bvec3((_375 & 1) != 0));
    }
    else
    {
        _2849 = vec3(1.0);
    }
    mat3x4 _547 = mat4(vec4(_2849.x, 0.0, 0.0, 0.0), vec4(0.0, _2849.y, 0.0, 0.0), vec4(0.0, 0.0, _2849.z, 0.0), vec4(0.0, 0.0, 0.0, 1.0)) * _3163;
    vec4 _551 = vec4(vec4(vertex_rotated, 1.0) * _547, 1.0);
    vec3 _553 = _551.xyz;
    vec3 _1523 = _553 * 0.4000000059604644775390625;
    ivec3 _1549 = ivec3(floor(_1523));
    vec3 _1550 = fract(_1523);
    vec2 _1538 = vs_tgOpt_hash3v2(uvec3(_1549));
    vec2 _1539 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(1, 0, 0)));
    vec2 _1540 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(0, 1, 0)));
    vec2 _1541 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(1, 1, 0)));
    vec2 _1542 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(0, 0, 1)));
    vec2 _1543 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(1, 0, 1)));
    vec2 _1544 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(0, 1, 1)));
    vec2 _1545 = vs_tgOpt_hash3v2(uvec3(_1549 + ivec3(1)));
    vec3 _2461 = (_1550 * _1550) * (vec3(3.0) - (vec3(2.0) * _1550));
    float _1614 = _2461.x;
    float _1615 = 1.0 - _1614;
    float _1617 = _2461.y;
    float _1618 = 1.0 - _1617;
    float _1620 = _2461.z;
    float _1621 = 1.0 - _1620;
    vec2 _1528 = clamp((((((((((((_1538 * _1615) * _1618) * _1621) + (((_1539 * _1614) * _1618) * _1621)) + (((_1540 * _1615) * _1617) * _1621)) + (((_1541 * _1614) * _1617) * _1621)) + (((_1542 * _1615) * _1618) * _1620)) + (((_1543 * _1614) * _1618) * _1620)) + (((_1544 * _1615) * _1617) * _1620)) + (((_1545 * _1614) * _1617) * _1620)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 _840 = _553 + (vec3(_1528.x, 0.0, _1528.y) * 0.0599999986588954925537109375);
    vec4 _2839 = _551;
    _2839.x = _840.x;
    _2839.z = _840.z;
    vec3 _848 = vec4(0.0, 0.0, 0.0, 1.0) * _547;
    float _2466 = _366.x - (-0.5);
    float _864 = _840.y + mix(mix(_1352.x, _1352.y, _2466), mix(_1354.x, _1354.y, _2466), _366.y - (-0.5));
    _2839.y = _864;
    vec2 _2502 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[1]);
    float _2505 = _2502.y;
    mat3 _901 = mat3(_547[0].xyz, _547[1].xyz, _547[2].xyz);
    vec3 _2510 = vec3(1.0, 0.0, 0.0) * _901;
    vec3 _2511 = vec3(0.0, 1.0, 0.0) * _901;
    vec3 _2512 = vec3(0.0, 0.0, 1.0) * _901;
    vec3 _2515 = cross(_2510, _2511);
    vec3 _2518 = vec3(1.0 / dot(_2512, _2515));
    mat3 _924 = transpose(mat3(cross(_2511, _2512) * _2518, cross(_2512, _2510) * _2518, _2515 * _2518));
    uint _939 = es_h1.seed & 65535u;
    vec3 _947 = (vec4(gs_attr.Vertex_Normal, 0.0) * _1377).xyz * _924;
    bool _951 = gs_attr.is_bevel != 0;
    int _2947;
    if (_951)
    {
        _2947 = _2847 | 256;
    }
    else
    {
        _2947 = _2847;
    }
    int _2950;
    if (es_h1.seed < 10u)
    {
        _2950 = _2947 | 512;
    }
    else
    {
        _2950 = _2947;
    }
    mat3 _999 = mat3(_1373.xyz, vec3(0.0, 1.0, 0.0), _1375.xyz);
    vec3 _1000 = _999 * vertex_rotated;
    vec4 _2527 = vs_current_view.view_to_world * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 camera_offset_ws = (_2527.xyz / vec3(_2527.w)) - _848;
    vec3 _1020 = _999 * (_924 * camera_offset_ws);
    mat3 _1033 = _999 * _924;
    vec2 _2548 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[0]);
    float _2951;
    if (_2466 < 0.5)
    {
        _2951 = mix(_2548.x, _2548.y, _2466 * 2.0);
    }
    else
    {
        _2951 = mix(_2548.y, _2502.x, (_2466 * 2.0) - 1.0);
    }
    bool _1057 = (es_h1.source_id & 2147483648u) != 0u;
    int _2959;
    int _3035;
    if (_1057)
    {
        bool _2954;
        if ((es_h1.source_id & 1073741824u) != 0u)
        {
            _2954 = ((es_h1.source_id >> 4u) & 65535u) == vs_frame_constants.highlighted_transient_stair_edge_id;
        }
        else
        {
            _2954 = false;
        }
        int _2962;
        if (_2954)
        {
            _2962 = _2950 | 2048;
        }
        else
        {
            _2962 = _2950;
        }
        _3035 = int(es_h1.source_id & 15u);
        _2959 = _2962;
    }
    else
    {
        int _3036;
        if ((_2950 & 8192) != 0)
        {
            _3036 = int(vs_read_stone_foundation_colors_ids_1(int(es_h1.source_id)));
        }
        else
        {
            uint _2953;
            if ((_2950 & 2) != 0)
            {
                _2953 = vs_read_roof_colors_ids_1(int(es_h1.source_id));
            }
            else
            {
                _2953 = vs_read_wall_color_data_wall_color_ids_1(int(es_h1.source_id));
            }
            _3036 = int(_2953);
        }
        _3035 = _3036;
        _2959 = _2950;
    }
    uint _2957;
    if (_1057)
    {
        _2957 = es_h1.source_id;
    }
    else
    {
        _2957 = vs_read_wall_identity_data_slot_wall_ids_1(int(es_h1.source_id));
    }
    uint _2559 = _2957 & 65535u;
    uint _2564 = _2559 ^ 7993234u;
    uint _2604 = _2564 + (_2564 << 10u);
    uint _2606 = _2604 ^ (_2604 >> 6u);
    uint _2608 = _2606 + (_2606 << 3u);
    uint _2610 = _2608 ^ (_2608 >> 11u);
    uint _2566 = _2559 ^ 3450234u;
    uint _2626 = _2566 + (_2566 << 10u);
    uint _2628 = _2626 ^ (_2626 >> 6u);
    uint _2630 = _2628 + (_2628 << 3u);
    uint _2632 = _2630 ^ (_2630 >> 11u);
    vec2 _2577 = (((vec2(mix(_2505, unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[2]).x, _2466), ((_2950 & 1024) != 0) ? 0.0 : _864) * 0.100000001490116119384765625) * 0.699999988079071044921875) + vec2(float(_2559) * 0.20000000298023223876953125)) + vec2(uintBitsToFloat(((_2610 + (_2610 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_2632 + (_2632 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    uint _2580 = _939 ^ 292478890u;
    uint _2648 = _2580 + (_2580 << 10u);
    uint _2650 = _2648 ^ (_2648 >> 6u);
    uint _2652 = _2650 + (_2650 << 3u);
    uint _2654 = _2652 ^ (_2652 >> 11u);
    float _2662 = uintBitsToFloat(((_2654 + (_2654 << 15u)) & 8388607u) | 1065353216u) - 1.0;
    vec2 _2964;
    if (_2662 > 0.89999997615814208984375)
    {
        _2964 = _2577 * 3.0;
    }
    else
    {
        _2964 = _2577 + vec2(0.61000001430511474609375 * _2662);
    }
    vec2 _2965;
    if (int((_2959 & 512) != 0) == 1)
    {
        _2965 = _2964 * 2.2000000476837158203125;
    }
    else
    {
        _2965 = _2964;
    }
    bool _1204 = (_2950 & 32) != 0;
    vec2 _3042;
    if (_1204)
    {
        vec2 _2984;
        if (_947.y > 0.89999997615814208984375)
        {
            _2984 = _2839.xz * 0.699999988079071044921875;
        }
        else
        {
            vec2 _2985;
            if (abs(_947.x) > 0.89999997615814208984375)
            {
                _2985 = _2839.zy * 0.699999988079071044921875;
            }
            else
            {
                _2985 = _2839.xy * 0.699999988079071044921875;
            }
            _2984 = _2985;
        }
        vec2 _2983;
        if (_951)
        {
            _2983 = vec2(_2505);
        }
        else
        {
            _2983 = _2984;
        }
        uint _2670 = es_h1.seed + (es_h1.seed << 10u);
        uint _2672 = _2670 ^ (_2670 >> 6u);
        uint _2674 = _2672 + (_2672 << 3u);
        uint _2676 = _2674 ^ (_2674 >> 11u);
        _3042 = (_2983 * 0.300000011920928955078125) + vec2(uintBitsToFloat(((_2676 + (_2676 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    }
    else
    {
        _3042 = _2965;
    }
    gl_Position = renderer_MVPMat * _2839;
    vs_out_v0 = _939;
    vs_out_v1 = _947;
    vs_out_v2 = _2839.xyz;
    vs_v3 = _1000;
    vs_v4 = normalize(_1000 - _1020);
    vs_v5 = length(camera_offset_ws) / length(_1020);
    vs_v6 = vec3(0.0);
    vs_out_v7 = _1204 ? (-100.0) : _2951;
    vs_out_v8 = -100000.0;
    vs_out_v9 = _3042;
    vs_out_v10 = _3035;
    vs_out_v11 = vec4(_848, 1.0).xz;
    vs_out_v12 = _2959;
    vs_out_v13 = es_h0;
    vec3 _1302 = _1033[0];
    vec3 _1306 = _1033[1];
    vec3 _1310 = _1033[2];
    vs_v14 = vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3[](vec3(_1302.x, _1306.x, _1310.x), vec3(_1302.y, _1306.y, _1310.y), vec3(_1302.z, _1306.z, _1310.z)));
}


void vs_main(){vs_read_uniform_MaterialData_natural();vs_read_uniform_ViewConstants_natural();vs_read_uniform_FrameConstants_natural();vs_original_main();}

      BuildingVaryings vert() {
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
    bool _138 = (gs_vin.v12 & 8) != 0;
    bool _141 = (gs_vin.v12 & 16) != 0;
    bool _147 = (gs_vin.v12 & 2048) != 0;
    bool _155 = (gs_vin.v12 & 256) != 0;
    bool _1816;
    if (!_138)
    {
        _1816 = gs_vin.v7 > (-2.5);
    }
    else
    {
        _1816 = false;
    }
    bool _1817;
    if (_1816)
    {
        _1817 = gs_vin.v2.y < gs_vin.v7;
    }
    else
    {
        _1817 = false;
    }
    if (_1817)
    {
        discard;
    }
    else
    {
        bool _1818;
        if (_138)
        {
            _1818 = gs_vin.v2.y > gs_vin.v7;
        }
        else
        {
            _1818 = false;
        }
        if (_1818)
        {
            discard;
        }
    }
    uint color_id = uint(gs_vin.v10);
    vec3 _1860;
    if ((gs_vin.v12 & 2) != 0)
    {
        _1860 = texture(roof_colors_tex, vec3((vec2(uvec2(gs_vin.v0)) * 0.20000000298023223876953125) + (gs_vin.v2.xz * 0.20000000298023223876953125), float(color_id))).xyz * 0.699999988079071044921875;
    }
    else
    {
        vec2 _1822;
        if (_155)
        {
            _1822 = gs_vin.v9 + vec2(0.20999999344348907470703125);
        }
        else
        {
            _1822 = gs_vin.v9;
        }
        bool _1819;
        if (color_id == 1u)
        {
            _1819 = true;
        }
        else
        {
            _1819 = color_id == 0u;
        }
        vec3 _1845;
        if (_1819)
        {
            _1845 = pow(fs_color_library_data.wall_bricks.xyz, vec3(1.2999999523162841796875));
        }
        else
        {
            _1845 = pow(fs_color_library_data.wall_moss.xyz, vec3(1.0)) * 0.800000011920928955078125;
        }
        int _280 = int(color_id);
        bool _1823;
        if (_280 == 0)
        {
            _1823 = true;
        }
        else
        {
            _1823 = _280 == 4;
        }
        bool _1824;
        if (_1823)
        {
            _1824 = true;
        }
        else
        {
            _1824 = _280 == 10;
        }
        bool _1825;
        if (_1824)
        {
            _1825 = true;
        }
        else
        {
            _1825 = _280 == 12;
        }
        vec3 _1831;
        if (_1825)
        {
            _1831 = texture(wall_color_data_brick_colors, vec3(_1822 + vec2(0.85000002384185791015625), 0.0)).xyz;
        }
        else
        {
            bool _1826;
            if (_280 == 1)
            {
                _1826 = true;
            }
            else
            {
                _1826 = _280 == 5;
            }
            vec3 _1832;
            if (_1826)
            {
                _1832 = pow(texture(wall_color_data_brick_colors, vec3(_1822 + vec2(0.449999988079071044921875), 1.0)).xyz, vec3(1.10000002384185791015625));
            }
            else
            {
                bool _1827;
                if (_280 == 2)
                {
                    _1827 = true;
                }
                else
                {
                    _1827 = _280 == 7;
                }
                vec3 _1833;
                if (_1827)
                {
                    _1833 = texture(wall_color_data_brick_colors, vec3(_1822, 2.0)).xyz;
                }
                else
                {
                    bool _1828;
                    if (_280 == 3)
                    {
                        _1828 = true;
                    }
                    else
                    {
                        _1828 = _280 == 6;
                    }
                    bool _1829;
                    if (_1828)
                    {
                        _1829 = true;
                    }
                    else
                    {
                        _1829 = _280 == 8;
                    }
                    bool _1830;
                    if (_1829)
                    {
                        _1830 = true;
                    }
                    else
                    {
                        _1830 = _280 == 9;
                    }
                    vec3 _1834;
                    if (_1830)
                    {
                        _1834 = texture(wall_color_data_brick_colors, vec3(_1822, 3.0)).xyz;
                    }
                    else
                    {
                        vec3 _1835;
                        if (_280 == 11)
                        {
                            _1835 = texture(wall_color_data_brick_colors, vec3(_1822, 4.0)).xyz;
                        }
                        else
                        {
                            _1835 = vec3(0.0);
                        }
                        _1834 = _1835;
                    }
                    _1833 = _1834;
                }
                _1832 = _1833;
            }
            _1831 = _1832;
        }
        bool _499 = color_id == 7u;
        bool _1836;
        if (_499)
        {
            _1836 = true;
        }
        else
        {
            _1836 = color_id == 2u;
        }
        bool _1837;
        if (_1836)
        {
            _1837 = true;
        }
        else
        {
            _1837 = color_id == 11u;
        }
        vec3 _1859;
        if ((gs_vin.v12 & 512) != 0)
        {
            uint _523 = gs_vin.v0 ^ 8902390u;
            uint _1252 = _523 + (_523 << 10u);
            uint _1254 = _1252 ^ (_1252 >> 6u);
            uint _1256 = _1254 + (_1254 << 3u);
            uint _1258 = _1256 ^ (_1256 >> 11u);
            _1859 = mix(_1831, mix(_1845, _1831, bvec3(_1837)), vec3(mix(0.0, 0.5, smoothstep(0.20000000298023223876953125, 0.800000011920928955078125, uintBitsToFloat(((_1258 + (_1258 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1859 = _1831;
        }
        vec3 _1861;
        if (_155)
        {
            bool _1855;
            if (_499)
            {
                _1855 = true;
            }
            else
            {
                _1855 = color_id == 2u;
            }
            uint _587 = gs_vin.v0 ^ 239085u;
            uint _1274 = _587 + (_587 << 10u);
            uint _1276 = _1274 ^ (_1274 >> 6u);
            uint _1278 = _1276 + (_1276 << 3u);
            uint _1280 = _1278 ^ (_1278 >> 11u);
            _1861 = mix(_1859, fs_color_library_data.wall_1.xyz, vec3(mix(0.0, _1855 ? 0.20000000298023223876953125 : 0.4000000059604644775390625, smoothstep(0.0, 0.800000011920928955078125, uintBitsToFloat(((_1280 + (_1280 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1861 = _1859;
        }
        _1860 = _1861;
    }
    vec3 _666 = normalize(gs_vin.v1);
    vec3 _1920;
    bool _1980;
    if (!((gs_vin.v12 & 64) != 0))
    {
        uint _1863;
        if ((gs_vin.v12 & 4096) != 0)
        {
            _1863 = fs_frame_constants.wall_highlight_mode;
        }
        else
        {
            _1863 = 0u;
        }
        vec3 _1923;
        bool _1983;
        if (_1863 == 1u)
        {
            _1983 = true;
            _1923 = mix(_1860, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        }
        else
        {
            bool _1325 = _1863 == 2u;
            vec3 _1924;
            if (_1325)
            {
                _1924 = mix(_1860, vec3(0.5), vec3(0.100000001490116119384765625));
            }
            else
            {
                _1924 = _1860;
            }
            _1983 = _1325 ? true : false;
            _1923 = _1924;
        }
        bool _1866;
        if (fs_frame_constants.highlight_bricks_to_delete == 1u)
        {
            _1866 = distance(fs_frame_constants.brush_position.xz, gs_vin.v11) < (1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier);
        }
        else
        {
            _1866 = false;
        }
        vec3 _1921;
        if (_1866)
        {
            _1921 = mix(_1860, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
        }
        else
        {
            _1921 = _1923;
        }
        _1980 = _1866 ? true : _1983;
        _1920 = _1921;
    }
    else
    {
        _1980 = false;
        _1920 = _1860;
    }
    vec3 _1919;
    if (_147)
    {
        _1919 = mix(_1860, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
    }
    else
    {
        _1919 = _1920;
    }
    vec3 _2026;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        vec2 _813 = gs_vin.v2.xz * 0.4000000059604644775390625;
        vec2 _1390 = floor(_813 + vec2(dot(_813, vec2(0.3660254180431365966796875))));
        vec2 _1394 = (_813 - _1390) + vec2(dot(_1390, vec2(0.211324870586395263671875)));
        float _1395 = _1394.x;
        float _1396 = _1394.y;
        vec2 _2115 = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), bvec2(_1395 > _1396));
        vec4 _1402 = _1394.xyxy + vec4(0.211324870586395263671875, 0.211324870586395263671875, -0.57735025882720947265625, -0.57735025882720947265625);
        vec2 _1405 = _1402.xy - _2115;
        vec4 _1801 = _1402;
        _1801.x = _1405.x;
        _1801.y = _1405.y;
        vec2 _1410 = _1390 - vec2(289.0) * trunc(_1390 / vec2(289.0));
        vec3 _1416 = vec3(_1410.y) + vec3(0.0, _2115.y, 1.0);
        vec3 _1489 = ((_1416 * 34.0) + vec3(1.0)) * _1416;
        vec3 _1424 = ((_1489 - vec3(289.0) * trunc(_1489 / vec3(289.0))) + vec3(_1410.x)) + vec3(0.0, _2115.x, 1.0);
        vec3 _1496 = ((_1424 * 34.0) + vec3(1.0)) * _1424;
        vec3 _1440 = max(vec3(0.5) - vec3(dot(_1394, _1394), dot(_1801.xy, _1801.xy), dot(_1801.zw, _1801.zw)), vec3(0.0));
        vec3 _1441 = _1440 * _1440;
        vec3 _1445 = fract((_1496 - vec3(289.0) * trunc(_1496 / vec3(289.0))) * vec3(0.024390242993831634521484375)) * 2.0;
        vec3 _1447 = _1445 - vec3(1.0);
        vec3 _1450 = abs(_1447) - vec3(0.5);
        vec3 _1454 = _1447 - floor(_1445 + vec3(-0.5));
        _2026 = mix(_1919, vec3(0.699999988079071044921875), vec3(smoothstep(0.0, 1.0, smoothstep(-0.100000001490116119384765625, 0.0, gs_vin.v2.y) * clamp(_666.y, 0.0, 1.0)) * clamp(clamp((130.0 * dot((_1441 * _1441) * (vec3(1.792842864990234375) - (((_1454 * _1454) + (_1450 * _1450)) * 0.8537347316741943359375)), vec3((_1454.x * _1395) + (_1450.x * _1396), (_1454.yz * _1801.xz) + (_1450.yz * _1801.yw)))) + 0.75, 0.0, 1.0), _141 ? 0.0 : 0.4000000059604644775390625, _141 ? 0.100000001490116119384765625 : 1.0)));
    }
    else
    {
        _2026 = _1919;
    }
    vec3 _1509 = (_666 * 0.5) + vec3(0.5);
    vec3 _1617 = sqrt(clamp(_2026, vec3(0.0), vec3(1.0)));
    uint _1632 = (uint((clamp(_1617.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1617.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1617.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2102 = uvec2(((uint((clamp(_1509.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1509.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1509.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u, _1632);
    _2102.y = _1632 | (((7u | (uint(_147 ? true : _1980) << 3u)) | 128u) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _2102;
}






uint fs_domainWord(highp usampler2D t,int p){ivec2 s=textureSize(t,0);return texelFetch(t,ivec2((p/4)%s.x,(p/4)/s.x),0)[p%4];}
float fs_domainFloat(int p){return uintBitsToFloat(fs_domainWord(domain_holes,p));}
struct fs_DormerHole_natural
{
    vec3 position;
    int wall_slot_id;
    vec3 size;
    int pad0;
    vec2 normal;
    float k;
    float a;
};
bool fs_domainPredicate(fs_DormerHole_natural h,vec3 world){
                    vec3 _1360 = vec3(h.normal.x, 0.0, h.normal.y);
                    mat3 _1370 = transpose(mat3(cross(_1360, vec3(0.0, 1.0, 0.0)), vec3(0.0, 1.0, 0.0), _1360));
                    vec3 _1448 = vec3(1.0, 0.0, 0.0) * _1370;
                    vec3 _1449 = vec3(0.0, 1.0, 0.0) * _1370;
                    vec3 _1450 = vec3(0.0, 0.0, 1.0) * _1370;
                    vec3 _1453 = cross(_1448, _1449);
                    vec3 _1456 = vec3(1.0 / dot(_1450, _1453));
                    vec3 _1374 = (mat3(cross(_1449, _1450) * _1456, cross(_1450, _1448) * _1456, _1453 * _1456) * (world - h.position)) / h.size;
                    float _1375 = _1374.y;
                    float _1378 = clamp((_1375 * h.k) + h.a, 0.0, 1.0);
                    bool _1975;
                    if (abs(_1374.x) < mix(0.5, 0.0, (_1378 * _1378) * _1378))
                    {
                        bool _1976;
                        if (_1375 < ((h.k == 1.0) ? 0.5 : 0.699999988079071044921875))
                        {
                            _1976 = _1375 > (-0.5);
                        }
                        else
                        {
                            _1976 = false;
                        }
                        _1975 = _1976;
                    }
                    else
                    {
                        _1975 = false;
                    }
                    bool _1977;
                    if (_1975)
                    {
                        _1977 = abs(_1374.z) < 0.5;
                    }
                    else
                    {
                        _1977 = false;
                    }
return _1977;}
bool fs_domainContains(uint instance,vec3 world){
 int base=int(instance)*16;
 if(fs_domainWord(domain_roof,base+15)==0u)return false;
 uint slot=fs_domainWord(domain_roof,base+10);
 ivec2 cell=ivec2(floor(((world.xz - renderer_DormerGrid.xy) * renderer_DormerGrid.zw)));
 int bin=cell.x+15*cell.y;if(bin<0||bin>=225)return false;
 uint count=min(128u,fs_domainWord(domain_counts,bin));
 for(uint i=0u;i<count;i++){int p=(bin*50+int(i))*12;
 fs_DormerHole_natural h=fs_DormerHole_natural(vec3(fs_domainFloat(p),fs_domainFloat(p+1),fs_domainFloat(p+2)),int(fs_domainWord(domain_holes,p+3)),vec3(fs_domainFloat(p+4),fs_domainFloat(p+5),fs_domainFloat(p+6)),int(fs_domainWord(domain_holes,p+7)),vec2(fs_domainFloat(p+8),fs_domainFloat(p+9)),fs_domainFloat(p+10),fs_domainFloat(p+11));
 if(uint(h.wall_slot_id)==slot&&fs_domainPredicate(h,world))return true;}
 return false;
}

void fs_main(){fs_read_uniform_ColorLibraryData_natural();fs_read_uniform_FrameConstants_natural();if(fs_domainContains(gs_vin.v13,gs_vin.v2))discard;fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
