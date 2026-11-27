Shader "BuildingUnit/decoration-stone/7834d47bf06bb9c6" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_7_0;
      usampler2D storage_0_0;
      usampler2D uniform_ViewConstants_natural;
      usampler2D storage_6_0;
      usampler2D storage_22_0;
      usampler2D uniform_ColorLibraryData_natural;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_21_0;
      usampler2D storage_20_0;
      sampler2DArray roof_colors_tex;
      sampler2DArray wall_color_data_brick_colors;
      sampler2DArray wooden_wall_colors_tex;
      sampler2DArray halftimber_colors_tex;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        vec3 Vertex_Normal;
        vec2 Vertex_UV;
        int is_bevel;
        int brick_id;
        float bbx_x;
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
    int seed;
    int _wall_slot_id;
    uint wallspace_x_range_packed;
    uint flags;
    vec3 bone_0_pos;
    uint bone_0_normal_packed;
    vec3 bone_1_pos;
    uint bone_1_normal_packed;
    vec3 bone_2_pos;
    uint bone_2_normal_packed;
    float stone_foundation_clip_y;
    uvec3 pad0;
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

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_7_0,0);return texelFetch(storage_7_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_InstanceData_natural vs_read_material_data_nani_instance_data_1(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*8;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);uvec4 es_t4=texelFetch(storage_0_0,ivec2((es_b+4)%es_s.x,(es_b+4)/es_s.x),0);uvec4 es_t5=texelFetch(storage_0_0,ivec2((es_b+5)%es_s.x,(es_b+5)/es_s.x),0);uvec4 es_t6=texelFetch(storage_0_0,ivec2((es_b+6)%es_s.x,(es_b+6)/es_s.x),0);uvec4 es_t7=texelFetch(storage_0_0,ivec2((es_b+7)%es_s.x,(es_b+7)/es_s.x),0);return vs_InstanceData_natural(vs_Affine3Packed_natural(vs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),int(es_t3.x),int(es_t3.y),es_t3.z,es_t3.w,vec3(uintBitsToFloat(es_t4.x),uintBitsToFloat(es_t4.y),uintBitsToFloat(es_t4.z)),es_t4.w,vec3(uintBitsToFloat(es_t5.x),uintBitsToFloat(es_t5.y),uintBitsToFloat(es_t5.z)),es_t5.w,vec3(uintBitsToFloat(es_t6.x),uintBitsToFloat(es_t6.y),uintBitsToFloat(es_t6.z)),es_t6.w,uintBitsToFloat(es_t7.x),uvec3(es_t7.y,es_t7.z,es_t7.w));}
uint vs_word_wall_color_data_wall_color_ids_1(int p){ivec2 sz=textureSize(storage_6_0,0);return texelFetch(storage_6_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_wall_color_data_wall_color_ids_1(int i){return vs_word_wall_color_data_wall_color_ids_1((i*1)+0);}
uint vs_word_wall_identity_data_slot_wall_ids_1(int p){ivec2 sz=textureSize(storage_22_0,0);return texelFetch(storage_22_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_wall_identity_data_slot_wall_ids_1(int i){return vs_word_wall_identity_data_slot_wall_ids_1((i*1)+0);}
float vs_decorationStoneHalf(uint h){uint e=(h>>10u)&31u;uint m=h&1023u;float v=e==0u?float(m)*exp2(-24.0):e==31u?uintBitsToFloat(0x7f800000u|(m<<13u)):(1.0+float(m)/1024.0)*exp2(float(e)-15.0);return (h&32768u)!=0u?-v:v;}
vec2 vs_decorationStoneUnpackHalf2x16(uint v){return vec2(vs_decorationStoneHalf(v&65535u),vs_decorationStoneHalf(v>>16u));}
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
    uint _47 = uint(gl_InstanceID);
    vec3 _2109;
    vec3 _2185;
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_47));
vs_InstanceData_natural es_h1=vs_read_material_data_nani_instance_data_1(int(es_h0));
    if ((es_h1.flags & 4u) != 0u)
    {
        vec3 _865 = vec4(gs_attr.Vertex_Position, 1.0) * transpose(mat4x3(vec3(es_h1.xform.data.data[0], es_h1.xform.data.data[1], es_h1.xform.data.data[2]), vec3(es_h1.xform.data.data[3], es_h1.xform.data.data[4], es_h1.xform.data.data[5]), vec3(es_h1.xform.data.data[6], es_h1.xform.data.data[7], es_h1.xform.data.data[8]), vec3(es_h1.xform.data.data[9], es_h1.xform.data.data[10], es_h1.xform.data.data[11])));
        _2185 = _865;
        _2109 = _865;
    }
    else
    {
        vec2 _165 = vs_decorationStoneUnpackHalf2x16(es_h1.bone_1_normal_packed);
        vec3 _2110;
        vec3 _2186;
        if (gs_attr.bbx_x < 0.5)
        {
            float local_bbx = gs_attr.bbx_x * 2.0;
            float _198 = clamp(local_bbx, 0.0, 1.0);
            vec3 _2234 = vec3(mix(es_h1.bone_0_pos.x, es_h1.bone_1_pos.x, local_bbx), gs_attr.Vertex_Position.y + mix(es_h1.bone_0_pos.y, es_h1.bone_1_pos.y, _198), mix(es_h1.bone_0_pos.z, es_h1.bone_1_pos.z, local_bbx));
            vec2 _210 = _2234.xz + (normalize(mix(vs_decorationStoneUnpackHalf2x16(es_h1.bone_0_normal_packed), _165, vec2(_198))) * gs_attr.Vertex_Position.z);
            vec3 _2106 = _2234;
            _2106.x = _210.x;
            _2106.z = _210.y;
            _2186 = _2234;
            _2110 = _2106;
        }
        else
        {
            float local_bbx_1 = (gs_attr.bbx_x - 0.5) * 2.0;
            float _234 = clamp(local_bbx_1, 0.0, 1.0);
            vec3 _2233 = vec3(mix(es_h1.bone_1_pos.x, es_h1.bone_2_pos.x, local_bbx_1), gs_attr.Vertex_Position.y + mix(es_h1.bone_1_pos.y, es_h1.bone_2_pos.y, _234), mix(es_h1.bone_1_pos.z, es_h1.bone_2_pos.z, local_bbx_1));
            vec2 _246 = _2233.xz + (normalize(mix(_165, vs_decorationStoneUnpackHalf2x16(es_h1.bone_2_normal_packed), vec2(_234))) * gs_attr.Vertex_Position.z);
            vec3 _2095 = _2233;
            _2095.x = _246.x;
            _2095.z = _246.y;
            _2186 = _2233;
            _2110 = _2095;
        }
        _2185 = _2186;
        _2109 = _2110;
    }
    vec3 _905 = _2109 * 0.4000000059604644775390625;
    ivec3 _931 = ivec3(floor(_905));
    vec3 _932 = fract(_905);
    vec2 _920 = vs_tgOpt_hash3v2(uvec3(_931));
    vec2 _921 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(1, 0, 0)));
    vec2 _922 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(0, 1, 0)));
    vec2 _923 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(1, 1, 0)));
    vec2 _924 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(0, 0, 1)));
    vec2 _925 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(1, 0, 1)));
    vec2 _926 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(0, 1, 1)));
    vec2 _927 = vs_tgOpt_hash3v2(uvec3(_931 + ivec3(1)));
    vec3 _1843 = (_932 * _932) * (vec3(3.0) - (vec3(2.0) * _932));
    float _996 = _1843.x;
    float _997 = 1.0 - _996;
    float _999 = _1843.y;
    float _1000 = 1.0 - _999;
    float _1002 = _1843.z;
    float _1003 = 1.0 - _1002;
    vec2 _910 = clamp((((((((((((_920 * _997) * _1000) * _1003) + (((_921 * _996) * _1000) * _1003)) + (((_922 * _997) * _999) * _1003)) + (((_923 * _996) * _999) * _1003)) + (((_924 * _997) * _1000) * _1002)) + (((_925 * _996) * _1000) * _1002)) + (((_926 * _997) * _999) * _1002)) + (((_927 * _996) * _999) * _1002)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 _577 = _2109 + (vec3(_910.x, 0.0, _910.y) * 0.0599999986588954925537109375);
    int _2237 = (gs_attr.is_bevel != 0) ? 768 : 512;
    bool _1852 = (es_h1.flags & 1u) != 0u;
    int _2187;
    if (_1852)
    {
        _2187 = _2237 | 1024;
    }
    else
    {
        _2187 = _2237;
    }
    uint _628 = uint(es_h1.seed + gs_attr.brick_id);
    vec2 _665 = vs_decorationStoneUnpackHalf2x16(es_h1.wallspace_x_range_packed);
    uint _1899 = uint(es_h1._wall_slot_id);
    uint _1912 = vs_read_wall_identity_data_slot_wall_ids_1(int(_1899)) & 65535u;
    uint _1917 = _1912 ^ 7993234u;
    uint _1957 = _1917 + (_1917 << 10u);
    uint _1959 = _1957 ^ (_1957 >> 6u);
    uint _1961 = _1959 + (_1959 << 3u);
    uint _1963 = _1961 ^ (_1961 >> 11u);
    uint _1919 = _1912 ^ 3450234u;
    uint _1979 = _1919 + (_1919 << 10u);
    uint _1981 = _1979 ^ (_1979 >> 6u);
    uint _1983 = _1981 + (_1981 << 3u);
    uint _1985 = _1983 ^ (_1983 >> 11u);
    vec2 _1930 = (((vec2(mix(_665.x, _665.y, gs_attr.bbx_x), _577.y) * 0.100000001490116119384765625) * 0.699999988079071044921875) + vec2(float(_1912) * 0.20000000298023223876953125)) + vec2(uintBitsToFloat(((_1963 + (_1963 << 15u)) & 8388607u) | 1065353216u) - 1.0, uintBitsToFloat(((_1985 + (_1985 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    uint _1933 = _628 ^ 292478890u;
    uint _2001 = _1933 + (_1933 << 10u);
    uint _2003 = _2001 ^ (_2001 >> 6u);
    uint _2005 = _2003 + (_2003 << 3u);
    uint _2007 = _2005 ^ (_2005 >> 11u);
    float _2015 = uintBitsToFloat(((_2007 + (_2007 << 15u)) & 8388607u) | 1065353216u) - 1.0;
    vec2 _2188;
    if (_2015 > 0.89999997615814208984375)
    {
        _2188 = _1930 * 3.0;
    }
    else
    {
        _2188 = _1930 + vec2(0.61000001430511474609375 * _2015);
    }
    vec2 _2189;
    if (int((_2187 & 512) != 0) == 1)
    {
        _2189 = _2188 * 2.2000000476837158203125;
    }
    else
    {
        _2189 = _2188;
    }
    vec2 _2202;
    if (_1852)
    {
        _2202 = gs_attr.Vertex_UV;
    }
    else
    {
        _2202 = _2189;
    }
    gl_Position = renderer_MVPMat * vec4(_577, 1.0);
    vs_out_v0 = _628;
    vs_out_v1 = vec4(gs_attr.Vertex_Normal, 0.0) * transpose(mat4x3(vec3(es_h1.xform.data.data[0], es_h1.xform.data.data[1], es_h1.xform.data.data[2]), vec3(es_h1.xform.data.data[3], es_h1.xform.data.data[4], es_h1.xform.data.data[5]), vec3(es_h1.xform.data.data[6], es_h1.xform.data.data[7], es_h1.xform.data.data[8]), vec3(es_h1.xform.data.data[9], es_h1.xform.data.data[10], es_h1.xform.data.data[11])));
    vs_out_v2 = _577;
    vs_v3 = vec3(0.0);
    vs_v4 = vec3(0.0);
    vs_v5 = 0.0;
    vs_v6 = vec3(0.0);
    vs_out_v7 = 0.0;
    vs_out_v8 = es_h1.stone_foundation_clip_y;
    vs_out_v9 = _2202;
    vs_out_v10 = int(vs_read_wall_color_data_wall_color_ids_1(int(_1899)));
    vs_out_v11 = _2185.xz;
    vs_out_v12 = _2187;
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
    int seed;
    int _wall_slot_id;
    uint wallspace_x_range_packed;
    uint flags;
    vec3 bone_0_pos;
    uint bone_0_normal_packed;
    vec3 bone_1_pos;
    uint bone_1_normal_packed;
    vec3 bone_2_pos;
    uint bone_2_normal_packed;
    float stone_foundation_clip_y;
    uvec3 pad0;
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

fs_InstanceData_natural fs_read_material_data_nani_instance_data(int i){ivec2 es_s=textureSize(storage_0_0,0);int es_b=i*8;uvec4 es_t0=texelFetch(storage_0_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_0_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_0_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);uvec4 es_t3=texelFetch(storage_0_0,ivec2((es_b+3)%es_s.x,(es_b+3)/es_s.x),0);uvec4 es_t4=texelFetch(storage_0_0,ivec2((es_b+4)%es_s.x,(es_b+4)/es_s.x),0);uvec4 es_t5=texelFetch(storage_0_0,ivec2((es_b+5)%es_s.x,(es_b+5)/es_s.x),0);uvec4 es_t6=texelFetch(storage_0_0,ivec2((es_b+6)%es_s.x,(es_b+6)/es_s.x),0);uvec4 es_t7=texelFetch(storage_0_0,ivec2((es_b+7)%es_s.x,(es_b+7)/es_s.x),0);return fs_InstanceData_natural(fs_Affine3Packed_natural(fs_masonryMake_Array_natural_float12(float[12](uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z),uintBitsToFloat(es_t1.w),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w)))),int(es_t3.x),int(es_t3.y),es_t3.z,es_t3.w,vec3(uintBitsToFloat(es_t4.x),uintBitsToFloat(es_t4.y),uintBitsToFloat(es_t4.z)),es_t4.w,vec3(uintBitsToFloat(es_t5.x),uintBitsToFloat(es_t5.y),uintBitsToFloat(es_t5.z)),es_t5.w,vec3(uintBitsToFloat(es_t6.x),uintBitsToFloat(es_t6.y),uintBitsToFloat(es_t6.z)),es_t6.w,uintBitsToFloat(es_t7.x),uvec3(es_t7.y,es_t7.z,es_t7.w));}
uint fs_word_wooden_wall_colors_ids_1(int p){ivec2 sz=textureSize(storage_21_0,0);return texelFetch(storage_21_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_wooden_wall_colors_ids_1(int i){return fs_word_wooden_wall_colors_ids_1((i*1)+0);}
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
    bool _143 = (gs_vin.v12 & 8) != 0;
    bool _149 = (gs_vin.v12 & 16) != 0;
    bool _155 = (gs_vin.v12 & 2048) != 0;
    bool _163 = (gs_vin.v12 & 256) != 0;
    bool _1923;
    if (!_143)
    {
        _1923 = gs_vin.v7 > (-2.5);
    }
    else
    {
        _1923 = false;
    }
    bool _1924;
    if (_1923)
    {
        _1924 = gs_vin.v2.y < gs_vin.v7;
    }
    else
    {
        _1924 = false;
    }
    if (_1924)
    {
        discard;
    }
    else
    {
        bool _1925;
        if (_143)
        {
            _1925 = gs_vin.v2.y > gs_vin.v7;
        }
        else
        {
            _1925 = false;
        }
        if (_1925)
        {
            discard;
        }
    }
    uint color_id = uint(gs_vin.v10);
    vec3 _1967;
    if ((gs_vin.v12 & 2) != 0)
    {
        _1967 = texture(roof_colors_tex, vec3((vec2(uvec2(gs_vin.v0)) * 0.20000000298023223876953125) + (gs_vin.v2.xz * 0.20000000298023223876953125), float(color_id))).xyz * 0.699999988079071044921875;
    }
    else
    {
        vec2 _1929;
        if (_163)
        {
            _1929 = gs_vin.v9 + vec2(0.20999999344348907470703125);
        }
        else
        {
            _1929 = gs_vin.v9;
        }
        bool _1926;
        if (color_id == 1u)
        {
            _1926 = true;
        }
        else
        {
            _1926 = color_id == 0u;
        }
        vec3 _1952;
        if (_1926)
        {
            _1952 = pow(fs_color_library_data.wall_bricks.xyz, vec3(1.2999999523162841796875));
        }
        else
        {
            _1952 = pow(fs_color_library_data.wall_moss.xyz, vec3(1.0)) * 0.800000011920928955078125;
        }
        int _288 = int(color_id);
        bool _1930;
        if (_288 == 0)
        {
            _1930 = true;
        }
        else
        {
            _1930 = _288 == 4;
        }
        bool _1931;
        if (_1930)
        {
            _1931 = true;
        }
        else
        {
            _1931 = _288 == 10;
        }
        bool _1932;
        if (_1931)
        {
            _1932 = true;
        }
        else
        {
            _1932 = _288 == 12;
        }
        vec3 _1938;
        if (_1932)
        {
            _1938 = texture(wall_color_data_brick_colors, vec3(_1929 + vec2(0.85000002384185791015625), 0.0)).xyz;
        }
        else
        {
            bool _1933;
            if (_288 == 1)
            {
                _1933 = true;
            }
            else
            {
                _1933 = _288 == 5;
            }
            vec3 _1939;
            if (_1933)
            {
                _1939 = pow(texture(wall_color_data_brick_colors, vec3(_1929 + vec2(0.449999988079071044921875), 1.0)).xyz, vec3(1.10000002384185791015625));
            }
            else
            {
                bool _1934;
                if (_288 == 2)
                {
                    _1934 = true;
                }
                else
                {
                    _1934 = _288 == 7;
                }
                vec3 _1940;
                if (_1934)
                {
                    _1940 = texture(wall_color_data_brick_colors, vec3(_1929, 2.0)).xyz;
                }
                else
                {
                    bool _1935;
                    if (_288 == 3)
                    {
                        _1935 = true;
                    }
                    else
                    {
                        _1935 = _288 == 6;
                    }
                    bool _1936;
                    if (_1935)
                    {
                        _1936 = true;
                    }
                    else
                    {
                        _1936 = _288 == 8;
                    }
                    bool _1937;
                    if (_1936)
                    {
                        _1937 = true;
                    }
                    else
                    {
                        _1937 = _288 == 9;
                    }
                    vec3 _1941;
                    if (_1937)
                    {
                        _1941 = texture(wall_color_data_brick_colors, vec3(_1929, 3.0)).xyz;
                    }
                    else
                    {
                        vec3 _1942;
                        if (_288 == 11)
                        {
                            _1942 = texture(wall_color_data_brick_colors, vec3(_1929, 4.0)).xyz;
                        }
                        else
                        {
                            _1942 = vec3(0.0);
                        }
                        _1941 = _1942;
                    }
                    _1940 = _1941;
                }
                _1939 = _1940;
            }
            _1938 = _1939;
        }
        bool _507 = color_id == 7u;
        bool _1943;
        if (_507)
        {
            _1943 = true;
        }
        else
        {
            _1943 = color_id == 2u;
        }
        bool _1944;
        if (_1943)
        {
            _1944 = true;
        }
        else
        {
            _1944 = color_id == 11u;
        }
        vec3 _1966;
        if ((gs_vin.v12 & 512) != 0)
        {
            uint _531 = gs_vin.v0 ^ 8902390u;
            uint _1340 = _531 + (_531 << 10u);
            uint _1342 = _1340 ^ (_1340 >> 6u);
            uint _1344 = _1342 + (_1342 << 3u);
            uint _1346 = _1344 ^ (_1344 >> 11u);
            _1966 = mix(_1938, mix(_1952, _1938, bvec3(_1944)), vec3(mix(0.0, 0.5, smoothstep(0.20000000298023223876953125, 0.800000011920928955078125, uintBitsToFloat(((_1346 + (_1346 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1966 = _1938;
        }
        vec3 _1968;
        if (_163)
        {
            bool _1962;
            if (_507)
            {
                _1962 = true;
            }
            else
            {
                _1962 = color_id == 2u;
            }
            uint _595 = gs_vin.v0 ^ 239085u;
            uint _1362 = _595 + (_595 << 10u);
            uint _1364 = _1362 ^ (_1362 >> 6u);
            uint _1366 = _1364 + (_1364 << 3u);
            uint _1368 = _1366 ^ (_1366 >> 11u);
            _1968 = mix(_1966, fs_color_library_data.wall_1.xyz, vec3(mix(0.0, _1962 ? 0.20000000298023223876953125 : 0.4000000059604644775390625, smoothstep(0.0, 0.800000011920928955078125, uintBitsToFloat(((_1368 + (_1368 << 15u)) & 8388607u) | 1065353216u) - 1.0))));
        }
        else
        {
            _1968 = _1966;
        }
        _1967 = _1968;
    }
    vec3 _674 = normalize(gs_vin.v1);
    vec3 _2030;
    bool _2100;
    if (!((gs_vin.v12 & 64) != 0))
    {
        uint _1970;
        if ((gs_vin.v12 & 4096) != 0)
        {
            _1970 = fs_frame_constants.wall_highlight_mode;
        }
        else
        {
            _1970 = 0u;
        }
        vec3 _2033;
        bool _2103;
        if (_1970 == 1u)
        {
            _2103 = true;
            _2033 = mix(_1967, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
        }
        else
        {
            bool _1413 = _1970 == 2u;
            vec3 _2034;
            if (_1413)
            {
                _2034 = mix(_1967, vec3(0.5), vec3(0.100000001490116119384765625));
            }
            else
            {
                _2034 = _1967;
            }
            _2103 = _1413 ? true : false;
            _2033 = _2034;
        }
        bool _1973;
        if (fs_frame_constants.highlight_bricks_to_delete == 1u)
        {
            _1973 = distance(fs_frame_constants.brush_position.xz, gs_vin.v11) < (1.88900005817413330078125 * fs_frame_constants.eraser_size_multiplier);
        }
        else
        {
            _1973 = false;
        }
        vec3 _2031;
        if (_1973)
        {
            _2031 = mix(_1967, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.800000011920928955078125));
        }
        else
        {
            _2031 = _2033;
        }
        _2100 = _1973 ? true : _2103;
        _2030 = _2031;
    }
    else
    {
        _2100 = false;
        _2030 = _1967;
    }
    vec3 _2029;
    if (_155)
    {
        _2029 = mix(_1967, vec3(0.699999988079071044921875, 0.2100000083446502685546875, 0.0), vec3(0.5));
    }
    else
    {
        _2029 = _2030;
    }
    vec3 _2028;
    if (int((gs_vin.v12 & 1024) != 0) == 1)
    {
        vec3 _2038;
        if ((fs_read_material_data_nani_instance_data(int(gs_vin.v13)).flags & 2u) != 0u)
        {
            _2038 = texture(wooden_wall_colors_tex, vec3(gs_vin.v9, float(int(fs_read_wooden_wall_colors_ids_1(int(uint(fs_read_material_data_nani_instance_data(int(gs_vin.v13))._wall_slot_id))))))).xyz;
        }
        else
        {
            _2038 = texture(halftimber_colors_tex, vec3(gs_vin.v9, float(int(fs_read_halftimber_colors_ids_1(int(uint(fs_read_material_data_nani_instance_data(int(gs_vin.v13))._wall_slot_id))))))).xyz;
        }
        _2028 = _2038;
    }
    else
    {
        _2028 = _2029;
    }
    vec3 _2153;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        vec2 _901 = gs_vin.v2.xz * 0.4000000059604644775390625;
        vec2 _1497 = floor(_901 + vec2(dot(_901, vec2(0.3660254180431365966796875))));
        vec2 _1501 = (_901 - _1497) + vec2(dot(_1497, vec2(0.211324870586395263671875)));
        float _1502 = _1501.x;
        float _1503 = _1501.y;
        vec2 _2246 = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), bvec2(_1502 > _1503));
        vec4 _1509 = _1501.xyxy + vec4(0.211324870586395263671875, 0.211324870586395263671875, -0.57735025882720947265625, -0.57735025882720947265625);
        vec2 _1512 = _1509.xy - _2246;
        vec4 _1908 = _1509;
        _1908.x = _1512.x;
        _1908.y = _1512.y;
        vec2 _1517 = _1497 - vec2(289.0) * trunc(_1497 / vec2(289.0));
        vec3 _1523 = vec3(_1517.y) + vec3(0.0, _2246.y, 1.0);
        vec3 _1596 = ((_1523 * 34.0) + vec3(1.0)) * _1523;
        vec3 _1531 = ((_1596 - vec3(289.0) * trunc(_1596 / vec3(289.0))) + vec3(_1517.x)) + vec3(0.0, _2246.x, 1.0);
        vec3 _1603 = ((_1531 * 34.0) + vec3(1.0)) * _1531;
        vec3 _1547 = max(vec3(0.5) - vec3(dot(_1501, _1501), dot(_1908.xy, _1908.xy), dot(_1908.zw, _1908.zw)), vec3(0.0));
        vec3 _1548 = _1547 * _1547;
        vec3 _1552 = fract((_1603 - vec3(289.0) * trunc(_1603 / vec3(289.0))) * vec3(0.024390242993831634521484375)) * 2.0;
        vec3 _1554 = _1552 - vec3(1.0);
        vec3 _1557 = abs(_1554) - vec3(0.5);
        vec3 _1561 = _1554 - floor(_1552 + vec3(-0.5));
        _2153 = mix(_2028, vec3(0.699999988079071044921875), vec3(smoothstep(0.0, 1.0, smoothstep(-0.100000001490116119384765625, 0.0, gs_vin.v2.y) * clamp(_674.y, 0.0, 1.0)) * clamp(clamp((130.0 * dot((_1548 * _1548) * (vec3(1.792842864990234375) - (((_1561 * _1561) + (_1557 * _1557)) * 0.8537347316741943359375)), vec3((_1561.x * _1502) + (_1557.x * _1503), (_1561.yz * _1908.xz) + (_1557.yz * _1908.yw)))) + 0.75, 0.0, 1.0), _149 ? 0.0 : 0.4000000059604644775390625, _149 ? 0.100000001490116119384765625 : 1.0)));
    }
    else
    {
        _2153 = _2028;
    }
    vec3 _1616 = (_674 * 0.5) + vec3(0.5);
    vec3 _1724 = sqrt(clamp(_2153, vec3(0.0), vec3(1.0)));
    uint _1739 = (uint((clamp(_1724.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1724.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1724.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2233 = uvec2(((uint((clamp(_1616.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1616.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1616.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + 3422552064u, _1739);
    _2233.y = _1739 | (((7u | (uint(_155 ? true : _2100) << 3u)) | 128u) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _2233;
}


void fs_main(){fs_read_uniform_ColorLibraryData_natural();fs_read_uniform_FrameConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
