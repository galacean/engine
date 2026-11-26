Shader "BuildingUnit/wooden-arch-frame/34f9ddae743ba957" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D uniform_ViewConstants_natural;
      usampler2D storage_6_0;
      usampler2D storage_0_0;
      usampler2D woodArchSamples;
      usampler2D uniform_FrameConstants_natural;
      sampler2D material_data_wood_edge_damage;
      sampler2DArray halftimber_colors_tex;
      sampler2D material_data_wood_roughness;
      sampler2D material_data_wood_normal;
      sampler2D material_data_dirtpath_heightmap;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        vec3 v0;
        vec3 v1;
        vec3 v2;
        vec3 v3;
        flat uint v4;
        float v5;
        vec2 v6;
        vec2 v7;
      };
      BuildingVaryings gs_vin;

      vec3 vs_out_v0 = vec3(0.0);
      vec3 vs_out_v1 = vec3(0.0);
      vec3 vs_out_v2 = vec3(0.0);
      vec3 vs_out_v3 = vec3(0.0);
      uint vs_out_v4 = 0u;
      float vs_out_v5 = 0.0;
      vec2 vs_out_v6 = vec2(0.0);
      vec2 vs_out_v7 = vec2(0.0);
      // --- Vertex Stage ---
struct vs_WoodenArchFrameInstanceData_natural
{
    vec4 bounding_sphere;
    uvec2 samples_gpu_address;
    uint sample_count;
    uint color_id;
    uint mesh_atlas_part_idx;
    uint caps;
    float profile_width;
    float profile_depth;
    float bevel_size;
    float frame_length;
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
uint vs_woodArchSampleBase = 0u;
uvec4 vs_woodArchSample(uint q){uint p=vs_woodArchSampleBase+q;ivec2 s=textureSize(woodArchSamples,0);return texelFetch(woodArchSamples,ivec2(int(p)%s.x,int(p)/s.x),0);}
const vec2[9] vs__208 = vec2[9]( vec2(-1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, -1.0), vec2(-1.0, 0.0) );
ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_6_0,0);return texelFetch(storage_6_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}
uint vs_word_material_data_nani_instance_data(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
vs_WoodenArchFrameInstanceData_natural vs_read_material_data_nani_instance_data(int i){return vs_WoodenArchFrameInstanceData_natural(vec4(uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+0)+0)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+0)+1)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+0)+2)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+0)+3))),uvec2(vs_word_material_data_nani_instance_data(((i*14)+4)+0),vs_word_material_data_nani_instance_data(((i*14)+4)+1)),vs_word_material_data_nani_instance_data(((i*14)+6)+0),vs_word_material_data_nani_instance_data(((i*14)+7)+0),vs_word_material_data_nani_instance_data(((i*14)+8)+0),vs_word_material_data_nani_instance_data(((i*14)+9)+0),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+10)+0)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+11)+0)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+12)+0)),uintBitsToFloat(vs_word_material_data_nani_instance_data(((i*14)+13)+0)));}

