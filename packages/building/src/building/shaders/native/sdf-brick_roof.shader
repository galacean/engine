Shader "BuildingUnit/SDF/brick_roof/bd8285376924b4af" {
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
      sampler2DArray material_data_brick_sdf;
      samplerCube material_data_brick_sdf_normal;
      sampler2DArray roof_colors_tex;
      sampler2DArray wall_color_data_brick_colors;
      mat4 renderer_MVPMat;
      usampler2D domain_roof;
      usampler2D domain_counts;
      usampler2D domain_holes;

      struct BuildingVaryings {
        flat uint v0;
        vec3 v2;
        vec3 v3;
        vec3 v4;
        float v5;
        float v7;
        flat float v8;
        vec2 v9;
        flat int v10;
        flat vec2 v11;
        flat int v12;
        flat uint v13;
        flat vec3 v14_col0;
        flat vec3 v14_col1;
        flat vec3 v14_col2;
      };
      BuildingVaryings gs_vin;

      uint vs_out_v0 = 0u;
      vec3 vs_out_v2 = vec3(0.0);
      vec3 vs_out_v3 = vec3(0.0);
      vec3 vs_out_v4 = vec3(0.0);
      float vs_out_v5 = 0.0;
      float vs_out_v7 = 0.0;
      float vs_out_v8 = 0.0;
      vec2 vs_out_v9 = vec2(0.0);
      int vs_out_v10 = 0;
      vec2 vs_out_v11 = vec2(0.0);
      int vs_out_v12 = 0;
      uint vs_out_v13 = 0u;
      mat3 vs_v14 = mat3(0.0);
      mat3 fs_v14 = mat3(0.0);
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
vec3 vs_v1 = vec3(0.0);
vec3 vs_v6 = vec3(0.0);








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
uvec3 vs_tgMixU(uvec3 a,uvec3 b,bvec3 t){return uvec3(t.x?b.x:a.x,t.y?b.y:a.y,t.z?b.z:a.z);}
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
    bool _88 = vs_material_data.use_highlight_draw_list != 0u;
    uint _123 = uint(gl_InstanceID);
uint es_h0=vs_read_material_data_instance_list(int(_123));
vs_InstancedWallData_natural es_h1=vs_read_material_data_instanced_wall_data_1(int(es_h0));
    vec2 _1322 = unpackHalf2x16(es_h1.sin_deform_y_packed.data[0]);
    vec2 _1324 = unpackHalf2x16(es_h1.sin_deform_y_packed.data[1]);
    uint _1329 = uint(int(es_h1.seed & 3u)) & 3u;
    int _1332 = -int(_1329 & 1u);
    int _1337 = 1 - int((_1329 >> uint(1)) << uint(1));
    float _1339 = float((~_1332) & _1337);
    float _1341 = float(_1332 & _1337);
    vec2 _1360 = unpackHalf2x16(es_h1.transform_matrix_packed.data[1]);
    mat3x4 _1436 = transpose(mat4x3(vec3(unpackHalf2x16(es_h1.transform_matrix_packed.data[0]), _1360.x), vec3(_1360.y, unpackHalf2x16(es_h1.transform_matrix_packed.data[2])), vec3(unpackHalf2x16(es_h1.transform_matrix_packed.data[3]), unpackHalf2x16(es_h1.transform_matrix_packed.data[4]).x), vec3(uintBitsToFloat(es_h1.transform_translation.data[0]), uintBitsToFloat(es_h1.transform_translation.data[1]), uintBitsToFloat(es_h1.transform_translation.data[2]))));
    mat3x4 _3048 = _1436;
    _3048[0][3] = _1436[0][3];
    mat3x4 _3050 = _3048;
    _3050[1][3] = _1436[1][3];
    mat3x4 _3052 = _3050;
    _3052[2][3] = _1436[2][3];
    uint _357 = uint(gl_VertexID - 0);
    uvec3 coord = uvec3((_357 & 4u) >> uint(2), (_357 & 2u) >> uint(1), _357 & 1u);
    vec4 _1441 = vs_current_view.view_to_world * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 _1445 = _1441.xyz / vec3(_1441.w);
    vec3 Vertex_Position = vec3(vs_tgMixU(uvec3(1u) - coord, coord, greaterThan(mat3(_3048[0].xyz, _3050[1].xyz, _3052[2].xyz) * (_1445 - (vec4(0.0, 0.0, 0.0, 1.0) * _3052)), vec3(0.0)))) - vec3(0.5);
    int _416 = int(es_h1.flags);
    mat3x4 _3061;
    if ((_416 & 32) != 0)
    {
        vec2 _1462 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[0]);
        vec3 _489 = vec3(_3048[0][2], _3050[1][2], _3052[2][2]) * mix(_1462.x, _1462.y, 0.5 - Vertex_Position.x);
        mat3x4 _3054 = _3052;
        _3054[0][2] = _489.x;
        _3054[1][2] = _489.y;
        _3054[2][2] = _489.z;
        _3061 = _3054;
    }
    else
    {
        _3061 = _3052;
    }
    int _2795;
    if (_88)
    {
        _2795 = _416 | 4096;
    }
    else
    {
        _2795 = _416;
    }
    vec3 _2797;
    if ((_2795 & 4) != 0)
    {
        uint _1485 = es_h1.seed + (es_h1.seed << 10u);
        uint _1487 = _1485 ^ (_1485 >> 6u);
        uint _1489 = _1487 + (_1487 << 3u);
        uint _1491 = _1489 ^ (_1489 >> 11u);
        float _3073 = ((uintBitsToFloat(((_1491 + (_1491 << 15u)) & 8388607u) | 1065353216u) - 1.0) > 0.89999997615814208984375) ? 1.0 : 1.10000002384185791015625;
        _2797 = mix(vec3(_3073, _3073, 1.0), vec3(1.0499999523162841796875), bvec3((_416 & 1) != 0));
    }
    else
    {
        _2797 = vec3(1.0);
    }
    mat3x4 _587 = mat4(vec4(_2797.x, 0.0, 0.0, 0.0), vec4(0.0, _2797.y, 0.0, 0.0), vec4(0.0, 0.0, _2797.z, 0.0), vec4(0.0, 0.0, 0.0, 1.0)) * _3061;
    vec4 _591 = vec4(vec4(Vertex_Position, 1.0) * _587, 1.0);
    vec3 _593 = _591.xyz;
    vec3 _1502 = _593 * 0.4000000059604644775390625;
    ivec3 _1528 = ivec3(floor(_1502));
    vec3 _1529 = fract(_1502);
    vec2 _1517 = vs_tgOpt_hash3v2(uvec3(_1528));
    vec2 _1518 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(1, 0, 0)));
    vec2 _1519 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(0, 1, 0)));
    vec2 _1520 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(1, 1, 0)));
    vec2 _1521 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(0, 0, 1)));
    vec2 _1522 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(1, 0, 1)));
    vec2 _1523 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(0, 1, 1)));
    vec2 _1524 = vs_tgOpt_hash3v2(uvec3(_1528 + ivec3(1)));
    vec3 _2440 = (_1529 * _1529) * (vec3(3.0) - (vec3(2.0) * _1529));
    float _1593 = _2440.x;
    float _1594 = 1.0 - _1593;
    float _1596 = _2440.y;
    float _1597 = 1.0 - _1596;
    float _1599 = _2440.z;
    float _1600 = 1.0 - _1599;
    vec2 _1507 = clamp((((((((((((_1517 * _1594) * _1597) * _1600) + (((_1518 * _1593) * _1597) * _1600)) + (((_1519 * _1594) * _1596) * _1600)) + (((_1520 * _1593) * _1596) * _1600)) + (((_1521 * _1594) * _1597) * _1599)) + (((_1522 * _1593) * _1597) * _1599)) + (((_1523 * _1594) * _1596) * _1599)) + (((_1524 * _1593) * _1596) * _1599)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 _879 = _593 + (vec3(_1507.x, 0.0, _1507.y) * 0.0599999986588954925537109375);
    vec4 _2787 = _591;
    _2787.x = _879.x;
    _2787.z = _879.z;
    vec3 _887 = vec4(0.0, 0.0, 0.0, 1.0) * _587;
    float _2445 = Vertex_Position.x - (-0.5);
    float _903 = _879.y + mix(mix(_1322.x, _1322.y, _2445), mix(_1324.x, _1324.y, _2445), Vertex_Position.y - (-0.5));
    _2787.y = _903;
    vec2 _2481 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[1]);
    mat3 _940 = mat3(_587[0].xyz, _587[1].xyz, _587[2].xyz);
    vec3 _2489 = vec3(1.0, 0.0, 0.0) * _940;
    vec3 _2490 = vec3(0.0, 1.0, 0.0) * _940;
    vec3 _2491 = vec3(0.0, 0.0, 1.0) * _940;
    vec3 _2494 = cross(_2489, _2490);
    vec3 _2497 = vec3(1.0 / dot(_2491, _2494));
    mat3 _963 = transpose(mat3(cross(_2490, _2491) * _2497, cross(_2491, _2489) * _2497, _2494 * _2497));
    vec2 wall_uv = vec2(mix(_2481.y, unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[2]).x, _2445), ((_416 & 1024) != 0) ? 0.0 : _903);
    uint _978 = es_h1.seed & 65535u;
    int _2896;
    if (es_h1.seed < 10u)
    {
        _2896 = _2795 | 512;
    }
    else
    {
        _2896 = _2795;
    }
    mat3 _1022 = mat3(vec4(_1339, 0.0, -_1341, 0.0).xyz, vec3(0.0, 1.0, 0.0), vec4(_1341, 0.0, _1339, 0.0).xyz);
    vec3 _1023 = _1022 * Vertex_Position;
    vec3 camera_offset_ws = _1445 - _887;
    vec3 _1029 = _1022 * (_963 * camera_offset_ws);
    mat3 _1042 = _1022 * _963;
    vec2 _2518 = unpackHalf2x16(es_h1.arch_and_wallspace_packed.data[0]);
    float _2897;
    if (_2445 < 0.5)
    {
        _2897 = mix(_2518.x, _2518.y, _2445 * 2.0);
    }
    else
    {
        _2897 = mix(_2518.y, _2481.x, (_2445 * 2.0) - 1.0);
    }
    bool _1066 = (es_h1.source_id & 2147483648u) != 0u;
    int _2905;
    int _2957;
    if (_1066)
    {
        bool _2900;
        if ((es_h1.source_id & 1073741824u) != 0u)
        {
            _2900 = ((es_h1.source_id >> 4u) & 65535u) == vs_frame_constants.highlighted_transient_stair_edge_id;
        }
        else
        {
            _2900 = false;
        }
        int _2908;
        if (_2900)
        {
            _2908 = _2896 | 2048;
        }
        else
        {
            _2908 = _2896;
        }
        _2957 = int(es_h1.source_id & 15u);
        _2905 = _2908;
    }
    else
    {
        int _2958;
        if ((_2896 & 8192) != 0)
        {
            _2958 = int(vs_read_stone_foundation_colors_ids_1(int(es_h1.source_id)));
        }
        else
        {
            uint _2899;
            if ((_2896 & 2) != 0)
            {
                _2899 = vs_read_roof_colors_ids_1(int(es_h1.source_id));
            }
            else
            {
                _2899 = vs_read_wall_color_data_wall_color_ids_1(int(es_h1.source_id));
            }
            _2958 = int(_2899);
        }
        _2957 = _2958;
        _2905 = _2896;
    }
    uint _2903;
    if (_1066)
    {
        _2903 = es_h1.source_id;
    }
    else
    {
        _2903 = vs_read_wall_identity_data_slot_wall_ids_1(int(es_h1.source_id));
    }
    uint _2529 = _2903 & 65535u;
    uint _2534 = _2529 ^ 7993234u;
    uint _2574 = _2534 + (_2534 << 10u);
    uint _2576 = _2574 ^ (_2574 >> 6u);
    uint _2578 = _2576 + (_2576 << 3u);
    uint _2580 = _2578 ^ (_2578 >> 11u);
    uint _2536 = _2529 ^ 3450234u;
    uint _2596 = _2536 + (_2536 << 10u);
    uint _2598 = _2596 ^ (_2596 >> 6u);
    uint _2600 = _2598 + (_2598 << 3u);
    uint _2602 = _2600 ^ (_2600 >> 11u);
    vec2 _2547 = (((wall_uv * 0.100000001490116119384765625) * 0.699999988079071044921875) + vec2(float(_2529) * 0.20000000298023223876953125)) + vec2(uintBitsToFloat(((_2580 + (_2580 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_2602 + (_2602 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    uint _2550 = _978 ^ 292478890u;
    uint _2618 = _2550 + (_2550 << 10u);
    uint _2620 = _2618 ^ (_2618 >> 6u);
    uint _2622 = _2620 + (_2620 << 3u);
    uint _2624 = _2622 ^ (_2622 >> 11u);
    float _2632 = uintBitsToFloat(((_2624 + (_2624 << 15u)) & 8388607u) | 1065353216u) - 1.0;
    vec2 _2910;
    if (_2632 > 0.89999997615814208984375)
    {
        _2910 = _2547 * 3.0;
    }
    else
    {
        _2910 = _2547 + vec2(0.61000001430511474609375 * _2632);
    }
    vec2 _2911;
    if (int((_2905 & 512) != 0) == 1)
    {
        _2911 = _2910 * 2.2000000476837158203125;
    }
    else
    {
        _2911 = _2910;
    }
    bool _1212 = (_2896 & 32) != 0;
    vec2 _2961;
    if (_1212)
    {
        _2961 = wall_uv * 0.699999988079071044921875;
    }
    else
    {
        _2961 = _2911;
    }
    gl_Position = renderer_MVPMat * _2787;
    vs_out_v0 = _978;
    vs_v1 = vec3(0.0);
    vs_out_v2 = _2787.xyz;
    vs_out_v3 = _1023;
    vs_out_v4 = normalize(_1023 - _1029);
    vs_out_v5 = length(camera_offset_ws) / length(_1029);
    vs_v6 = vec3(0.0);
    vs_out_v7 = _1212 ? (-100.0) : _2897;
    vs_out_v8 = -100000.0;
    vs_out_v9 = _2961;
    vs_out_v10 = _2957;
    vs_out_v11 = vec4(_887, 1.0).xz;
    vs_out_v12 = _2905;
    vs_out_v13 = es_h0;
    vs_v14 = mat3(vec3(_1042[0][0], _1042[1][0], _1042[2][0]), vec3(_1042[0][1], _1042[1][1], _1042[2][1]), vec3(_1042[0][2], _1042[1][2], _1042[2][2]));
}


void vs_main(){vs_read_uniform_MaterialData_natural();vs_read_uniform_ViewConstants_natural();vs_read_uniform_FrameConstants_natural();vs_original_main();}

      BuildingVaryings vert() {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v4 = vs_out_v4;
        _gs_vout.v5 = vs_out_v5;
        _gs_vout.v7 = vs_out_v7;
        _gs_vout.v8 = vs_out_v8;
        _gs_vout.v9 = vs_out_v9;
        _gs_vout.v10 = vs_out_v10;
        _gs_vout.v11 = vs_out_v11;
        _gs_vout.v12 = vs_out_v12;
        _gs_vout.v13 = vs_out_v13;
        _gs_vout.v14_col0 = vs_v14[0];
        _gs_vout.v14_col1 = vs_v14[1];
        _gs_vout.v14_col2 = vs_v14[2];
        return _gs_vout;
      }

      // --- Fragment Stage ---
struct fs__MatrixStorage_float3x3_ColMajornatural
{
    vec3 data[3];
};

struct fs__Array_natural_uint5
{
    uint data[5];
};
fs__Array_natural_uint5 fs_masonryMake_Array_natural_uint5(uint v[5]){fs__Array_natural_uint5 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];r.data[3]=v[3];r.data[4]=v[4];return r;}


struct fs__Array_natural_uint3
{
    uint data[3];
};
fs__Array_natural_uint3 fs_masonryMake_Array_natural_uint3(uint v[3]){fs__Array_natural_uint3 r;r.data[0]=v[0];r.data[1]=v[1];r.data[2]=v[2];return r;}


struct fs__Array_natural_uint2
{
    uint data[2];
};
fs__Array_natural_uint2 fs_masonryMake_Array_natural_uint2(uint v[2]){fs__Array_natural_uint2 r;r.data[0]=v[0];r.data[1]=v[1];return r;}


struct fs_InstancedWallData_natural
{
    fs__Array_natural_uint5 transform_matrix_packed;
    fs__Array_natural_uint3 transform_translation;
    fs__Array_natural_uint2 sin_deform_y_packed;
    fs__Array_natural_uint3 arch_and_wallspace_packed;
    uint seed;
    uint source_id;
    uint flags;
};
vec4 fs__2507 = vec4(0.0);

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

fs_InstancedWallData_natural fs_read_material_data_instanced_wall_data(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*4;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_1,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);return fs_InstancedWallData_natural(fs_masonryMake_Array_natural_uint5(uint[5](es_t0.x,es_t0.y,es_t0.z,es_t0.w,es_t1.x)),fs_masonryMake_Array_natural_uint3(uint[3](es_t1.y,es_t1.z,es_t1.w)),fs_masonryMake_Array_natural_uint2(uint[2](es_t2.x,es_t2.y)),fs_masonryMake_Array_natural_uint3(uint[3](es_t2.z,es_t2.w,es_t3.x)),es_t3.y,es_t3.z,es_t3.w);}
vec3 fs_masonrySdfHitLocal = vec3(0.0);
// The native cube has only levels 16/8/4. WebGL allocates a complete chain;
// clamp the explicit LOD to native levels instead of sampling synthetic tails.
// Different GPUs may round implicit LOD differently; analytic cube projection
// derivatives avoid a derivative discontinuity when a quad crosses cube faces.
vec4 fs_masonryBrickNormal(vec3 p,float bias){
 vec3 px=dFdx(p),py=dFdy(p),a=abs(p);
 vec2 q,qx,qy;float m,mx,my;
 if(a.x>=a.y&&a.x>=a.z){q=p.yz;qx=px.yz;qy=py.yz;m=a.x;mx=sign(p.x)*px.x;my=sign(p.x)*py.x;}
 else if(a.y>=a.z){q=p.xz;qx=px.xz;qy=py.xz;m=a.y;mx=sign(p.y)*px.y;my=sign(p.y)*py.y;}
 else{q=p.xy;qx=px.xy;qy=py.xy;m=a.z;mx=sign(p.z)*px.z;my=sign(p.z)*py.z;}
 m=max(m,0.000001);
 vec2 dx=(qx-q*(mx/m))*(0.5/m),dy=(qy-q*(my/m))*(0.5/m);
 float size=float(textureSize(material_data_brick_sdf_normal,0).x);
 float rho2=max(dot(dx,dx),dot(dy,dy))*size*size;
 float lod=clamp(0.5*log2(max(rho2,0.00000001))+bias,0.0,2.0);
 return textureLod(material_data_brick_sdf_normal,p,lod);
}
vec4 fs_masonrySdfSample(vec3 uv){
 ivec3 size=textureSize(material_data_brick_sdf,0);
 float z=clamp(uv.z*float(size.z)-0.5,0.0,float(size.z-1));
 float lo=floor(z),hi=min(lo+1.0,float(size.z-1));
 return (mix(textureLod(material_data_brick_sdf,vec3(uv.xy,lo),0.0),textureLod(material_data_brick_sdf,vec3(uv.xy,hi),0.0),z-lo)*255.0-128.0)/127.0;
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
    bool _156 = (gs_vin.v12 & 8) != 0;
    bool _159 = (gs_vin.v12 & 16) != 0;
    bool _165 = (gs_vin.v12 & 2048) != 0;
    vec4 _1434 = fs_current_view.view_to_world * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 sampled = fs_masonrySdfSample((gs_vin.v3 * 0.875) + vec3(0.5));
    float _241 = sampled.x;
    float step_dist = _241 * 0.2562499940395355224609375;
    vec3 march_pos = (gs_vin.v3 + vec3(0.5)) + (gs_vin.v4 * step_dist);
    vec4 sampled_1 = fs_masonrySdfSample(((march_pos - vec3(0.5)) * 0.875) + vec3(0.5));
    float _262 = sampled_1.x;
    float step_dist_1 = _262 * 0.19099999964237213134765625;
    vec3 march_pos_1 = march_pos + (gs_vin.v4 * step_dist_1);
    vec4 sampled_2 = fs_masonrySdfSample(((march_pos_1 - vec3(0.5)) * 0.875) + vec3(0.5));
    float _281 = sampled_2.x;
    float step_dist_2 = _281 * 0.16312499344348907470703125;
    vec3 march_pos_2 = (march_pos_1 + (gs_vin.v4 * step_dist_2)) - vec3(0.5);
    vec3 _292 = abs(march_pos_2);
    bool frag_is_bevel = max(_292.x, max(_292.y, _292.z)) < 0.4930000007152557373046875;
    vec4 sampled_3 = fs_masonryBrickNormal(march_pos_2, (-1.0) + fs_current_view.mip_bias);
    vec3 _317 = (sampled_3.xyz * 255.0 - 128.0) / 127.0;
    if (dot(_317, gs_vin.v4) > 0.0)
    {
        discard;
    }
    vec3 hit_ws = gs_vin.v2 + ((normalize(gs_vin.v2 - (_1434.xyz / vec3(_1434.w))) * ((step_dist + step_dist_1) + step_dist_2)) * gs_vin.v5);
    if (!(((false || ((_241 * 0.125) <= 0.014999999664723873138427734375)) || ((_262 * 0.125) <= 0.014999999664723873138427734375)) || ((_281 * 0.125) <= 0.014999999664723873138427734375)))
    {
        discard;
    }
    vec3 _358 = _317 * mat3(vec3(fs_v14[0][0], fs_v14[1][0], fs_v14[2][0]), vec3(fs_v14[0][1], fs_v14[1][1], fs_v14[2][1]), vec3(fs_v14[0][2], fs_v14[1][2], fs_v14[2][2]));
    fs_masonrySdfHitLocal = hit_ws;
    vec4 _1447 = renderer_MVPMat * vec4(hit_ws, 1.0);
    bool _2199;
    if (!_156)
    {
        _2199 = gs_vin.v7 > (-2.5);
    }
    else
    {
        _2199 = false;
    }
    bool _2200;
    if (_2199)
    {
        _2200 = gs_vin.v2.y < gs_vin.v7;
    }
    else
    {
        _2200 = false;
    }
    if (_2200)
    {
        discard;
    }
    else
    {
        bool _2201;
        if (_156)
        {
            _2201 = gs_vin.v2.y > gs_vin.v7;
        }
        else
        {
            _2201 = false;
        }
        if (_2201)
        {
            discard;
        }
    }
    uint color_id = uint(gs_vin.v10);
    vec3 _2247;
    if ((gs_vin.v12 & 2) != 0)
    {
        _2247 = texture(roof_colors_tex, vec3((vec2(uvec2(gs_vin.v0)) * 0.20000000298023223876953125) + (gs_vin.v2.xz * 0.20000000298023223876953125), float(color_id))).xyz * 0.699999988079071044921875;
    }
    else
    {
        vec2 _2205;
        if ((gs_vin.v12 & 32) != 0)
        {
            vec3 _475 = normalize(_358);
            vec2 _2203;
            if (_475.y > 0.89999997615814208984375)
            {
                _2203 = hit_ws.xz * 0.699999988079071044921875;
            }
            else
            {
                vec2 _2204;
                if (abs(_475.x) > 0.89999997615814208984375)
                {
                    _2204 = hit_ws.zy * 0.699999988079071044921875;
                }
                else
                {
                    _2204 = hit_ws.xy * 0.699999988079071044921875;
                }
                _2203 = _2204;
            }
            vec2 _2202;
            if (frag_is_bevel)
            {
                _2202 = vec2(unpackHalf2x16(fs_read_material_data_instanced_wall_data(int(gs_vin.v13)).arch_and_wallspace_packed.data[1]).y);
            }
            else
            {
                _2202 = _2203;
            }
            uint _1481 = fs_read_material_data_instanced_wall_data(int(gs_vin.v13)).seed + (fs_read_material_data_instanced_wall_data(int(gs_vin.v13)).seed << 10u);
            uint _1483 = _1481 ^ (_1481 >> 6u);
            uint _1485 = _1483 + (_1483 << 3u);
            uint _1487 = _1485 ^ (_1485 >> 11u);
            _2205 = (_2202 * 0.300000011920928955078125) + vec2(uintBitsToFloat(((_1487 + (_1487 << 15u)) & 8388607u) | 1065353216u) - 1.0);
        }
        else
        {
            _2205 = gs_vin.v9;
        }
        vec2 _2209;
        if (frag_is_bevel)
        {
            _2209 = _2205 + vec2(0.20999999344348907470703125);
        }
        else
        {
            _2209 = _2205;
        }
        bool _2206;
        if (color_id == 1u)
        {
            _2206 = true;
        }
        else
        {
            _2206 = color_id == 0u;
        }
        vec3 _2232;
        if (_2206)
        {
            _2232 = pow(fs_color_library_data.wall_bricks.xyz, vec3(1.2999999523162841796875));
        }
        else
        {
            _2232 = pow(fs_color_library_data.wall_moss.xyz, vec3(1.0)) * 0.800000011920928955078125;
        }
        int _629 = int(color_id);
        bool _2210;
        if (_629 == 0)
        {
            _2210 = true;
        }
        else
        {
            _2210 = _629 == 4;
        }
        bool _2211;
        if (_2210)
        {
            _2211 = true;
        }
        else
        {
            _2211 = _629 == 10;
        }
        bool _2212;
        if (_2211)
        {
            _2212 = true;
        }
        else
        {
            _2212 = _629 == 12;
        }
        vec3 _2218;
        if (_2212)
        {
            _2218 = texture(wall_color_data_brick_colors, vec3(_2209 + vec2(0.85000002384185791015625), 0.0)).xyz;
        }
        else
        {
            bool _2213;
            if (_629 == 1)
            {
                _2213 = true;
            }
            else
            {
                _2213 = _629 == 5;
            }
            vec3 _2219;
            if (_2213)
            {
                _2219 = pow(texture(wall_color_data_brick_colors, vec3(_2209 + vec2(0.449999988079071044921875), 1.0)).xyz, vec3(1.10000002384185791015625));
            }
            else
            {
                bool _2214;
                if (_629 == 2)
                {
                    _2214 = true;
                }
                else
                {
                    _2214 = _629 == 7;
                }
                vec3 _2220;
                if (_2214)
                {
                    _2220 = texture(wall_color_data_brick_colors, vec3(_2209, 2.0)).xyz;
                }
                else
                {
                    bool _2215;
                    if (_629 == 3)
                    {
                        _2215 = true;
                    }
                    else
                    {
                        _2215 = _629 == 6;
                    }
                    bool _2216;
                    if (_2215)
                    {
                        _2216 = true;
                    }
                    else
                    {
                        _2216 = _629 == 8;
                    }
                    bool _2217;
                    if (_2216)
                    {
                        _2217 = true;
                    }
                    else
                    {
                        _2217 = _629 == 9;
                    }
                    vec3 _2221;
                    if (_2217)
                    {
                        _2221 = texture(wall_color_data_brick_colors, vec3(_2209, 3.0)).xyz;
                    }
                    else
                    {
                        vec3 _2222;
                        if (_629 == 11)
                        {
                            _2222 = texture(wall_color_data_brick_colors, vec3(_2209, 4.0)).xyz;
                        }
                        else
                        {
                            _2222 = vec3(0.0);
                        }
                        _2221 = _2222;
                    }
                    _2220 = _2221;
                }
                _2219 = _2220;
            }
            _2218 = _2219;
        }
        bool _843 = color_id == 7u;
        bool _2223;
        if (_843)
        {
            _2223 = true;
        }
        else
        {
            _2223 = color_id == 2u;
        }
        bool _2224;
        if (_2223)
        {
            _2224 = true;
        }
        else
        {
            _2224 = color_id == 11u;
        }
        vec3 _2246;
        if ((gs_vin.v12 & 512) != 0)
        {
            uint _866 = gs_vin.v0 ^ 8902390u;
            uint _1625 = _866 + (_866 << 10u);
            uint _1627 = _1625 ^ (_1625 >> 6u);
            uint _1629 = _1627 + (_1627 << 3u);
            uint _1631 = _1629 ^ (_1629 >> 11u);
            _2246 = mix(_2218, mix(_2232, _2218, bvec3(_2224)), vec3(mix(0.0, 0.5, smoothstep(0.20000000298023223876953125, 0.800000011920928955078125, uintBitsToFloat(((_1631 + (_1631 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _2246 = _2218;
        }
        vec3 _2248;
        if (frag_is_bevel)
        {
            bool _2242;
            if (_843)
            {
                _2242 = true;
            }
            else
            {
                _2242 = color_id == 2u;
            }
            uint _893 = gs_vin.v0 ^ 239085u;
            uint _1647 = _893 + (_893 << 10u);
            uint _1649 = _1647 ^ (_1647 >> 6u);
            uint _1651 = _1649 + (_1649 << 3u);
            uint _1653 = _1651 ^ (_1651 >> 11u);
            _2248 = mix(_2246, fs_color_library_data.wall_1.xyz, vec3(mix(0.0, _2242 ? 0.20000000298023223876953125 : 0.4000000059604644775390625, smoothstep(0.0, 0.800000011920928955078125, uintBitsToFloat(((_1653 + (_1653 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _2248 = _2246;
        }
        _2247 = _2248;
    }
    vec3 _972 = normalize(_358);
    vec3 _2313;
    bool _2373;
    if (!((gs_vin.v12 & 64) != 0))
    {
        uint _2250;
        if ((gs_vin.v12 & 4096) != 0)
        {
            _2250 = fs_frame_constants.wall_highlight_mode;
        }
        else
        {
            _2250 = 0u;
        }
        vec3 _2316;
        bool _2376;
        if (_2250 == 1u)
        {
            _2376 = true;
            _2316 = mix(_2247, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        }
        else
        {
            bool _1698 = _2250 == 2u;
            vec3 _2317;
            if (_1698)
            {
                _2317 = mix(_2247, vec3(0.5), vec3(0.100000001490116119384765625));
            }
            else
            {
                _2317 = _2247;
            }
            _2376 = _1698 ? true : false;
            _2316 = _2317;
        }
        bool _2253;
        if (fs_frame_constants.highlight_bricks_to_delete == 1u)
        {
            _2253 = distance(fs_frame_constants.brush_position.xz, gs_vin.v11) < (1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier);
        }
        else
        {
            _2253 = false;
        }
        vec3 _2314;
        if (_2253)
        {
            _2314 = mix(_2247, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
        }
        else
        {
            _2314 = _2316;
        }
        _2373 = _2253 ? true : _2376;
        _2313 = _2314;
    }
    else
    {
        _2373 = false;
        _2313 = _2247;
    }
    vec3 _2312;
    if (_165)
    {
        _2312 = mix(_2247, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
    }
    else
    {
        _2312 = _2313;
    }
    vec3 _2419;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        vec2 _1114 = gs_vin.v2.xz * 0.4000000059604644775390625;
        vec2 _1763 = floor(_1114 + vec2(dot(_1114, vec2(0.3660254180431365966796875))));
        vec2 _1767 = (_1114 - _1763) + vec2(dot(_1763, vec2(0.211324870586395263671875)));
        float _1768 = _1767.x;
        float _1769 = _1767.y;
        vec2 _2519 = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), bvec2(_1768 > _1769));
        vec4 _1775 = _1767.xyxy + vec4(0.211324870586395263671875, 0.211324870586395263671875, -0.57735025882720947265625, -0.57735025882720947265625);
        vec2 _1778 = _1775.xy - _2519;
        vec4 _2184 = _1775;
        _2184.x = _1778.x;
        _2184.y = _1778.y;
        vec2 _1783 = _1763 - vec2(289.0) * trunc(_1763 / vec2(289.0));
        vec3 _1789 = vec3(_1783.y) + vec3(0.0, _2519.y, 1.0);
        vec3 _1862 = ((_1789 * 34.0) + vec3(1.0)) * _1789;
        vec3 _1797 = ((_1862 - vec3(289.0) * trunc(_1862 / vec3(289.0))) + vec3(_1783.x)) + vec3(0.0, _2519.x, 1.0);
        vec3 _1869 = ((_1797 * 34.0) + vec3(1.0)) * _1797;
        vec3 _1813 = max(vec3(0.5) - vec3(dot(_1767, _1767), dot(_2184.xy, _2184.xy), dot(_2184.zw, _2184.zw)), vec3(0.0));
        vec3 _1814 = _1813 * _1813;
        vec3 _1818 = fract((_1869 - vec3(289.0) * trunc(_1869 / vec3(289.0))) * vec3(0.024390242993831634521484375)) * 2.0;
        vec3 _1820 = _1818 - vec3(1.0);
        vec3 _1823 = abs(_1820) - vec3(0.5);
        vec3 _1827 = _1820 - floor(_1818 + vec3(-0.5));
        _2419 = mix(_2312, vec3(0.699999988079071044921875), vec3(smoothstep(0.0, 1.0, smoothstep(-0.100000001490116119384765625, 0.0, gs_vin.v2.y) * clamp(_972.y, 0.0, 1.0)) * clamp(clamp((130.0 * dot((_1814 * _1814) * (vec3(1.792842864990234375) - (((_1827 * _1827) + (_1823 * _1823)) * 0.8537347316741943359375)), vec3((_1827.x * _1768) + (_1823.x * _1769), (_1827.yz * _2184.xz) + (_1823.yz * _2184.yw)))) + 0.75, 0.0, 1.0), _159 ? 0.0 : 0.4000000059604644775390625, _159 ? 0.100000001490116119384765625 : 1.0)));
    }
    else
    {
        _2419 = _2312;
    }
    vec3 _1882 = (_972 * 0.5) + vec3(0.5);
    vec3 _1990 = sqrt(clamp(_2419, vec3(0.0), vec3(1.0)));
    uint _2005 = (uint((clamp(_1990.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1990.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1990.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2505 = uvec2(((uint((clamp(_1882.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1882.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1882.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u, _2005);
    _2505.y = _2005 | (((7u | (uint(_165 ? true : _2373) << 3u)) | 128u) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _2505;
    gl_FragDepth = clamp(max(_1447.z / _1447.w * 0.5 + 0.5, gl_FragCoord.z), 0.0, 1.0);
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

void fs_main(){fs_read_uniform_ViewConstants_natural();fs_read_uniform_ColorLibraryData_natural();fs_read_uniform_FrameConstants_natural();fs_original_main();if(fs_domainContains(gs_vin.v13,fs_masonrySdfHitLocal))discard;uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_v14[0] = gs_vin.v14_col0;
        fs_v14[1] = gs_vin.v14_col1;
        fs_v14[2] = gs_vin.v14_col2;
        fs_main();
      }
    }
  }
}
