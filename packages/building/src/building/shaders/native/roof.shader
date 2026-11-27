Shader "BuildingUnit/roof/7b92145e02aebcd7" {
  SubShader "Default" {
    Pass "Forward" {
      VertexShader = vert;
      FragmentShader = frag;

      usampler2D storage_7_0;
      usampler2D storage_10_0;
      usampler2D uniform_ViewConstants_natural;
      vec4 renderer_DormerGrid;
      usampler2D uniform_FrameConstants_natural;
      usampler2D storage_8_1;
      usampler2D storage_9_1;
      usampler2D storage_9_0;
      sampler2DArray roof_colors_tex;
      sampler2D material_data_roof_tile_damage;
      sampler2D material_data_roof_tile_normal;
      mat4 renderer_MVPMat;

      struct BuildingAttributes {
        vec3 Vertex_Position;
        uvec4 instanceWords0;
        uvec4 instanceWords1;
        uvec4 instanceWords2;
        uvec4 instanceWords3;
        uint instanceVisible;
      };
      BuildingAttributes gs_attr;

      struct BuildingVaryings {
        flat uvec4 instanceRecord0;
        flat uvec4 instanceRecord1;
        flat uvec4 instanceRecord2;
        flat uvec4 instanceRecord3;
        vec3 v0;
        float v1;
        float v2;
        float v3;
        vec2 v4;
        flat vec4 v5;
        flat uint v6;
        float v7;
        vec2 v8;
      };
      BuildingVaryings gs_vin;

      uvec4 vs_out_instanceRecord0 = uvec4(0u);
      uvec4 vs_out_instanceRecord1 = uvec4(0u);
      uvec4 vs_out_instanceRecord2 = uvec4(0u);
      uvec4 vs_out_instanceRecord3 = uvec4(0u);
      vec3 vs_out_v0 = vec3(0.0);
      float vs_out_v1 = 0.0;
      float vs_out_v2 = 0.0;
      float vs_out_v3 = 0.0;
      vec2 vs_out_v4 = vec2(0.0);
      vec4 vs_out_v5 = vec4(0.0);
      uint vs_out_v6 = 0u;
      float vs_out_v7 = 0.0;
      vec2 vs_out_v8 = vec2(0.0);
      // --- Vertex Stage ---
struct vs_RoofShingle_natural
{
    vec3 base_position;
    float current_height;
    uvec2 clipping_plane_;
    uvec2 scale_t;
    uvec2 rotation_quat_;
    uint wall_slot_id;
    uint velocity_rotation;
    float animation_t;
    int seed;
    int is_circle;
    int is_main_roof_body;
};
float vs__3799 = 0.0;



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

ivec2 vs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 vs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 vs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}

uint vs_word_nani_instance_indirection_buffer(int p){ivec2 sz=textureSize(storage_7_0,0);return texelFetch(storage_7_0,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint vs_read_nani_instance_indirection_buffer(int i){return vs_word_nani_instance_indirection_buffer((i*1)+0);}

vs_RoofShingle_natural vs_read_material_data_nani_instance_data_1(int i){return vs_RoofShingle_natural(vec3(uintBitsToFloat(gs_attr.instanceWords0.x),uintBitsToFloat(gs_attr.instanceWords0.y),uintBitsToFloat(gs_attr.instanceWords0.z)),uintBitsToFloat(gs_attr.instanceWords0.w),uvec2(gs_attr.instanceWords1.x,gs_attr.instanceWords1.y),uvec2(gs_attr.instanceWords1.z,gs_attr.instanceWords1.w),uvec2(gs_attr.instanceWords2.x,gs_attr.instanceWords2.y),gs_attr.instanceWords2.z,gs_attr.instanceWords2.w,uintBitsToFloat(gs_attr.instanceWords3.x),int(gs_attr.instanceWords3.y),int(gs_attr.instanceWords3.z),int(gs_attr.instanceWords3.w));}
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
float vs_tgOpt_hash2f(uvec2 c){
  uint h = vs_tgOpt_mixU(c.x, vs_tgOpt_jenkins(c.y));
  return uintBitsToFloat((h & 8388607u) | 1065353216u) - 1.0;
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
    uint _54 = uint(gl_InstanceID);
uint es_h0=vs_read_nani_instance_indirection_buffer(int(_54));
vs_RoofShingle_natural es_h1=vs_read_material_data_nani_instance_data_1(int(es_h0));
    vec2 _1523 = unpackHalf2x16(es_h1.rotation_quat_.x);
    vec2 _1525 = unpackHalf2x16(es_h1.rotation_quat_.y);
    float _1530 = _1523.x;
    float _1531 = _1530 + _1530;
    float _1532 = _1523.y;
    float _1533 = _1532 + _1532;
    float _1534 = _1525.x;
    float _1535 = _1534 + _1534;
    float _1536 = _1530 * _1531;
    float _1537 = _1530 * _1533;
    float _1538 = _1530 * _1535;
    float _1539 = _1532 * _1533;
    float _1540 = _1532 * _1535;
    float _1541 = _1534 * _1535;
    float _1542 = _1525.y;
    float _1543 = _1542 * _1531;
    float _1544 = _1542 * _1533;
    float _1545 = _1542 * _1535;
    mat3x4 _1602 = transpose(mat4x3(vec3(1.0 - (_1539 + _1541), _1537 + _1545, _1538 - _1544), vec3(_1537 - _1545, 1.0 - (_1536 + _1541), _1540 + _1543), vec3(_1538 + _1544, _1540 - _1543, 1.0 - (_1536 + _1539)), es_h1.base_position));
    vec2 _1613 = unpackHalf2x16(es_h1.clipping_plane_.y);
    vec4 _1614 = vec4(unpackHalf2x16(es_h1.clipping_plane_.x), _1613);
    vec2 _1626 = unpackHalf2x16(es_h1.scale_t.y);
    float _1646 = _1626.y;
    bool is_main_roof_body = es_h1.is_main_roof_body != 0;
    vec3 _535 = (vec4(unpackHalf2x16(es_h1.scale_t.x), _1626).xyz * smoothstep(_1646 * 0.800000011920928955078125, _1646, pow(es_h1.animation_t, 0.800000011920928955078125))) * vec3(0.505970001220703125, 0.5, 0.5);
    float _539 = _535.x * 0.949999988079071044921875;
    vec3 _3764 = _535;
    _3764.x = _539;
    vec3 _545 = _3764 * vec3(3.58920383453369140625, 3.70370388031005859375, 3.70370388031005859375);
    float _558 = max(min(max(_539, max(_535.y, _535.z)), min(_545.x, min(_545.y, _545.z))), 9.9999997473787516355514526367188e-06);
    vec3 _563 = gs_attr.Vertex_Position * vec3(1.976401805877685546875, 2.0, 2.0);
    vec3 _564 = _563 * _558;
    vec2 _1653 = unpackHalf2x16(es_h1.velocity_rotation);
    float _1654 = _1653.y;
    vec3 _1658 = normalize(vec3(1.0, 0.0, 0.0));
    float _1659 = sin(_1654);
    float _1660 = cos(_1654);
    float _1661 = 1.0 - _1660;
    float _1663 = _1661 * _1658.x;
    float _1667 = _1663 * _1658.y;
    float _1669 = _1658.z * _1659;
    float _1671 = _1661 * _1658.z;
    float _1672 = _1671 * _1658.x;
    float _1673 = _1658.y * _1659;
    float _1676 = _1661 * _1658.y;
    float _1679 = _1676 * _1658.z;
    float _1680 = _1658.x * _1659;
    vec3 _632 = (_564 - ((vec3(_558) - _3764) * vec3(vs_tgMix(ivec3(-1), ivec3(1), greaterThanEqual(_564, vec3(0.0)))))) * transpose(mat3(vec3((_1663 * _1658.x) + _1660, _1667 - _1669, _1672 + _1673), vec3(_1667 + _1669, (_1676 * _1658.y) + _1660, _1679 - _1680), vec3(_1672 - _1673, _1679 + _1680, (_1671 * _1658.z) + _1660)));
    vec3 _3795;
    if (is_main_roof_body)
    {
        uint _649 = uint(es_h1.seed * 1664525) + vs_read_wall_identity_data_slot_wall_ids_1(int(es_h1.wall_slot_id));
        uint _1702 = _649 + (_649 << 10u);
        uint _1704 = _1702 ^ (_1702 >> 6u);
        uint _1706 = _1704 + (_1704 << 3u);
        uint _1708 = _1706 ^ (_1706 >> 11u);
        float _4120 = ((uintBitsToFloat(((_1708 + (_1708 << 15u)) & 8388607u) | 1065353216u) - 1.0) > 0.89999997615814208984375) ? 0.0199999995529651641845703125 : 0.0599999986588954925537109375;
        vec3 _3796;
        if (gs_attr.Vertex_Position.y > 0.100000001490116119384765625)
        {
            vec3 _3797;
            if (es_h1.is_circle != 0)
            {
                vec3 _3770 = _632;
                _3770.z = _632.z - _4120;
                _3797 = _3770;
            }
            else
            {
                vec3 _3767 = _632;
                _3767.z = _632.z + _4120;
                _3797 = _3767;
            }
            _3796 = _3797;
        }
        else
        {
            _3796 = _632;
        }
        _3795 = _3796;
    }
    else
    {
        _3795 = _632;
    }
    vec3 _3773 = _3795;
    _3773.z = _3795.z + ((1.0 - smoothstep(0.0, 0.800000011920928955078125, (vec4(_3795, 1.0) * _1602).y)) * 0.115000002086162567138671875);
    vec3 _732 = vec4(_3773, 1.0) * _1602;
    float _736 = _732.y;
    float _737 = _736 + es_h1.current_height;
    vec3 _3776 = _732;
    _3776.y = _737;
    vec3 _3833;
    if (is_main_roof_body)
    {
        vec2 _744 = _3776.xz * 0.5;
        ivec2 _1732 = ivec2(floor(_744));
        vec2 _1733 = fract(_744);
        float _3804 = vs_tgOpt_hash2f(uvec2(_1732));
        float _3811 = vs_tgOpt_hash2f(uvec2(_1732 + ivec2(1, 0)));
        float _3819 = vs_tgOpt_hash2f(uvec2(_1732 + ivec2(0, 1)));
        float _3828 = vs_tgOpt_hash2f(uvec2(_1732 + ivec2(1)));
        vec2 _2090 = (_1733 * _1733) * (vec2(3.0) - (vec2(2.0) * _1733));
        float _1765 = _2090.x;
        float _1766 = 1.0 - _1765;
        float _1768 = _2090.y;
        vec3 _3779 = _3776;
        _3779.y = _737 + ((((((1.0 - _1768) * ((_3804 * _1766) + (_3811 * _1765))) + ((_3819 * _1766) * _1768)) + ((_3828 * _1765) * _1768)) * 0.300000011920928955078125) * smoothstep(0.0, 1.0, _736));
        _3833 = _3779;
    }
    else
    {
        _3833 = _3776;
    }
    vec3 _2095 = _3833 * 0.4000000059604644775390625;
    ivec3 _2121 = ivec3(floor(_2095));
    vec3 _2122 = fract(_2095);
    vec2 _2110 = vs_tgOpt_hash3v2(uvec3(_2121));
    vec2 _2111 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(1, 0, 0)));
    vec2 _2112 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(0, 1, 0)));
    vec2 _2113 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(1, 1, 0)));
    vec2 _2114 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(0, 0, 1)));
    vec2 _2115 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(1, 0, 1)));
    vec2 _2116 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(0, 1, 1)));
    vec2 _2117 = vs_tgOpt_hash3v2(uvec3(_2121 + ivec3(1)));
    vec3 _3033 = (_2122 * _2122) * (vec3(3.0) - (vec3(2.0) * _2122));
    float _2186 = _3033.x;
    float _2187 = 1.0 - _2186;
    float _2189 = _3033.y;
    float _2190 = 1.0 - _2189;
    float _2192 = _3033.z;
    float _2193 = 1.0 - _2192;
    vec2 _2100 = clamp((((((((((((_2110 * _2187) * _2190) * _2193) + (((_2111 * _2186) * _2190) * _2193)) + (((_2112 * _2187) * _2189) * _2193)) + (((_2113 * _2186) * _2189) * _2193)) + (((_2114 * _2187) * _2190) * _2192)) + (((_2115 * _2186) * _2190) * _2192)) + (((_2116 * _2187) * _2189) * _2192)) + (((_2117 * _2186) * _2189) * _2192)) - vec2(0.5)) * 2.5, vec2(-0.5), vec2(0.5));
    vec3 _1185 = _3833 + (vec3(_2100.x, 0.0, _2100.y) * 0.0599999986588954925537109375);
    vec2 _1187 = _1185.xz;
    uint _1235 = uint(es_h1.seed ^ 787234);
    uint _3043 = _1235 + (_1235 << 10u);
    uint _3045 = _3043 ^ (_3043 >> 6u);
    uint _3047 = _3045 + (_3045 << 3u);
    uint _3049 = _3047 ^ (_3047 >> 11u);
    vec2 _1238 = _1187 + vec2(uintBitsToFloat(((_3049 + (_3049 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    ivec2 _3073 = ivec2(floor(_1238));
    vec2 _3074 = fract(_1238);
    float _3969 = vs_tgOpt_hash2f(uvec2(_3073));
    float _3989 = vs_tgOpt_hash2f(uvec2(_3073 + ivec2(1, 0)));
    float _4010 = vs_tgOpt_hash2f(uvec2(_3073 + ivec2(0, 1)));
    float _4032 = vs_tgOpt_hash2f(uvec2(_3073 + ivec2(1)));
    vec2 _3431 = (_3074 * _3074) * (vec2(3.0) - (vec2(2.0) * _3074));
    float _3106 = _3431.x;
    float _3107 = 1.0 - _3106;
    float _3109 = _3431.y;
    vec2 _1266 = ((_1187 * 0.2860000133514404296875) * 0.5) + ((_1185.yy * 0.2860000133514404296875) * 0.5);
    vec2 _3442 = floor(_1266 + vec2(dot(_1266, vec2(0.3660254180431365966796875))));
    vec2 _3446 = (_1266 - _3442) + vec2(dot(_3442, vec2(0.211324870586395263671875)));
    float _3447 = _3446.x;
    float _3448 = _3446.y;
    vec2 _4123 = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), bvec2(_3447 > _3448));
    vec4 _3454 = _3446.xyxy + vec4(0.211324870586395263671875, 0.211324870586395263671875, -0.57735025882720947265625, -0.57735025882720947265625);
    vec2 _3457 = _3454.xy - _4123;
    vec4 _3781 = _3454;
    _3781.x = _3457.x;
    _3781.y = _3457.y;
    vec2 _3462 = _3442 - vec2(289.0) * trunc(_3442 / vec2(289.0));
    vec3 _3468 = vec3(_3462.y) + vec3(0.0, _4123.y, 1.0);
    vec3 _3541 = ((_3468 * 34.0) + vec3(1.0)) * _3468;
    vec3 _3476 = ((_3541 - vec3(289.0) * trunc(_3541 / vec3(289.0))) + vec3(_3462.x)) + vec3(0.0, _4123.x, 1.0);
    vec3 _3548 = ((_3476 * 34.0) + vec3(1.0)) * _3476;
    vec3 _3492 = max(vec3(0.5) - vec3(dot(_3446, _3446), dot(_3781.xy, _3781.xy), dot(_3781.zw, _3781.zw)), vec3(0.0));
    vec3 _3493 = _3492 * _3492;
    vec3 _3497 = fract((_3548 - vec3(289.0) * trunc(_3548 / vec3(289.0))) * vec3(0.024390242993831634521484375)) * 2.0;
    vec3 _3499 = _3497 - vec3(1.0);
    vec3 _3502 = abs(_3499) - vec3(0.5);
    vec3 _3506 = _3499 - floor(_3497 + vec3(-0.5));
    _1614.w = _1613.y + dot(_732 - _1185, _1614.xyz);
    int _1427 = es_h1.seed * 1664525;
    uint _1428 = uint(_1427);
    uint _3557 = _1428 + (_1428 << 10u);
    uint _3559 = _3557 ^ (_3557 >> 6u);
    uint _3561 = _3559 + (_3559 << 3u);
    uint _3563 = _3561 ^ (_3561 >> 11u);
    uint _1436 = uint(_1427 + 34568);
    uint _3579 = _1436 + (_1436 << 10u);
    uint _3581 = _3579 ^ (_3579 >> 6u);
    uint _3583 = _3581 + (_3581 << 3u);
    uint _3585 = _3583 ^ (_3583 >> 11u);
    vec2 _1452 = vec2(round((uintBitsToFloat(((_3563 + (_3563 << 15u)) & 8388607u) | 1065353216u) - 1.0) * 5.0) * 0.20000000298023223876953125, round((uintBitsToFloat(((_3585 + (_3585 << 15u)) & 8388607u) | 1065353216u) - 1.0) * 5.0) * 0.20000000298023223876953125);
    float _4079;
    if (!is_main_roof_body)
    {
        _4079 = clamp(_736 * 0.0500000007450580596923828125, 0.0, 1.0) * 0.699999988079071044921875;
    }
    else
    {
        _4079 = _1646;
    }
    gl_Position = renderer_MVPMat * vec4(_1185, 1.0);
    vs_out_v0 = _1185.xyz;
    vs_out_v1 = pow(fract((((1.0 - _3109) * ((_3969 * _3107) + (_3989 * _3106))) + ((_4010 * _3107) * _3109)) + ((_4032 * _3106) * _3109)), 1.5);
    vs_out_v2 = dot((_3493 * _3493) * (vec3(1.792842864990234375) - (((_3506 * _3506) + (_3502 * _3502)) * 0.8537347316741943359375)), vec3((_3506.x * _3447) + (_3502.x * _3448), (_3506.yz * _3781.xz) + (_3502.yz * _3781.yw))) * 32.5;
    vs_out_v3 = _4079;
    vs_out_v4 = (((gs_attr.Vertex_Position.xy * vec2(0.85000002384185791015625, 0.920000016689300537109375)) + vec2(0.5)) * 0.20000000298023223876953125) + _1452;
    vs_out_v5 = _1614;
    vs_out_v6 = es_h0;
    vs_out_v7 = _563.z;
    vs_out_v8 = (((gs_attr.Vertex_Position.yz * vec2(0.800000011920928955078125, 0.89999997615814208984375)) + vec2(0.5)) * 0.20000000298023223876953125) + _1452;
}


void vs_main(){vs_original_main();vs_out_instanceRecord0=gs_attr.instanceWords0;vs_out_instanceRecord1=gs_attr.instanceWords1;vs_out_instanceRecord2=gs_attr.instanceWords2;vs_out_instanceRecord3=gs_attr.instanceWords3;if(gs_attr.instanceVisible==0u)gl_Position=vec4(2.0,2.0,2.0,1.0);}

      BuildingVaryings vert(BuildingAttributes _gs_attr_in) {
        vs_main();
        BuildingVaryings _gs_vout;
        _gs_vout.instanceRecord0 = vs_out_instanceRecord0;
        _gs_vout.instanceRecord1 = vs_out_instanceRecord1;
        _gs_vout.instanceRecord2 = vs_out_instanceRecord2;
        _gs_vout.instanceRecord3 = vs_out_instanceRecord3;
        _gs_vout.v0 = vs_out_v0;
        _gs_vout.v1 = vs_out_v1;
        _gs_vout.v2 = vs_out_v2;
        _gs_vout.v3 = vs_out_v3;
        _gs_vout.v4 = vs_out_v4;
        _gs_vout.v5 = vs_out_v5;
        _gs_vout.v6 = vs_out_v6;
        _gs_vout.v7 = vs_out_v7;
        _gs_vout.v8 = vs_out_v8;
        return _gs_vout;
      }

      // --- Fragment Stage ---
struct fs_RoofShingle_natural
{
    vec3 base_position;
    float current_height;
    uvec2 clipping_plane_;
    uvec2 scale_t;
    uvec2 rotation_quat_;
    uint wall_slot_id;
    uint velocity_rotation;
    float animation_t;
    int seed;
    int is_circle;
    int is_main_roof_body;
};

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
bool fs__1996 = false;
vec4 fs__2176 = vec4(0.0);





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
uvec2 fs_entryPointParam_ps_main_gbuffer = uvec2(0u);

ivec2 fs_tgMix(ivec2 a, ivec2 b, bvec2 t){return ivec2(t[0]?b[0]:a[0],t[1]?b[1]:a[1]);}
ivec3 fs_tgMix(ivec3 a, ivec3 b, bvec3 t){return ivec3(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2]);}
ivec4 fs_tgMix(ivec4 a, ivec4 b, bvec4 t){return ivec4(t[0]?b[0]:a[0],t[1]?b[1]:a[1],t[2]?b[2]:a[2],t[3]?b[3]:a[3]);}
float fs_tgDdy(float x){return -dFdy(x);}
vec2 fs_tgDdy(vec2 x){return -dFdy(x);}
vec3 fs_tgDdy(vec3 x){return -dFdy(x);}
vec4 fs_tgDdy(vec4 x){return -dFdy(x);}

fs_RoofShingle_natural fs_read_material_data_nani_instance_data(int i){return fs_RoofShingle_natural(vec3(uintBitsToFloat(gs_vin.instanceRecord0.x),uintBitsToFloat(gs_vin.instanceRecord0.y),uintBitsToFloat(gs_vin.instanceRecord0.z)),uintBitsToFloat(gs_vin.instanceRecord0.w),uvec2(gs_vin.instanceRecord1.x,gs_vin.instanceRecord1.y),uvec2(gs_vin.instanceRecord1.z,gs_vin.instanceRecord1.w),uvec2(gs_vin.instanceRecord2.x,gs_vin.instanceRecord2.y),gs_vin.instanceRecord2.z,gs_vin.instanceRecord2.w,uintBitsToFloat(gs_vin.instanceRecord3.x),int(gs_vin.instanceRecord3.y),int(gs_vin.instanceRecord3.z),int(gs_vin.instanceRecord3.w));}
uint fs_word_roof_colors_ids_1(int p){ivec2 sz=textureSize(storage_8_1,0);return texelFetch(storage_8_1,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_roof_colors_ids_1(int i){return fs_word_roof_colors_ids_1((i*1)+0);}
uint fs_word_data_count_1(int p){ivec2 sz=textureSize(storage_9_1,0);return texelFetch(storage_9_1,ivec2((p/4)%sz.x,(p/4)/sz.x),0)[p%4];}
uint fs_read_data_count_1(int i){return fs_word_data_count_1((i*1)+0);}

fs_DormerHole_natural fs_read_data_holes_1(int i){ivec2 es_s=textureSize(storage_9_0,0);int es_b=i*3;uvec4 es_t0=texelFetch(storage_9_0,ivec2(es_b%es_s.x,es_b/es_s.x),0);uvec4 es_t1=texelFetch(storage_9_0,ivec2((es_b+1)%es_s.x,(es_b+1)/es_s.x),0);uvec4 es_t2=texelFetch(storage_9_0,ivec2((es_b+2)%es_s.x,(es_b+2)/es_s.x),0);return fs_DormerHole_natural(vec3(uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t0.y),uintBitsToFloat(es_t0.z)),int(es_t0.w),vec3(uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t1.y),uintBitsToFloat(es_t1.z)),int(es_t1.w),vec2(uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t2.y)),uintBitsToFloat(es_t2.z),uintBitsToFloat(es_t2.w));}
void fs_read_uniform_FrameConstants_natural(){
ivec2 es_s=textureSize(uniform_FrameConstants_natural,0);
uvec4 es_t8=texelFetch(uniform_FrameConstants_natural,ivec2(8%es_s.x,8/es_s.x),0);
uvec4 es_t18=texelFetch(uniform_FrameConstants_natural,ivec2(18%es_s.x,18/es_s.x),0);
fs_frame_constants.glade_theme_id=es_t8.w;
fs_frame_constants.roof_highlighted_slot_id=es_t18.x;
fs_frame_constants.roof_highlight_mode=es_t18.y;
}
void fs_read_uniform_ViewConstants_natural(){
ivec2 es_s=textureSize(uniform_ViewConstants_natural,0);
uvec4 es_t63=texelFetch(uniform_ViewConstants_natural,ivec2(63%es_s.x,63/es_s.x),0);
fs_current_view.mip_bias=uintBitsToFloat(es_t63.w);
}
void fs_original_main()
{
    bool _1965;
fs_RoofShingle_natural es_h0=fs_read_material_data_nani_instance_data(int(gs_vin.v6));
    if (1u == fs_frame_constants.roof_highlight_mode)
    {
        _1965 = es_h0.wall_slot_id == fs_frame_constants.roof_highlighted_slot_id;
    }
    else
    {
        _1965 = false;
    }
    bool _1967;
    if (2u == fs_frame_constants.roof_highlight_mode)
    {
        _1967 = es_h0.wall_slot_id == fs_frame_constants.roof_highlighted_slot_id;
    }
    else
    {
        _1967 = false;
    }
    vec3 _1289 = dFdx(gs_vin.v0);
    vec3 _1296 = fs_tgDdy(gs_vin.v0);
    vec3 _286 = normalize(cross(_1289, _1296 * (-1.0)));
    if (dot(vec4(gs_vin.v0, 1.0), gs_vin.v5) < 0.0)
    {
        discard;
    }
    if (es_h0.is_main_roof_body != 0)
    {
        int _312 = int(es_h0.wall_slot_id);
        bool _1990;
        for (int _gs_once_0 = 0; _gs_once_0 < 1; _gs_once_0++) {
            vec2 _1424 = ((gs_vin.v0.xz - renderer_DormerGrid.xy) * renderer_DormerGrid.zw);
            int _1433 = int(floor(_1424.x)) + (15 * int(floor(_1424.y)));
            uint _1316 = min(128u, fs_read_data_count_1(int(_1433)));
            uint _1411;
            bool _1983;
            bool _1991;
            uint _1973 = 0u;
            for (; true; )
            {
                if (!(_1973 < _1316))
                {
                    _1991 = fs__1996;
                    _1983 = false;
                    break;
                }
                int _1329 = int(uint(_1433 * 50) + _1973);
fs_DormerHole_natural es_h2=fs_read_data_holes_1(int(_1329));
                if (_312 == es_h2.wall_slot_id)
                {
                    vec3 _1360 = vec3(es_h2.normal.x, 0.0, es_h2.normal.y);
                    mat3 _1370 = transpose(mat3(cross(_1360, vec3(0.0, 1.0, 0.0)), vec3(0.0, 1.0, 0.0), _1360));
                    vec3 _1448 = vec3(1.0, 0.0, 0.0) * _1370;
                    vec3 _1449 = vec3(0.0, 1.0, 0.0) * _1370;
                    vec3 _1450 = vec3(0.0, 0.0, 1.0) * _1370;
                    vec3 _1453 = cross(_1448, _1449);
                    vec3 _1456 = vec3(1.0 / dot(_1450, _1453));
                    vec3 _1374 = (mat3(cross(_1449, _1450) * _1456, cross(_1450, _1448) * _1456, _1453 * _1456) * (gs_vin.v0 - es_h2.position)) / es_h2.size;
                    float _1375 = _1374.y;
                    float _1378 = clamp((_1375 * es_h2.k) + es_h2.a, 0.0, 1.0);
                    bool _1975;
                    if (abs(_1374.x) < mix(0.5, 0.0, (_1378 * _1378) * _1378))
                    {
                        bool _1976;
                        if (_1375 < ((es_h2.k == 1.0) ? 0.5 : 0.699999988079071044921875))
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
                    if (_1977)
                    {
                        _1991 = true;
                        _1983 = true;
                        break;
                    }
                }
                _1411 = _1973 + 1u;
                _1973 = _1411;
                continue;
            }
            if (_1983)
            {
                _1990 = _1991;
                break;
            }
            _1990 = false;
            break;
        }
        if (_1990)
        {
            discard;
        }
    }
uint es_h1=fs_read_roof_colors_ids_1(int(es_h0.wall_slot_id));
    bool _552 = es_h1 == 10u;
    vec4 sampled = texture(roof_colors_tex, vec3(gs_vin.v0.xz * 0.20000000298023223876953125, float(_552 ? 7 : 1)));
    vec3 dmg_color = (sampled.xyz * 0.60000002384185791015625) * 1.5;
    bool _584 = es_h1 == 0u;
    bool _2003;
    if (_584)
    {
        _2003 = true;
    }
    else
    {
        _2003 = es_h1 == 8u;
    }
    bool _2004;
    if (_2003)
    {
        _2004 = true;
    }
    else
    {
        _2004 = es_h1 == 7u;
    }
    bool _2005;
    if (_2004)
    {
        _2005 = true;
    }
    else
    {
        _2005 = es_h1 == 6u;
    }
    vec3 _2072;
    if (_2005)
    {
        _2072 = dmg_color * 1.5;
    }
    else
    {
        vec3 _2073;
        if (es_h1 == 1u)
        {
            _2073 = dmg_color * 0.3499999940395355224609375;
        }
        else
        {
            vec3 _2074;
            if (es_h1 == 12u)
            {
                _2074 = dmg_color * 0.5;
            }
            else
            {
                _2074 = dmg_color;
            }
            _2073 = _2074;
        }
        _2072 = _2073;
    }
    bool _2006;
    if (es_h1 == 2u)
    {
        _2006 = true;
    }
    else
    {
        _2006 = es_h1 == 3u;
    }
    bool _2007;
    if (_2006)
    {
        _2007 = true;
    }
    else
    {
        _2007 = es_h1 == 4u;
    }
    bool _2008;
    if (_2007)
    {
        _2008 = true;
    }
    else
    {
        _2008 = es_h1 == 6u;
    }
    bool _2009;
    if (_2008)
    {
        _2009 = true;
    }
    else
    {
        _2009 = es_h1 == 9u;
    }
    float _2018;
    if (_2009 ? true : _552)
    {
        _2018 = 0.5;
    }
    else
    {
        bool _2011;
        if (_584)
        {
            _2011 = true;
        }
        else
        {
            _2011 = es_h1 == 5u;
        }
        bool _2012;
        if (_2011)
        {
            _2012 = true;
        }
        else
        {
            _2012 = es_h1 == 7u;
        }
        bool _2013;
        if (_2012)
        {
            _2013 = true;
        }
        else
        {
            _2013 = es_h1 == 8u;
        }
        float _2019;
        if (_2013)
        {
            _2019 = 1.0;
        }
        else
        {
            _2019 = (es_h1 == 1u) ? 2.0 : 0.75;
        }
        _2018 = _2019;
    }
    bool _2014;
    if (gs_vin.v7 > (-0.949999988079071044921875))
    {
        _2014 = gs_vin.v7 < 0.89999997615814208984375;
    }
    else
    {
        _2014 = false;
    }
    vec2 _2015;
    if (_2014)
    {
        _2015 = gs_vin.v8;
    }
    else
    {
        _2015 = gs_vin.v4;
    }
    vec4 sampled_1 = texture(material_data_roof_tile_damage, _2015, fs_current_view.mip_bias);
    float roof_dmg_tex_sample = 1.0 - sampled_1.x;
    float roof_dmg_mask = roof_dmg_tex_sample * gs_vin.v1;
    vec3 in_p = gs_vin.v0 * 0.100000001490116119384765625;
    vec3 _2055;
    if (roof_dmg_mask > 0.00999999977648258209228515625)
    {
        uint _766 = uint(es_h0.seed ^ 2834);
        uint _1472 = _766 + (_766 << 10u);
        uint _1474 = _1472 ^ (_1472 >> 6u);
        uint _1476 = _1474 + (_1474 << 3u);
        uint _1478 = _1476 ^ (_1476 >> 11u);
        _2055 = in_p + vec3(uintBitsToFloat(((_1478 + (_1478 << 15u)) & 8388607u) | 1065353216u) - 1.0);
    }
    else
    {
        _2055 = in_p;
    }
    uint _811 = uint(es_h0.seed ^ 34534);
    uint _1494 = _811 + (_811 << 10u);
    uint _1496 = _1494 ^ (_1494 >> 6u);
    uint _1498 = _1496 + (_1496 << 3u);
    uint _1500 = _1498 ^ (_1498 >> 11u);
    vec3 _2056;
    if ((uintBitsToFloat(((_1500 + (_1500 << 15u)) & 8388607u) | 1065353216u) - 1.0) < 0.5)
    {
        uint _817 = uint(es_h0.seed ^ 234);
        uint _1516 = _817 + (_817 << 10u);
        uint _1518 = _1516 ^ (_1516 >> 6u);
        uint _1520 = _1518 + (_1518 << 3u);
        uint _1522 = _1520 ^ (_1520 >> 11u);
        _2056 = _2055 + vec3((uintBitsToFloat(((_1522 + (_1522 << 15u)) & 8388607u) | 1065353216u) - 1.0) * 0.4000000059604644775390625);
    }
    else
    {
        _2056 = _2055;
    }
    float _828 = float(es_h1);
    vec4 sampled_2 = texture(roof_colors_tex, vec3(_2056.zy, _828));
    vec3 x = sampled_2.xyz;
    vec4 sampled_3 = texture(roof_colors_tex, vec3(_2056.xy, _828));
    vec3 z = sampled_3.xyz;
    vec3 _850 = pow(abs(_286), vec3(1.0));
    float _1535 = dot(x, vec3(0.2125999927520751953125, 0.715200006961822509765625, 0.072200000286102294921875)) + _850.x;
    float _1536 = dot(z, vec3(0.2125999927520751953125, 0.715200006961822509765625, 0.072200000286102294921875)) + _850.z;
    float _1538 = max(_1535, _1536) - 0.20000000298023223876953125;
    float _1540 = max(_1535 - _1538, 0.0);
    float _1542 = max(_1536 - _1538, 0.0);
    vec3 texture_value = (((x * _1540) + (z * _1542)) / vec3(_1540 + _1542)) * 0.60000002384185791015625;
    vec3 _974 = mix(mix(texture_value * 0.89999997615814208984375, texture_value * 1.2999999523162841796875, vec3(clamp(1.0 - (gs_vin.v1 * 3.0), 0.0, 1.0))), _2072, vec3(clamp((clamp(roof_dmg_mask * 5.0, 0.0, 1.0) * _2018) + gs_vin.v2, 0.0, 1.0)));
    vec3 _978 = mix(_974, _974 * 0.89999997615814208984375, vec3(roof_dmg_mask));
    vec3 _2075;
    if (_1965)
    {
        _2075 = mix(_978, vec3(0.300000011920928955078125, 0.0900000035762786865234375, 0.0), vec3(0.5));
    }
    else
    {
        _2075 = _978;
    }
    bool _998 = int(_1967) == 1;
    vec3 _2077;
    if (_998)
    {
        _2077 = mix(_2075, vec3(0.5), vec3(0.100000001490116119384765625));
    }
    else
    {
        _2077 = _2075;
    }
    vec3 _2116;
    if (gs_vin.v7 > 0.999000012874603271484375)
    {
        vec2 _1626 = dFdx(gs_vin.v4);
        vec2 _1630 = fs_tgDdy(gs_vin.v4) * (-1.0);
        vec3 _1594 = cross(_286, fs_tgDdy(gs_vin.v0) * (-1.0));
        vec3 _1595 = cross(dFdx(gs_vin.v0), _286);
        float _1596 = _1626.x;
        float _1597 = _1630.y;
        float _1599 = _1626.y;
        float _1600 = _1630.x;
        float _1603 = 1.0 / ((_1596 * _1597) - (_1599 * _1600));
        _2116 = normalize(((texture(material_data_roof_tile_normal, gs_vin.v4, fs_current_view.mip_bias).xyz * 2.0) - vec3(1.0)) * transpose(mat3(((_1594 * _1596) + (_1595 * _1600)) * _1603, ((_1594 * _1599) + (_1595 * _1597)) * _1603, _286)));
    }
    else
    {
        _2116 = _286;
    }
    vec3 _2110;
    if (fs_frame_constants.glade_theme_id == 4u)
    {
        _2110 = mix(_2077, vec3(0.699999988079071044921875), vec3((smoothstep(0.100000001490116119384765625, 1.0, gs_vin.v3) * 0.5) + ((roof_dmg_tex_sample * 0.5) * smoothstep(0.0, 0.5, gs_vin.v3))));
    }
    else
    {
        _2110 = _2077;
    }
    vec3 _1650 = (_2116 * 0.5) + vec3(0.5);
    vec3 _1758 = sqrt(clamp(_2110, vec3(0.0), vec3(1.0)));
    uint _1773 = (uint((clamp(_1758.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1758.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1758.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16));
    uvec2 _2175 = uvec2(((uint((clamp(_1650.x, 0.0, 1.0) * 255.0) + 0.5) + (uint((clamp(_1650.y, 0.0, 1.0) * 255.0) + 0.5) << uint(8))) + (uint((clamp(_1650.z, 0.0, 1.0) * 255.0) + 0.5) << uint(16))) + (uint((clamp(mix(0.73500001430511474609375, 1.0, roof_dmg_mask), 0.0, 1.0) * 255.0) + 0.5) << uint(24)), _1773);
    _2175.y = _1773 | ((7u | (uint(_998 ? true : (_1965 ? true : false)) << 3u)) << 24u);
    fs_entryPointParam_ps_main_gbuffer = _2175;
}


void fs_main(){fs_read_uniform_FrameConstants_natural();fs_read_uniform_ViewConstants_natural();fs_original_main();uint c=fs_entryPointParam_ps_main_gbuffer.y;vec3 v=vec3(c&255u,(c>>8u)&255u,(c>>16u)&255u)/255.0;v*=v;gl_FragColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}

      void frag() {
        fs_main();
      }
    }
  }
}