void vs_original_main(){
    uint _90 = uint(gl_InstanceID);
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_90));
vs_WoodenArchFrameInstanceData_natural es_h1=vs_read_material_data_nani_instance_data(int(es_h0));
    vs_woodArchSampleBase=es_h1.samples_gpu_address.x;
    float half_depth = es_h1.profile_depth * 0.5;
    float half_width = es_h1.profile_width * 0.5;
    float _173 = min(es_h1.bevel_size, min(half_depth, half_width) * 0.949999988079071044921875);
    float bevel_size = _173 * 0.4000000059604644775390625;
    float _176 = es_h1.profile_depth * (-0.5);
    float _177 = es_h1.profile_width * (-0.5);
    vec2 _178 = vec2(_176, _177);
    float _179 = half_width - bevel_size;
    vec2 _180 = vec2(_176, _179);
    float _181 = _176 + bevel_size;
    vec2 _182 = vec2(_181, half_width);
    float _183 = half_depth - bevel_size;
    vec2 _184 = vec2(_183, half_width);
    vec2 _185 = vec2(half_depth, _179);
    vec2 _187 = vec2(half_depth, _177 + bevel_size);
    vec2 _188 = vec2(_183, _177);
    vec2 _189 = vec2(_181, _177);
    vec2 profile_mesh[9] = vec2[9]( _178, _180, _182, _184, _185, _187, _188, _189, _178 );
    vec2 _22[9] = profile_mesh;
    uint _198 = uint(gl_VertexID) % 9u;
    vec2 _223 = normalize(vec2(-1.0));
    vec2 profile_tangents[9] = vec2[9]( vec2(0.0, 1.0), vec2(0.0, 1.0), normalize(vec2(1.0)), vec2(1.0, 0.0), normalize(vec2(1.0, -1.0)), vec2(0.0, -1.0), _223, vec2(-1.0, 0.0), _223 );
    vec2 _24[9] = profile_tangents;
    float profile_distance[9];
    profile_distance[0] = 0.0;
    float _239 = profile_distance[0u];
    float _241 = _239 + distance(_180, _178);
    profile_distance[1u] = _241;
    float _246 = _241 + distance(_182, _180);
    profile_distance[2u] = _246;
    float _251 = _246 + distance(_184, _182);
    profile_distance[3u] = _251;
    float _256 = _251 + distance(_185, _184);
    profile_distance[4u] = _256;
    float _261 = _256 + distance(_187, _185);
    profile_distance[5u] = _261;
    float _266 = _261 + distance(_188, _187);
    profile_distance[6u] = _266;
    float _271 = _266 + distance(_189, _188);
    profile_distance[7u] = _271;
    profile_distance[8u] = _271 + distance(_178, _189);
    float _285 = _173 * 0.20000000298023223876953125;
    float edge_dmg_profile_tex_u[9] = float[9]( 0.0, 1.0 - _285, 1.0 + _285, 2.0 - _285, 2.0 + _285, 3.0 - _285, 3.0 + _285, 4.0 - _285, 4.0 );
    float _28[9] = edge_dmg_profile_tex_u;
    float step = 1.0 / float(1u << es_h1.mesh_atlas_part_idx);
    bool cap_start = (es_h1.caps & 1u) != 0u;
    bool cap_end = (es_h1.caps & 2u) != 0u;
    bool _959;
    if (cap_start)
    {
        _959 = gs_attr.Vertex_Position.z < step;
    }
    else
    {
        _959 = false;
    }
    float _964;
    float _966;
    if (_959)
    {
        _966 = 1.0;
        _964 = 0.0;
    }
    else
    {
        bool _960;
        if (cap_end)
        {
            _960 = gs_attr.Vertex_Position.z > (1.0 - step);
        }
        else
        {
            _960 = false;
        }
        float _965;
        if (_960)
        {
            _965 = 1.0;
        }
        else
        {
            float _1003 = cap_start ? step : 0.0;
            float _963;
            if (cap_end)
            {
                _963 = 1.0 - step;
            }
            else
            {
                _963 = 1.0;
            }
            _965 = (gs_attr.Vertex_Position.z - _1003) / (_963 - _1003);
        }
        _966 = float(_960);
        _964 = _965;
    }
    float curve_pos = _964 * float(es_h1.sample_count - 1u);
    uint _376 = min(uint(floor(curve_pos)), (es_h1.sample_count - 2u));
    float _380 = clamp(curve_pos - float(_376), 0.0, 1.0);
    uint _739 = _376 * 3u;
    uint _742 = _739 + 1u;
    uint _745 = _739 + 2u;
    uint _770 = (_376 + 1u) * 3u;
    uint _773 = _770 + 1u;
    uint _776 = _770 + 2u;
    vec3 _430 = vec3(_380);
    vec3 _435 = normalize(mix(uintBitsToFloat(uvec3(vs_woodArchSample(_742)[0], vs_woodArchSample(_742)[1], vs_woodArchSample(_742)[2])), uintBitsToFloat(uvec3(vs_woodArchSample(_773)[0], vs_woodArchSample(_773)[1], vs_woodArchSample(_773)[2])), _430));
    vec3 _439 = normalize(mix(uintBitsToFloat(uvec3(vs_woodArchSample(_745)[0], vs_woodArchSample(_745)[1], vs_woodArchSample(_745)[2])), uintBitsToFloat(uvec3(vs_woodArchSample(_776)[0], vs_woodArchSample(_776)[1], vs_woodArchSample(_776)[2])), _430));
    vec3 _441 = normalize(cross(_439, _435));
    vec3 _990;
    if (_966 > 0.0)
    {
        _990 = vec3(0.0);
    }
    else
    {
        _990 = (_439 * _22[_198].x) + (_441 * _22[_198].y);
    }
    bool _968;
    if (cap_start)
    {
        _968 = (es_h1.caps & 4u) != 0u;
    }
    else
    {
        _968 = false;
    }
    bool _971;
    if (_968)
    {
        _971 = _966 <= 0.0;
    }
    else
    {
        _971 = false;
    }
    bool _980;
    if (_971)
    {
        _980 = gs_attr.Vertex_Position.z <= step;
    }
    else
    {
        _980 = false;
    }
    bool _972;
    if (cap_end)
    {
        _972 = (es_h1.caps & 8u) != 0u;
    }
    else
    {
        _972 = false;
    }
    bool _976;
    if (_972)
    {
        _976 = _966 <= 0.0;
    }
    else
    {
        _976 = false;
    }
    bool _981;
    if (_976)
    {
        _981 = gs_attr.Vertex_Position.z >= (1.0 - step);
    }
    else
    {
        _981 = false;
    }
    vec3 _991;
    if (_980 ? true : _981)
    {
        vec3 horizontal_tangent = vec3(_435.x, 0.0, _435.z);
        float _515 = length(horizontal_tangent);
        vec3 _992;
        if (_515 > 9.9999997473787516355514526367188e-05)
        {
            vec3 cap_normal = horizontal_tangent / vec3(_515);
            _992 = _990 + (_435 * ((-dot(cap_normal, _990)) / dot(cap_normal, _435)));
        }
        else
        {
            _992 = _990;
        }
        _991 = _992;
    }
    else
    {
        _991 = _990;
    }
    vec3 pos_ws = mix(uintBitsToFloat(uvec3(vs_woodArchSample(_739)[0], vs_woodArchSample(_739)[1], vs_woodArchSample(_739)[2])), uintBitsToFloat(uvec3(vs_woodArchSample(_770)[0], vs_woodArchSample(_770)[1], vs_woodArchSample(_770)[2])), _430) + _991;
    float _572 = mix(uintBitsToFloat(vs_woodArchSample(_739)[3]), uintBitsToFloat(vs_woodArchSample(_770)[3]), _380);
    vec2 _998;
    vec2 _999;
    if (_966 > 0.00999999977648258209228515625)
    {
        _999 = (_22[_198] * 2.0) + vec2(0.37000000476837158203125);
        _998 = vec2(0.0);
    }
    else
    {
        uvec3 _592 = uvec3(abs(vec3(es_h1.bounding_sphere[0], es_h1.bounding_sphere[1], es_h1.bounding_sphere[2])) * 100.0);
        uint _807 = _592.z;
        uint _813 = _807 + (_807 << 10u);
        uint _815 = _813 ^ (_813 >> 6u);
        uint _817 = _815 + (_815 << 3u);
        uint _819 = _817 ^ (_817 >> 11u);
        uint _827 = (((_592.y * 1664525u) + (_819 + (_819 << 15u))) + 1013904223u) * 1664525u;
        uint _829 = _827 ^ (_827 >> 11u);
        uint _832 = _829 ^ ((_829 << 7u) & 2636928640u);
        uint _835 = _832 ^ ((_832 << 15u) & 4022730752u);
        uint _843 = (((_592.x * 1664525u) + (_835 ^ (_835 >> 18u))) + 1013904223u) * 1664525u;
        uint _845 = _843 ^ (_843 >> 11u);
        uint _848 = _845 ^ ((_845 << 7u) & 2636928640u);
        uint _851 = _848 ^ ((_848 << 15u) & 4022730752u);
        uint _853 = _851 ^ (_851 >> 18u);
        uint _867 = _853 + (_853 << 10u);
        uint _869 = _867 ^ (_867 >> 6u);
        uint _871 = _869 + (_869 << 3u);
        uint _873 = _871 ^ (_871 >> 11u);
        uint _857 = _853 ^ 188053769u;
        uint _889 = _857 + (_857 << 10u);
        uint _891 = _889 ^ (_889 >> 6u);
        uint _893 = _891 + (_891 << 3u);
        uint _895 = _893 ^ (_893 >> 11u);
        _999 = (vec2(profile_distance[_198] * 0.20000000298023223876953125, min(_572, es_h1.frame_length)) * 3.0) + vec2(uintBitsToFloat(((_873 + (_873 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_895 + (_895 << 15u)) & 8388607u) | 1065353216u) - 1.0);
        _998 = vec2(_28[_198] * 0.3333333432674407958984375, _572);
    }
    gl_Position = renderer_MVPMat * vec4(pos_ws, 1.0);
    vs_out_v0 = normalize((_439 * vs__208[_198].x) + (_441 * vs__208[_198].y));
    vs_out_v1 = pos_ws;
    vs_out_v2 = normalize((_439 * _24[_198].x) + (_441 * _24[_198].y));
    vs_out_v3 = _435;
    vs_out_v4 = es_h0;
    vs_out_v5 = _966;
    vs_out_v6 = _999;
    vs_out_v7 = _998;
}

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
        return _gs_vout;
      }

      // --- Fragment Stage ---
