Shader "BuildingUnit/plaster/97542717b962bc06" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D uniform_ViewConstants_natural;
      usampler2D storage_8_0;
      usampler2D storage_0_1;
      usampler2D plaster_vertices;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_7_0;
      sampler2DArray wall_color_data_plaster_colors;
      sampler2D material_data_mortar;
      sampler2D material_data_normal_map;
      mat4 renderer_MVPMat;

      struct BuildingVaryings {
        flat uint v0;
        vec3 v1;
        vec3 v2;
        vec2 v3;
        vec3 v4;
        vec3 v5;
        float v6;
        float v7;
        float v8;
        vec3 v9;
        vec3 v10;
        vec3 v11;
      };
      BuildingVaryings gs_vin;

      uint vs_out_v0 = 0u;
      vec3 vs_out_v1 = vec3(0.0);
      vec3 vs_out_v2 = vec3(0.0);
      vec2 vs_out_v3 = vec2(0.0);
      vec3 vs_out_v4 = vec3(0.0);
      vec3 vs_out_v5 = vec3(0.0);
      float vs_out_v6 = 0.0;
      float vs_out_v7 = 0.0;
      float vs_out_v8 = 0.0;
      vec3 vs_out_v9 = vec3(0.0);
      vec3 vs_out_v10 = vec3(0.0);
      vec3 vs_out_v11 = vec3(0.0);
      // --- Vertex Stage ---
struct vs_PlasterInstanceData_natural
{
    vec4 bounding_sphere;
    uint wall_slot_id;
    float wall_length;
    uint blend_uv_seam;
    uint quad_count;
    uvec2 verts_gpu_address;
    int row_stride;
    float peel_strength;
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




uvec4 vs_plasterVertex(uint p){ivec2 s=textureSize(plaster_vertices,0);return texelFetch(plaster_vertices,ivec2(int(p)%s.x,int(p)/s.x),0);}
vs__MatrixStorage_float3x3_ColMajornatural vs_entryPointParam_vs_main_frag_tangent_to_world = vs__MatrixStorage_float3x3_ColMajornatural(vec3[3](vec3(0.0), vec3(0.0), vec3(0.0)));



ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_8_0,0);return texelFetch(storage_8_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_PlasterInstanceData_natural vs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*3;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);return vs_PlasterInstanceData_natural(vec4(uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w)),es_t1.x,uintBitsToFloat(es_t1.y),es_t1.z,es_t1.w,uvec2(es_t2.x,es_t2.y),int(es_t2.z),uintBitsToFloat(es_t2.w));}
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

