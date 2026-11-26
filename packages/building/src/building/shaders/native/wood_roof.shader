Shader "BuildingUnit/wood_roof/b746b5cd75db685c" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_6_0;
      usampler2D storage_0_0;
      usampler2D uniform_ViewConstants_natural;
      vec4 renderer_DormerGrid;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_9_0;
      usampler2D storage_8_0;
      sampler2DArray wooden_wall_colors_tex;
      sampler2DArray halftimber_colors_tex;
      sampler2D material_data_wood_roughness;
      sampler2D material_data_dirtpath_heightmap;
      usampler2D domain_roof;
      usampler2D domain_counts;
      usampler2D domain_holes;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Normal;
        vec2 Vertex_UV;
        int is_bevel;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        vec3 v0;
        vec3 v1;
        flat uint v2;
        flat uint v3;
        flat int v5;
        flat int v6;
        vec2 v7;
        flat int v8;
        flat int v9;
        flat int v10;
        flat int v11;
        flat int v12;
        flat int v13;
      };
      BuildingVaryings gs_vin;

      vec3 vs_out_v0 = vec3(0.0);
      vec3 vs_out_v1 = vec3(0.0);
      uint vs_out_v2 = 0u;
      uint vs_out_v3 = 0u;
      int vs_out_v5 = 0;
      int vs_out_v6 = 0;
      vec2 vs_out_v7 = vec2(0.0);
      int vs_out_v8 = 0;
      int vs_out_v9 = 0;
      int vs_out_v10 = 0;
      int vs_out_v11 = 0;
      int vs_out_v12 = 0;
      int vs_out_v13 = 0;
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