struct fs_WoodenArchFrameInstanceData_natural
{
    vec4 bounding_sphere;
    uvec2 samples_gpu_address;
    uint sample_count;
    uint color_id;
    uint mesh_atlas_part_idx;
    uint caps;
    float profile_width;
    float profile_depth;
    float bevel_size;
    float frame_length;
};




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
uint fs_word_material_data_nani_instance_data(int p){ivec2 sz=textureSize(storage_0_0,0);return texelFetch(storage_0_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
fs_WoodenArchFrameInstanceData_natural fs_read_material_data_nani_instance_data(int i){return fs_WoodenArchFrameInstanceData_natural(vec4(uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+0)+0)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+0)+1)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+0)+2)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+0)+3))),uvec2(fs_word_material_data_nani_instance_data(((i*14)+4)+0),fs_word_material_data_nani_instance_data(((i*14)+4)+1)),fs_word_material_data_nani_instance_data(((i*14)+6)+0),fs_word_material_data_nani_instance_data(((i*14)+7)+0),fs_word_material_data_nani_instance_data(((i*14)+8)+0),fs_word_material_data_nani_instance_data(((i*14)+9)+0),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+10)+0)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+11)+0)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+12)+0)),uintBitsToFloat(fs_word_material_data_nani_instance_data(((i*14)+13)+0)));}
void fs_read_uniform_ViewConstants_natural(){
ivec2 es_s=textureSize(uniform_ViewConstants_natural,0);
uvec4 es_t63=texelFetch(uniform_ViewConstants_natural,ivec2(63%es_s.x,63/es_s.x),0);
fs_current_view.mip_bias=uintBitsToFloat(es_t63.w);
}
void fs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t8=texelFetch(uniform_FrameConstants_natural,ivec2(8%es_s.x,8/es_s.x),0);
fs_frame_constants.glade_theme_id=es_t8.w;
}
void fs_original_main()
{
    vec3 _199 = normalize(gs_vin.v0);
    vec3 _935;
    if (gs_vin.v5 > 0.00999999977648258209228515625)
    {
        _935 = normalize(cross(dFdx(gs_vin.v1), fs_tgDdy(gs_vin.v1) * (-1.0)));
    }
    else
    {
        _935 = _199;
    }
    vec2 uv = gs_vin.v6 * vec2(0.449999988079071044921875, 0.0599999986588954925537109375);
    bool _244 = gs_vin.v5 <= 0.00999999977648258209228515625;
    float _928;
    if (_244)
    {
        _928 = 1.0 - texture(material_data_wood_edge_damage, gs_vin.v7 * vec2(1.0, 0.0500000007450580596923828125), fs_current_view.mip_bias).x;
    }
    else
    {
        _928 = 0.0;
    }
fs_WoodenArchFrameInstanceData_natural es_h0=fs_read_material_data_nani_instance_data(int(gs_vin.v4));
    vec4 sampled = texture(halftimber_colors_tex, vec3(uv, float(int(es_h0.color_id))), fs_current_view.mip_bias);
    vec2 normal_uv = gs_vin.v6 * vec2(0.2249999940395355224609375, 0.17999999225139617919921875);
    vec4 sampled_1 = texture(material_data_wood_roughness, normal_uv, fs_current_view.mip_bias);
    float _310 = mix(0.699999988079071044921875, 0.89999997615814208984375, 1.0 - sampled_1.x);
    vec3 _933;
    if (_244)
    {
        vec3 normal_tangent_space = (texture(material_data_wood_normal, normal_uv, fs_current_view.mip_bias).xyz * 2.0) - vec3(1.0);
        normal_tangent_space.z *= 18.1818180084228515625;
        _933 = normalize(((normalize(gs_vin.v2) * normal_tangent_space.x) + (normalize(gs_vin.v3) * normal_tangent_space.y)) + (_199 * normal_tangent_space.z));
    }
    else
    {
        _933 = _935;
    }
    vec4 sampled_2 = texture(halftimber_colors_tex, vec3(uv, 0.0), fs_current_view.mip_bias);
    vec3 _374 = mix(sampled.xyz, sampled_2.xyz, vec3(_928 * 0.4000000059604644775390625));
    bool _929;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        _929 = (es_h0.caps & 16u) == 0u;
    }
    else
    {
        _929 = false;
    }
    vec3 _937;
    if (_929)
    {
        vec4 sampled_3 = texture(material_data_dirtpath_heightmap, gs_vin.v1.xz * 0.0500000007450580596923828125, fs_current_view.mip_bias);
        float _410 = sampled_3.x;
        _937 = mix(_374, vec3(0.699999988079071044921875), vec3(((smoothstep(0.0, 0.20000000298023223876953125, smoothstep(0.5, 1.0, _310) * mix(0.0, 0.5, _410)) * 0.60000002384185791015625) + (_410 * 0.20000000298023223876953125)) * clamp(_933.y, 0.0, 1.0)));
    }
    else
    {
        _937 = _374;
    }
    uvec2 _621;
    vec3 _632 = (_933 * 0.5) + vec3(0.5);
    _621.x = ((uint((clamp(_632.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_632.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_632.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + (uint((clamp(_310, 0.0, 1.0) * 255.0) + 0.5) << uint(24));
    vec3 _740 = sqrt(clamp(_937, vec3(0.0), vec3(1.0)));
    uint _755 = (uint((clamp(_740.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_740.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_740.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    _621.y = _755;
    _621.y = _755 | 117440512u;
    fs_entryPointParam_ps_main_gbuffer = _621;
}


void fs_main(){fs_read_uniform_ViewConstants_natural();fs_read_uniform_FrameConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