void vs_original_main(){
    
    for (int _gs_once_0 = 0; _gs_once_0 < 1; _gs_once_0++) {
        uint _27 = uint(int(gl_InstanceID));
        uint _95 = uint(int(gl_VertexID) - 0);
        uint grid_x = _95 & 65535u;
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_27));
vs_PlasterInstanceData_natural es_h1=vs_read_material_data_nani_instance_data(int(es_h0));
        if (grid_x > es_h1.quad_count)
        {
            gl_Position = vec4(uintBitsToFloat(0x7fbfffffu /* nan */));
            vs_out_v0 = 0u;
            vs_out_v1 = vec3(0.0);
            vs_out_v2 = vec3(0.0);
            vs_out_v3 = vec2(0.0);
            vs_out_v4 = vec3(0.0);
            vs_out_v5 = vec3(0.0);
            vs_out_v6 = 0.0;
            vs_out_v7 = 0.0;
            vs_out_v8 = 0.0;
            vs_entryPointParam_vs_main_frag_tangent_to_world = vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3[3](vec3(0.0), vec3(0.0), vec3(0.0)));
            break;
        }
        int _227 = 48 * (int(grid_x) + (int(_95 >> 16u) * es_h1.row_stride));
        uint address = es_h1.verts_gpu_address.x + uint(_227 / 16);
        uvec4 vdata0 = vs_plasterVertex(address);
        uvec4 vdata1 = vs_plasterVertex(address + 1u);
        uvec4 _338 = vs_plasterVertex(address + 2u);
        vec3 _353 = uintBitsToFloat(vdata1.xyz);
        vec4 _357 = vec4(uintBitsToFloat(vdata0.xyz), 1.0);
        vec4 pos_ws = _357;
        vec3 _360 = _357.xyz;
        vec3 _861 = _360 * 0.4000000059604644775390625;
        ivec3 _887 = ivec3(floor(_861));
        vec3 _888 = fract(_861);
        vec2 _876 = vs_tgOpt_hash3v2(uvec3(_887));
        vec2 _877 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(1, 0, 0)));
        vec2 _878 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(0, 1, 0)));
        vec2 _879 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(1, 1, 0)));
        vec2 _880 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(0, 0, 1)));
        vec2 _881 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(1, 0, 1)));
        vec2 _882 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(0, 1, 1)));
        vec2 _883 = vs_tgOpt_hash3v2(uvec3(_887 + ivec3(1)));
        vec3 _1799 = (_888 * _888) * (vec3(3.0) - (vec3(2.0) * _888));
        float _952 = _1799.x;
        float _953 = 1.0 - _952;
        float _955 = _1799.y;
        float _956 = 1.0 - _955;
        float _958 = _1799.z;
        float _959 = 1.0 - _958;
        vec2 _866 = clamp((((((((((((_876 * _953) * _956) * _959) + (((_877 * _952) * _956) * _959)) + (((_878 * _953) * _955) * _959)) + (((_879 * _952) * _955) * _959)) + (((_880 * _953) * _956) * _958)) + (((_881 * _952) * _956) * _958)) + (((_882 * _953) * _955) * _958)) + (((_883 * _952) * _955) * _958)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
        vec3 _680 = _360 + (vec3(_866.x, 0.0, _866.y) * 0.0599999986588954925537109375);
        pos_ws.x = _680.x;
        pos_ws.y = _680.y;
        pos_ws.z = _680.z;
        vec3 _709 = cross(_353, vec3(0.0, 1.0, 0.0));
        mat3 _715 = transpose(mat3(normalize(_709), normalize(vec3(0.0, 1.0, 0.0)), normalize(_353)));
        gl_Position = renderer_MVPMat * pos_ws;
        vs_out_v0 = es_h0;
        vs_out_v1 = _353;
        vs_out_v2 = pos_ws.xyz;
        vs_out_v3 = uintBitsToFloat(_338.xy);
        vs_out_v4 = _709;
        vs_out_v5 = vec3(0.0, 1.0, 0.0);
        vs_out_v6 = uintBitsToFloat(vdata0.w);
        vs_out_v7 = uintBitsToFloat(vdata1.w) + (1.0 - smoothstep(0.0, 1.0, pos_ws.y));
        vs_out_v8 = es_h1.peel_strength;
        vec3 _756 = _715[0];
        vec3 _760 = _715[1];
        vec3 _764 = _715[2];
        vec3 _771[3] = vec3[3](vec3(_756.x, _760.x, _764.x), vec3(_756.y, _760.y, _764.y), vec3(_756.z, _760.z, _764.z));
        vs_entryPointParam_vs_main_frag_tangent_to_world = vs_masonryMake_MatrixStorage_float3x3_ColMajornatural(vec3[3](_771[0], _771[1], _771[2]));
        break;
    }
vs_out_v9=vs_entryPointParam_vs_main_frag_tangent_to_world.data[0];vs_out_v10=vs_entryPointParam_vs_main_frag_tangent_to_world.data[1];vs_out_v11=vs_entryPointParam_vs_main_frag_tangent_to_world.data[2];}

void vs_main(){vs_original_main();}

      BuildingVaryings vert() {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v1 = vs_out_v1;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v4 = vs_out_v4;
        _gs_vout.v5 = vs_out_v5;
        _gs_vout.v6 = vs_out_v6;
        _gs_vout.v7 = vs_out_v7;
        _gs_vout.v8 = vs_out_v8;
        _gs_vout.v9 = vs_out_v9;
        _gs_vout.v10 = vs_out_v10;
        _gs_vout.v11 = vs_out_v11;
        return _gs_vout;
      }

      // --- Fragment Stage ---
struct fs_PlasterInstanceData_natural
{
    vec4 bounding_sphere;
    uint wall_slot_id;
    float wall_length;
    uint blend_uv_seam;
    uint quad_count;
    uvec2 verts_gpu_address;
    int row_stride;
    float peel_strength;
};

struct fs__MatrixStorage_float3x3_ColMajornatural
{
    vec3 data[3];
};
float fs__5782 = 0.0;




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
fs__MatrixStorage_float3x3_ColMajornatural fs_vs_out_frag_tangent_to_world = fs__MatrixStorage_float3x3_ColMajornatural(vec3[3](vec3(0.0), vec3(0.0), vec3(0.0)));
uvec2 fs_entryPointParam_ps_main_gbuffer = uvec2(0u);

ivec2 fs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 fs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 fs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}
float fs_tgDdy(float x){return -dFdy(x);}
vec2 fs_tgDdy(vec2 x){return -dFdy(x);}
vec3 fs_tgDdy(vec3 x){return -dFdy(x);}
vec4 fs_tgDdy(vec4 x){return -dFdy(x);}