struct vs_WoodenPlank_natural
{
    vs_Affine3Packed_natural transform;
    int gate_seed;
    int piece_seed;
    uint color_source;
    uint flags;
    uvec2 window_cut_buffer_address;
    uint window_cut_list;
    uint pad0;
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
int vs_v4 = 0;









ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_6_0,0);return texelFetch(storage_6_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_WoodenPlank_natural vs_read_material_data_nani_instance_data_1(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*5;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);uvec4 es_t4=texelFetch(storage_0_0,ivec2((es_b+4)%es_s.x,(es_b+4)/es_s.x),0);return vs_WoodenPlank_natural(vs_Affine3Packed_natural(vs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),int(es_t3.x),int(es_t3.y),es_t3.z,es_t3.w,uvec2(es_t4.x,es_t4.y),es_t4.z,es_t4.w);}
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
    uint _38 = uint(gl_InstanceID);
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_38));
vs_WoodenPlank_natural es_h1=vs_read_material_data_nani_instance_data_1(int(es_h0));
    mat3x4 _966 = transpose(mat4x3(vec3(es_h1.transform.data.data[0], es_h1.transform.data.data[1], es_h1.transform.data.data[2]), vec3(es_h1.transform.data.data[3], es_h1.transform.data.data[4], es_h1.transform.data.data[5]), vec3(es_h1.transform.data.data[6], es_h1.transform.data.data[7], es_h1.transform.data.data[8]), vec3(es_h1.transform.data.data[9], es_h1.transform.data.data[10], es_h1.transform.data.data[11])));
    vec3 _116 = gs_attr.Vertex_Position;
    float _127 = length(vec3(_966[0][1], _966[1][1], _966[2][1]));
    bool _974 = (es_h1.flags & 64u) != 0u;
    bool _2294;
    if (_974)
    {
        _2294 = true;
    }
    else
    {
        _2294 = (es_h1.flags & 128u) != 0u;
    }
    vec3 _2330;
    if (_2294)
    {
        bool _998 = (es_h1.flags & 128u) != 0u;
        float _2318;
        for (int _gs_once_0 = 0; _gs_once_0 < 1; _gs_once_0++) {
            bool _2296;
            if (_127 <= 9.9999997473787516355514526367188e-05)
            {
                _2296 = true;
            }
            else
            {
                bool _2297;
                if (!_974)
                {
                    _2297 = !_998;
                }
                else
                {
                    _2297 = false;
                }
                _2296 = _2297;
            }
            if (_2296)
            {
                _2318 = _116.y;
                break;
            }
            float _1024 = min(0.1599999964237213134765625, min(0.07999999821186065673828125 / _127, 0.449999988079071044921875));
            float _2498 = _974 ? 0.1599999964237213134765625 : 0.0;
            float _2499 = _974 ? _1024 : 0.0;
            float _2500 = _998 ? 0.1599999964237213134765625 : 0.0;
            float _2501 = _998 ? _1024 : 0.0;
            bool _2302;
            if (_974)
            {
                _2302 = _116.y < _2498;
            }
            else
            {
                _2302 = false;
            }
            if (_2302)
            {
                _2318 = (_116.y * _2499) / _2498;
                break;
            }
            bool _2306;
            if (_998)
            {
                _2306 = _116.y > (1.0 - _2500);
            }
            else
            {
                _2306 = false;
            }
            if (_2306)
            {
                _2318 = 1.0 - (((1.0 - _116.y) * _2501) / _2500);
                break;
            }
            _2318 = _2499 + (((_116.y - _2498) / ((1.0 - _2498) - _2500)) * ((1.0 - _2499) - _2501));
            break;
        }
        vec3 _2284 = _116;
        _2284.y = _2318;
        _2330 = _2284;
    }
    else
    {
        _2330 = _116;
    }
    int _302 = es_h1.gate_seed + es_h1.piece_seed;
    int seed = _302 + 45;
    uint _305 = uint(seed);
    uint _1087 = _305 + (_305 << 10u);
    uint _1089 = _1087 ^ (_1087 >> 6u);
    uint _1091 = _1089 + (_1089 << 3u);
    uint _1093 = _1091 ^ (_1091 >> 11u);
    float _348 = 1.57000005245208740234375 * float(int((uintBitsToFloat(((_1093 + (_1093 << 15u)) & 8388607u) | 1065353216u) - 1.0) * 4.0));
    vec3 _1104 = normalize(vec3(0.0, 1.0, 0.0));
    float _1105 = sin(_348);
    float _1106 = cos(_348);
    float _1107 = 1.0 - _1106;
    float _1109 = _1107 * _1104.x;
    float _1113 = _1109 * _1104.y;
    float _1115 = _1104.z * _1105;
    float _1117 = _1107 * _1104.z;
    float _1118 = _1117 * _1104.x;
    float _1119 = _1104.y * _1105;
    float _1122 = _1107 * _1104.y;
    float _1125 = _1122 * _1104.z;
    float _1126 = _1104.x * _1105;
    mat4 _1137 = transpose(mat4(vec4((_1109 * _1104.x) + _1106, _1113 - _1115, _1118 + _1119, 0.0), vec4(_1113 + _1115, (_1122 * _1104.y) + _1106, _1125 - _1126, 0.0), vec4(_1118 - _1119, _1125 + _1126, (_1117 * _1104.z) + _1106, 0.0), vec4(0.0, 0.0, 0.0, 1.0)));
    bool _2328;
    if (_974 == ((es_h1.flags & 128u) != 0u))
    {
        uint _398 = uint(_302 + 500);
        uint _1161 = _398 + (_398 << 10u);
        uint _1163 = _1161 ^ (_1161 >> 6u);
        uint _1165 = _1163 + (_1163 << 3u);
        uint _1167 = _1165 ^ (_1165 >> 11u);
        _2328 = (uintBitsToFloat(((_1167 + (_1167 << 15u)) & 8388607u) | 1065353216u) - 1.0) > 0.5;
    }
    else
    {
        _2328 = false;
    }
    mat4 _2331;
    vec3 _2332;
    if (_2328)
    {
        vec3 _1178 = normalize(vec3(0.0, 0.0, 1.0));
        float _1183 = 1.9999988079071044921875 * _1178.x;
        float _1187 = _1183 * _1178.y;
        float _1189 = _1178.z * 0.001592547981999814510345458984375;
        float _1191 = 1.9999988079071044921875 * _1178.z;
        float _1192 = _1191 * _1178.x;
        float _1193 = _1178.y * 0.001592547981999814510345458984375;
        float _1196 = 1.9999988079071044921875 * _1178.y;
        float _1199 = _1196 * _1178.z;
        float _1200 = _1178.x * 0.001592547981999814510345458984375;
        vec3 _2287 = _2330;
        _2287.y = _2330.y - 1.0;
        _2332 = _2287;
        _2331 = transpose(mat4(vec4((_1183 * _1178.x) + (-0.999998748302459716796875), _1187 - _1189, _1192 + _1193, 0.0), vec4(_1187 + _1189, (_1196 * _1178.y) + (-0.999998748302459716796875), _1199 - _1200, 0.0), vec4(_1192 - _1193, _1199 + _1200, (_1191 * _1178.z) + (-0.999998748302459716796875), 0.0), vec4(0.0, 0.0, 0.0, 1.0))) * _1137;
    }
    else
    {
        _2332 = _2330;
        _2331 = _1137;
    }
    mat3x4 _421 = _2331 * _966;
    vec4 _425 = vec4(vec4(_2332, 1.0) * _421, 1.0);
    vec3 _427 = _425.xyz;
    vec3 _1214 = _427 * 0.4000000059604644775390625;
    ivec3 _1240 = ivec3(floor(_1214));
    vec3 _1241 = fract(_1214);
    vec2 _1229 = vs_tgOpt_hash3v2(uvec3(_1240));
    vec2 _1230 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(1, 0, 0)));
    vec2 _1231 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(0, 1, 0)));
    vec2 _1232 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(1, 1, 0)));
    vec2 _1233 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(0, 0, 1)));
    vec2 _1234 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(1, 0, 1)));
    vec2 _1235 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(0, 1, 1)));
    vec2 _1236 = vs_tgOpt_hash3v2(uvec3(_1240 + ivec3(1)));
    vec3 _2152 = (_1241 * _1241) * (vec3(3.0) - (vec3(2.0) * _1241));
    float _1305 = _2152.x;
    float _1306 = 1.0 - _1305;
    float _1308 = _2152.y;
    float _1309 = 1.0 - _1308;
    float _1311 = _2152.z;
    float _1312 = 1.0 - _1311;
    vec2 _1219 = clamp((((((((((((_1229 * _1306) * _1309) * _1312) + (((_1230 * _1305) * _1309) * _1312)) + (((_1231 * _1306) * _1308) * _1312)) + (((_1232 * _1305) * _1308) * _1312)) + (((_1233 * _1306) * _1309) * _1311)) + (((_1234 * _1305) * _1309) * _1311)) + (((_1235 * _1306) * _1308) * _1311)) + (((_1236 * _1305) * _1308) * _1311)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 _718 = _427 + (vec3(_1219.x, 0.0, _1219.y) * 0.0599999986588954925537109375);
    vec4 _2289 = _425;
    _2289.x = _718.x;
    _2289.y = _718.y;
    _2289.z = _718.z;
    mat3 _733 = mat3(_421[0].xyz, _421[1].xyz, _421[2].xyz);
    vec3 _2158 = vec3(1.0, 0.0, 0.0) * _733;
    vec3 _2159 = vec3(0.0, 1.0, 0.0) * _733;
    vec3 _2160 = vec3(0.0, 0.0, 1.0) * _733;
    vec3 _2163 = cross(_2158, _2159);
    vec3 _2166 = vec3(1.0 / dot(_2160, _2163));
    uint _805 = uint(seed ^ 2340774);
    uint _2186 = _805 + (_805 << 10u);
    uint _2188 = _2186 ^ (_2186 >> 6u);
    uint _2190 = _2188 + (_2188 << 3u);
    uint _2192 = _2190 ^ (_2190 >> 11u);
    uint _809 = uint(seed ^ 934565);
    uint _2208 = _809 + (_809 << 10u);
    uint _2210 = _2208 ^ (_2208 >> 6u);
    uint _2212 = _2210 + (_2210 << 3u);
    uint _2214 = _2212 ^ (_2212 >> 11u);
    gl_Position = renderer_MVPMat * _2289;
    vs_out_v0 = _2289.xyz;
    vs_out_v1 = normalize(gs_attr.Vertex_Normal * transpose(mat3(cross(_2159, _2160) * _2166, cross(_2160, _2158) * _2166, _2163 * _2166)));
    vs_out_v2 = es_h0;
    vs_out_v3 = es_h1.window_cut_list;
    vs_v4 = seed;
    vs_out_v5 = gs_attr.is_bevel;
    vs_out_v6 = int((es_h1.flags & 2u) != 0u);
    vs_out_v7 = (((gs_attr.Vertex_UV * 0.4000000059604644775390625) + vec2(uintBitsToFloat(((_2192 + (_2192 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_2214 + (_2214 << 15u)) & 8388607u) | 1065353216u) - 1.0)) + vec2(float(gs_attr.is_bevel) * 0.12000000476837158203125)) * vec2(1.0, _127 * 0.4000000059604644775390625);
    vs_out_v8 = int(es_h1.color_source);
    vs_out_v9 = int(es_h1.flags & 4u);
    vs_out_v10 = int(es_h1.flags & 8u);
    vs_out_v11 = int(es_h1.flags & 16u);
    vs_out_v12 = int(es_h1.flags & 32u);
    vs_out_v13 = int(es_h1.flags & 256u);
}


void vs_main(){vs_original_main();}

      BuildingVaryings vert() {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v1 = vs_out_v1;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v5 = vs_out_v5;
        _gs_vout.v6 = vs_out_v6;
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

struct fs_WoodenPlank_natural
{
    fs_Affine3Packed_natural transform;
    int gate_seed;
    int piece_seed;
    uint color_source;
    uint flags;
    uvec2 window_cut_buffer_address;
    uint window_cut_list;
    uint pad0;
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

fs_WoodenPlank_natural fs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*5;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);uvec4 es_t4=texelFetch(storage_0_0,ivec2((es_b+4)%es_s.x,(es_b+4)/es_s.x),0);return fs_WoodenPlank_natural(fs_Affine3Packed_natural(fs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),int(es_t3.x),int(es_t3.y),es_t3.z,es_t3.w,uvec2(es_t4.x,es_t4.y),es_t4.z,es_t4.w);}
uint fs_word_wooden_wall_colors_ids(int p){ivec2 sz=textureSize(storage_9_0,0);return texelFetch(storage_9_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_wooden_wall_colors_ids(int i){return fs_word_wooden_wall_colors_ids((i*1)+0);}
uint fs_word_halftimber_colors_ids(int p){ivec2 sz=textureSize(storage_8_0,0);return texelFetch(storage_8_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_halftimber_colors_ids(int i){return fs_word_halftimber_colors_ids((i*1)+0);}
void fs_read_uniform_ViewConstants_natural(){
ivec2 es_s=textureSize(uniform_ViewConstants_natural,0);
uvec4 es_t63=texelFetch(uniform_ViewConstants_natural,ivec2(63%es_s.x,63/es_s.x),0);
fs_current_view.mip_bias=uintBitsToFloat(es_t63.w);
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
fs_frame_constants.wall_highlighted_slot_id=es_t18.z;
fs_frame_constants.wall_highlight_mode=es_t18.w;
fs_frame_constants.highlight_bricks_to_delete=es_t19.x;
}
void fs_original_main(){
    vec3 _174 = normalize(gs_vin.v1);
    uint _2030 = gs_vin.v3 >> 24u;
    vec2 _5837;
    bool _5844;
    vec3 _5859;
    vec3 _5881;

        _5881 = _174;
        _5859 = gs_vin.v0;
        _5844 = false;
        _5837 = gs_vin.v7;
    
    bool _1528 = gs_vin.v12 > 0;
    uint _5831;
    if (_1528)
    {
        _5831 = fs_read_wooden_wall_colors_ids(int(gs_vin.v8));
    }
    else
    {
        _5831 = fs_read_halftimber_colors_ids(int(gs_vin.v8));
    }
    int _5832;
    if (gs_vin.v11 > 0)
    {
        _5832 = gs_vin.v8;
    }
    else
    {
        _5832 = (gs_vin.v6 != 0) ? 0 : int(_5831);
    }
    vec3 _5839;
    if (_1528)
    {
        vec3 _1570 = vec3(_5837, float(_5832));
        _5839 = texture(wooden_wall_colors_tex,_1570,fs_current_view.mip_bias).xyz;
    }
    else
    {
        vec3 _1588 = vec3(_5837, float(_5832));
        _5839 = texture(halftimber_colors_tex,_1588,fs_current_view.mip_bias).xyz;
    }
    int _5846;
    if (_5844)
    {
        _5846 = 0;
    }
    else
    {
        _5846 = gs_vin.v5;
    }
    vec3 _1616 = mix(_5839, _5839 * 1.10000002384185791015625, vec3(ivec3(_5846)));
    vec4 sampled = texture(material_data_wood_roughness,_5837,fs_current_view.mip_bias);
    float _1635 = mix(0.699999988079071044921875, 0.89999997615814208984375, smoothstep(0.89999997615814208984375, 1.0, sampled.x));
    vec3 _5868;
    bool _6125;
    if (gs_vin.v10 == 0)
    {
        uint _5850;
        if (uint(gs_vin.v8) == fs_frame_constants.wall_highlighted_slot_id)
        {
            _5850 = fs_frame_constants.wall_highlight_mode;
        }
        else
        {
            _5850 = 0u;
        }
        vec3 _5871;
        bool _6168;
        if (_5850 == 1u)
        {
            _6168 = true;
            _5871 = mix(_1616, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        }
        else
        {
            bool _4840 = _5850 == 2u;
            vec3 _5872;
            if (_4840)
            {
                _5872 = mix(_1616, vec3(0.5), vec3(0.100000001490116119384765625));
            }
            else
            {
                _5872 = _1616;
            }
            _6168 = _4840 ? true : false;
            _5871 = _5872;
        }
        bool _5861;
        if (fs_frame_constants.highlight_bricks_to_delete == 1u)
        {
            _5861 = distance(vec2(fs_frame_constants.brush_position[0], fs_frame_constants.brush_position[2]), _5859.xz) < ((1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier) - 0.20000000298023223876953125);
        }
        else
        {
            _5861 = false;
        }
        vec3 _5869;
        if (_5861)
        {
            _5869 = mix(_1616, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
        }
        else
        {
            _5869 = _5871;
        }
        _6125 = _5861 ? true : _6168;
        _5868 = _5869;
    }
    else
    {
        _6125 = false;
        _5868 = _1616;
    }
    bool _5862;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        _5862 = gs_vin.v13 == 0;
    }
    else
    {
        _5862 = false;
    }
    vec3 _6319;
    if (_5862)
    {
        float _1784 = smoothstep(-0.100000001490116119384765625, 0.0, _5859.y);
        vec3 _6320;
        if (gs_vin.v9 > 0)
        {
            vec4 sampled_1 = texture(material_data_dirtpath_heightmap,(_5859.xz * 0.0500000007450580596923828125),fs_current_view.mip_bias);
            float _1801 = sampled_1.x;
            _6320 = mix(_5868, vec3(0.699999988079071044921875), vec3((((smoothstep(0.0, 0.20000000298023223876953125, smoothstep(0.5, 1.0, _1635) * mix(0.0, 0.5, _1801)) * 0.60000002384185791015625) + (_1801 * 0.20000000298023223876953125)) * clamp(_5881.y, 0.0, 1.0)) * _1784));
        }
        else
        {
            _6320 = mix(_5868, vec3(0.699999988079071044921875), vec3(_1784 * smoothstep(0.5, 1.0, clamp(_5881.y, 0.0, 1.0))));
        }
        _6319 = _6320;
    }
    else
    {
        _6319 = _5868;
    }
    uvec2 _4884;
    vec3 _4895 = (_5881 * 0.5) + vec3(0.5);
    _4884.x = ((uint((clamp(_4895.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_4895.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_4895.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + (uint((clamp(_1635, 0.0, 1.0) * 255.0) + 0.5) << uint(24));
    vec3 _5003 = sqrt(clamp(_6319, vec3(0.0), vec3(1.0)));
    uint _5018 = (uint((clamp(_5003.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_5003.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_5003.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    _4884.y = _5018;
    _4884.y = _5018 | ((7u | (uint(_6125) << 3u)) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _4884;
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

void fs_main(){fs_read_uniform_ViewConstants_natural();fs_read_uniform_FrameConstants_natural();if(fs_domainContains(gs_vin.v2,gs_vin.v0))discard;fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