fs_PlasterInstanceData_natural fs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_1,0);int es_b=i*3;uvec4 es_t0=texelFetch(storage_0_1,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_1,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_1,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);return fs_PlasterInstanceData_natural(vec4(uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w)),es_t1.x,uintBitsToFloat(es_t1.y),es_t1.z,es_t1.w,uvec2(es_t2.x,es_t2.y),int(es_t2.z),uintBitsToFloat(es_t2.w));}
uint fs_word_wall_color_data_wall_color_ids_1(int p){ivec2 sz=textureSize(storage_7_0,0);return texelFetch(storage_7_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_wall_color_data_wall_color_ids_1(int i){return fs_word_wall_color_data_wall_color_ids_1((i*1)+0);}
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
float fs_tgOpt_plasterFbm(vec2 p, int octaves){
  float acc = 0.0;
  float amp = 0.5;
  const mat2 rot = mat2(
    vec2(0.800000011920928955078125, -0.60000002384185791015625),
    vec2(0.60000002384185791015625, 0.800000011920928955078125)
  );
  for (int i = 0; i < octaves; i++) {
    ivec2 ci = ivec2(floor(p));
    vec2 fr = fract(p);
    float c00 = fs_tgOpt_hash2f(uvec2(ci));
    float c10 = fs_tgOpt_hash2f(uvec2(ci + ivec2(1, 0)));
    float c01 = fs_tgOpt_hash2f(uvec2(ci + ivec2(0, 1)));
    float c11 = fs_tgOpt_hash2f(uvec2(ci + ivec2(1, 1)));
    vec2 u = (fr * fr) * (vec2(3.0) - (vec2(2.0) * fr));
    float ux = u.x;
    float ox = 1.0 - ux;
    float uy = u.y;
    float n = ((((1.0 - uy) * ((c00 * ox) + (c10 * ux))) + ((c01 * ox) * uy)) + ((c11 * ux) * uy));
    acc += amp * (-1.0 + 2.0 * n);
    amp *= 0.550000011920928955078125;
    p = (p * 1.89999997615814208984375) * rot;
  }
  return acc;
}
void fs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t17=texelFetch(uniform_FrameConstants_natural,ivec2(17%es_s.x,17/es_s.x),0);
uvec4 es_t18=texelFetch(uniform_FrameConstants_natural,ivec2(18%es_s.x,18/es_s.x),0);
uvec4 es_t19=texelFetch(uniform_FrameConstants_natural,ivec2(19%es_s.x,19/es_s.x),0);
fs_frame_constants.brush_position=vec3(uintBitsToFloat(es_t17.x),uintBitsToFloat(es_t17.y),uintBitsToFloat(es_t17.z));
fs_frame_constants.eraser_size_multiplier=uintBitsToFloat(es_t17.w);
fs_frame_constants.wall_highlighted_slot_id=es_t18.z;
fs_frame_constants.wall_highlight_mode=es_t18.w;
fs_frame_constants.highlight_bricks_to_delete=es_t19.x;
}
void fs_original_main()
{fs_vs_out_frag_tangent_to_world.data[0]=gs_vin.v9;fs_vs_out_frag_tangent_to_world.data[1]=gs_vin.v10;fs_vs_out_frag_tangent_to_world.data[2]=gs_vin.v11;
    uint _5654;
fs_PlasterInstanceData_natural es_h0=fs_read_material_data_nani_instance_data(int(gs_vin.v0));
    if (es_h0.wall_slot_id == fs_frame_constants.wall_highlighted_slot_id)
    {
        _5654 = fs_frame_constants.wall_highlight_mode;
    }
    else
    {
        _5654 = 0u;
    }
    float _149 = clamp(gs_vin.v6, 0.0, 1.0);
    uint _164 = uint(es_h0.wall_length * 1.75);
    uint _1183 = _164 + (_164 << 10u);
    uint _1185 = _1183 ^ (_1183 >> 6u);
    uint _1187 = _1185 + (_1185 << 3u);
    uint _1189 = _1187 ^ (_1187 >> 11u);
    float _7346 = (int(es_h0.blend_uv_seam != 0u) == 0) ? 0.0 : smoothstep(1.0 - (1.0 / es_h0.wall_length), 1.0, gs_vin.v3.x / es_h0.wall_length);
    if (_149 < 0.100000001490116119384765625)
    {
        discard;
    }
    vec2 _217 = vec2(mix(0.0, 10.0, uintBitsToFloat(((_1189 + (_1189 << 15u)) & 8388607u) | 1065353216u) - 1.0));
    float _1202 = mix(0.0, 0.5, gs_vin.v8);
    float _5658 = fs_tgOpt_plasterFbm((gs_vin.v3 + vec2(23.3999996185302734375)) + _217, 3);
    float _5660 = fs_tgOpt_plasterFbm(((gs_vin.v3 * 0.5) + vec2(0.5)) + _217, 5);
    float _1219 = smoothstep(0.0, 1.0, 1.0 - _149);
    float _1220 = _1219 * (mix(0.300000011920928955078125, 1.0, _5658) * gs_vin.v7);
    float _1221 = (_1202 + _5660) + _1220;
    bool _1222 = _7346 > 0.0;
    float _5663;
    if (_1222)
    {
        float _5662 = fs_tgOpt_plasterFbm(((vec2(es_h0.wall_length - gs_vin.v3.x, gs_vin.v3.y) * 0.5) + vec2(0.5)) + _217, 5);
        _5663 = mix(_1221, (_1202 + _5662) + _1220, _7346);
    }
    else
    {
        _5663 = _1221;
    }
    float _1241 = smoothstep(0.0, 4.0, gs_vin.v3.y);
    float _1244 = min((_1241 * 1.5) - 0.20000000298023223876953125, 0.89999997615814208984375);
    float _1245 = _1244 + 0.100000001490116119384765625;
    float _1247 = _5663 * 2.0;
    float _1248 = smoothstep(_1244, _1245, _1247);
    float _1252 = clamp(smoothstep(_1244 - 0.100000001490116119384765625, _1245, _1247) - _1248, 0.0, 1.0);
    if ((_5663 * mix(2.0, 2.7999999523162841796875, clamp(gs_vin.v8 * 2.0, 0.0, 1.0))) > (_1241 * 2.0))
    {
        discard;
    }
    vec2 my_uv = gs_vin.v3 * 0.100000001490116119384765625;
    int _581 = int(fs_read_wall_color_data_wall_color_ids_1(int(es_h0.wall_slot_id)));
    float _2515 = float(uint(_581 - 4));
    vec4 _2521 = texture(wall_color_data_plaster_colors, vec3(my_uv + _217, _2515));
    vec3 _2524 = _2521.xyz;
    vec3 _5685;
    if (_1222)
    {
        _5685 = mix(_2524, texture(wall_color_data_plaster_colors, vec3(vec2((es_h0.wall_length * 0.100000001490116119384765625) - my_uv.x, my_uv.y) + _217, _2515)).xyz, vec3(_7346));
    }
    else
    {
        _5685 = _2524;
    }
    vec3 _5670;
    if (_581 == 4)
    {
        _5670 = vec3(0.4766300618648529052734375, 0.23876892030239105224609375, 0.17930369079113006591796875);
    }
    else
    {
        vec3 _5671;
        if (_581 == 5)
        {
            _5671 = vec3(0.36000001430511474609375, 0.3288960158824920654296875, 0.165600001811981201171875);
        }
        else
        {
            vec3 _5672;
            if (_581 == 6)
            {
                _5672 = vec3(0.2800000011920928955078125, 0.29254400730133056640625, 0.2512000501155853271484375);
            }
            else
            {
                vec3 _5673;
                if (_581 == 7)
                {
                    _5673 = vec3(0.2100000083446502685546875, 0.1674120128154754638671875, 0.1281000077724456787109375);
                }
                else
                {
                    vec3 _5674;
                    if (_581 == 8)
                    {
                        _5674 = vec3(0.4000000059604644775390625, 0.3656800091266632080078125, 0.24400003254413604736328125);
                    }
                    else
                    {
                        vec3 _5675;
                        if (_581 == 9)
                        {
                            _5675 = vec3(0.2700000107288360595703125, 0.3499999940395355224609375, 0.2700000107288360595703125);
                        }
                        else
                        {
                            bool _5669;
                            if (_581 == 10)
                            {
                                _5669 = true;
                            }
                            else
                            {
                                _5669 = _581 == 12;
                            }
                            _5675 = mix(vec3(0.0), vec3(0.4000000059604644775390625, 0.3656800091266632080078125, 0.24400003254413604736328125), bvec3(_5669));
                        }
                        _5674 = _5675;
                    }
                    _5673 = _5674;
                }
                _5672 = _5673;
            }
            _5671 = _5672;
        }
        _5670 = _5671;
    }
    vec4 sampled = texture(material_data_mortar, my_uv * 2.0);
    vec3 _770 = vec3(_1248);
    vec3 _772 = mix(_5685, (_5670 * 1.10000002384185791015625) * sampled.xyz, _770);
    vec4 sampled_1 = texture(material_data_normal_map, my_uv);
    vec3 _814 = normalize(mix(normalize(((sampled_1.xyz * 2.0) - vec3(1.0)) * mat3(vec3(fs_vs_out_frag_tangent_to_world.data[0].x, fs_vs_out_frag_tangent_to_world.data[1].x, fs_vs_out_frag_tangent_to_world.data[2].x), vec3(fs_vs_out_frag_tangent_to_world.data[0].y, fs_vs_out_frag_tangent_to_world.data[1].y, fs_vs_out_frag_tangent_to_world.data[2].y), vec3(fs_vs_out_frag_tangent_to_world.data[0].z, fs_vs_out_frag_tangent_to_world.data[1].z, fs_vs_out_frag_tangent_to_world.data[2].z))), gs_vin.v1, _770));
    vec3 _5713;
    if (_1252 > 0.0)
    {
        vec2 _819 = gs_vin.v3 + vec2(0.00999999977648258209228515625, 0.0);
        float _5696 = fs_tgOpt_plasterFbm((gs_vin.v3 + vec2(23.409999847412109375, 23.3999996185302734375)) + _217, 3);
        float _5698 = fs_tgOpt_plasterFbm(((_819 * 0.5) + vec2(0.5)) + _217, 5);
        float _2606 = _1219 * (mix(0.300000011920928955078125, 1.0, _5696) * gs_vin.v7);
        float _2607 = (_1202 + _5698) + _2606;
        float _5701;
        if (_1222)
        {
            float _5700 = fs_tgOpt_plasterFbm(((vec2(es_h0.wall_length - _819.x, _819.y) * 0.5) + vec2(0.5)) + _217, 5);
            _5701 = mix(_2607, (_1202 + _5700) + _2606, _7346);
        }
        else
        {
            _5701 = _2607;
        }
        float _2630 = min((smoothstep(0.0, 4.0, _819.y) * 1.5) - 0.20000000298023223876953125, 0.89999997615814208984375);
        float _2631 = _2630 + 0.100000001490116119384765625;
        float _2633 = _5701 * 2.0;
        vec2 _829 = gs_vin.v3 + vec2(0.0, 0.00999999977648258209228515625);
        float _5707 = fs_tgOpt_plasterFbm((gs_vin.v3 + vec2(23.3999996185302734375, 23.409999847412109375)) + _217, 3);
        float _5709 = fs_tgOpt_plasterFbm(((_829 * 0.5) + vec2(0.5)) + _217, 5);
        float _3913 = _1219 * (mix(0.300000011920928955078125, 1.0, _5707) * gs_vin.v7);
        float _3914 = (_1202 + _5709) + _3913;
        float _5712;
        if (_1222)
        {
            float _5711 = fs_tgOpt_plasterFbm(((vec2(es_h0.wall_length - _829.x, _829.y) * 0.5) + vec2(0.5)) + _217, 5);
            _5712 = mix(_3914, (_1202 + _5711) + _3913, _7346);
        }
        else
        {
            _5712 = _3914;
        }
        float _3937 = min((smoothstep(0.0, 4.0, _829.y) * 1.5) - 0.20000000298023223876953125, 0.89999997615814208984375);
        float _3938 = _3937 + 0.100000001490116119384765625;
        float _3940 = _5712 * 2.0;
        _5713 = mix(_814, normalize((gs_vin.v4 * (clamp(smoothstep(_2630 - 0.100000001490116119384765625, _2631, _2633) - smoothstep(_2630, _2631, _2633), 0.0, 1.0) - _1252)) + (gs_vin.v5 * (-(clamp(smoothstep(_3937 - 0.100000001490116119384765625, _3938, _3940) - smoothstep(_3937, _3938, _3940), 0.0, 1.0) - _1252)))), vec3(_1248 * 0.300000011920928955078125));
    }
    else
    {
        _5713 = _814;
    }
    bool _5733;
    vec3 _5749;
    if (_5654 == 1u)
    {
        _5749 = mix(_772, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        _5733 = true;
    }
    else
    {
        bool _5229 = _5654 == 2u;
        vec3 _5750;
        if (_5229)
        {
            _5750 = mix(_772, vec3(0.5), vec3(0.100000001490116119384765625));
        }
        else
        {
            _5750 = _772;
        }
        _5749 = _5750;
        _5733 = _5229 ? true : false;
    }
    bool _5714;
    if (fs_frame_constants.highlight_bricks_to_delete == 1u)
    {
        _5714 = distance(fs_frame_constants.brush_position.xz, gs_vin.v2.xz) < ((1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier) - 0.2700000107288360595703125);
    }
    else
    {
        _5714 = false;
    }
    vec3 _5747;
    if (_5714)
    {
        _5747 = mix(_772, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
    }
    else
    {
        _5747 = _5749;
    }
    uvec2 _5268;
    vec3 _5279 = (_5713 * 0.5) + vec3(0.5);
    _5268.x = ((uint((clamp(_5279.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_5279.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_5279.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u;
    vec3 _5387 = sqrt(clamp(_5747, vec3(0.0), vec3(1.0)));
    uint _5402 = (uint((clamp(_5387.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_5387.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_5387.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    _5268.y = _5402;
    _5268.y = _5402 | ((7u | (uint(_5714 ? true : _5733) << 3u)) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _5268;
}


void fs_main(){fs_read_uniform_FrameConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
