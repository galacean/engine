import { constructionLanternGLSL } from "./ConstructionLanternShader";
import { decorationMaterialStride } from "./ConstructionDecorationMaterial";
/** Native window material functions, adapted from shipped SPIR-V (window.1 and
 * window_glass.1). Native G-buffer packing is replaced by the existing host light.
 * Curtains/indoors are deliberately the shipped think/aww resources: retained
 * glass-native-material-binding.json verifies those names; coarse gradients and
 * mip 4.5 are part of the original shader, not placeholder substitutions.
 * Glass color is the native default palette 0; exposure belongs to scene lighting.
 * SPIR-V single-iteration loops are unrolled and do/while(false) lowered to if/else
 * for the host shader parser; operation order and boundary comparisons are unchanged.
 */
export const constructionDecorationGLSL = `
${constructionLanternGLSL}
uniform highp sampler2DArray material_WindowTimber;
uniform highp sampler2D material_WindowCurtains;
uniform highp sampler2D material_WindowIndoors;
uniform highp sampler2D material_WindowGlass;
vec3 masonryWindowGlass(vec3 positionWS,vec3 centerWS,vec3 sourceColor,vec3 cameraWS,
 float lightIntensity,bool glass,inout vec3 normal,out vec3 emission,out float roughness){
    bool _2306=glass;
    vec3 _2305=sourceColor;
    uint colorId=0u;
    vec3 _2453=vec3(0.0);
    float _2310=0.0;
    vec3 _1094 = dFdx(positionWS);
    vec3 _1101 = dFdy(positionWS);
    vec3 _328 = normalize(cross(_1094, _1101 * (-1.0)));
    if(dot(_328, normal) < 0.0) _328 = -_328;
    vec3 _2598;
    if (_2306)
    {
        vec3 _346 = vec3(-_328.z, 0.0, _328.x);
        vec4 _1106 = vec4(cameraWS, 1.0);
        vec3 _365 = normalize(positionWS - (_1106.xyz / vec3(_1106.w)));
        float _1135 = dot(_365, _328);
        _1135 = sign(_1135 == 0.0 ? 1.0 : _1135) * max(abs(_1135), 0.0001);
        vec3 hit_offset = (positionWS + (_365 * (dot((centerWS - (_328 * 0.20000000298023223876953125)) - positionWS, _328) / _1135))) - centerWS;
        float _424 = dot(hit_offset, _346);
        float _425 = hit_offset.y;
        vec2 _446 = vec2(((_424 - (_425 * (-0.300000011920928955078125))) + centerWS.x) + centerWS.y);
        ivec2 _1149 = ivec2(floor(_446));
        vec2 _1150 = fract(_446);
        uvec2 _1151 = uvec2(_1149);
        uint _1201 = _1151.y;
        uint _1207 = _1201 + (_1201 << 10u);
        uint _1209 = _1207 ^ (_1207 >> 6u);
        uint _1211 = _1209 + (_1209 << 3u);
        uint _1213 = _1211 ^ (_1211 >> 11u);
        uint _1221 = (((_1151.x * 1664525u) + (_1213 + (_1213 << 15u))) + 1013904223u) * 1664525u;
        uint _1223 = _1221 ^ (_1221 >> 11u);
        uint _1226 = _1223 ^ ((_1223 << 7u) & 2636928640u);
        uint _1229 = _1226 ^ ((_1226 << 15u) & 4022730752u);
        uint _1231 = _1229 ^ (_1229 >> 18u);
        float _2314;
        _2314 = _2310;
        uint _1248;
        uint _1267;
        float _1273;
        uint _2313 = 0u;
        uint _2684 = _1231;
        {
            uint _1259 = _2684 + (_2684 << 10u);
            uint _1261 = _1259 ^ (_1259 >> 6u);
            uint _1263 = _1261 + (_1261 << 3u);
            uint _1265 = _1263 ^ (_1263 >> 11u);
            _1267 = _1265 + (_1265 << 15u);
            _1273 = uintBitsToFloat((_2684 & 8388607u) | 1065353216u) - 1.0;
            _1248 = _2313 + 1u;
            _2684 = _1267;
            _2314 = _1273;
            _2313 = _1248;
        }
        uvec2 _1159 = uvec2(_1149 + ivec2(1, 0));
        uint _1277 = _1159.y;
        uint _1283 = _1277 + (_1277 << 10u);
        uint _1285 = _1283 ^ (_1283 >> 6u);
        uint _1287 = _1285 + (_1285 << 3u);
        uint _1289 = _1287 ^ (_1287 >> 11u);
        uint _1297 = (((_1159.x * 1664525u) + (_1289 + (_1289 << 15u))) + 1013904223u) * 1664525u;
        uint _1299 = _1297 ^ (_1297 >> 11u);
        uint _1302 = _1299 ^ ((_1299 << 7u) & 2636928640u);
        uint _1305 = _1302 ^ ((_1302 << 15u) & 4022730752u);
        uint _1307 = _1305 ^ (_1305 >> 18u);
        float _2321;
        _2321 = _2310;
        uint _1324;
        uint _1343;
        float _1349;
        uint _2320 = 0u;
        uint _2683 = _1307;
        {
            uint _1335 = _2683 + (_2683 << 10u);
            uint _1337 = _1335 ^ (_1335 >> 6u);
            uint _1339 = _1337 + (_1337 << 3u);
            uint _1341 = _1339 ^ (_1339 >> 11u);
            _1343 = _1341 + (_1341 << 15u);
            _1349 = uintBitsToFloat((_2683 & 8388607u) | 1065353216u) - 1.0;
            _1324 = _2320 + 1u;
            _2683 = _1343;
            _2321 = _1349;
            _2320 = _1324;
        }
        uvec2 _1166 = uvec2(_1149 + ivec2(0, 1));
        uint _1353 = _1166.y;
        uint _1359 = _1353 + (_1353 << 10u);
        uint _1361 = _1359 ^ (_1359 >> 6u);
        uint _1363 = _1361 + (_1361 << 3u);
        uint _1365 = _1363 ^ (_1363 >> 11u);
        uint _1373 = (((_1166.x * 1664525u) + (_1365 + (_1365 << 15u))) + 1013904223u) * 1664525u;
        uint _1375 = _1373 ^ (_1373 >> 11u);
        uint _1378 = _1375 ^ ((_1375 << 7u) & 2636928640u);
        uint _1381 = _1378 ^ ((_1378 << 15u) & 4022730752u);
        uint _1383 = _1381 ^ (_1381 >> 18u);
        float _2329;
        _2329 = _2310;
        uint _1400;
        uint _1419;
        float _1425;
        uint _2328 = 0u;
        uint _2682 = _1383;
        {
            uint _1411 = _2682 + (_2682 << 10u);
            uint _1413 = _1411 ^ (_1411 >> 6u);
            uint _1415 = _1413 + (_1413 << 3u);
            uint _1417 = _1415 ^ (_1415 >> 11u);
            _1419 = _1417 + (_1417 << 15u);
            _1425 = uintBitsToFloat((_2682 & 8388607u) | 1065353216u) - 1.0;
            _1400 = _2328 + 1u;
            _2682 = _1419;
            _2329 = _1425;
            _2328 = _1400;
        }
        uvec2 _1174 = uvec2(_1149 + ivec2(1));
        uint _1429 = _1174.y;
        uint _1435 = _1429 + (_1429 << 10u);
        uint _1437 = _1435 ^ (_1435 >> 6u);
        uint _1439 = _1437 + (_1437 << 3u);
        uint _1441 = _1439 ^ (_1439 >> 11u);
        uint _1449 = (((_1174.x * 1664525u) + (_1441 + (_1441 << 15u))) + 1013904223u) * 1664525u;
        uint _1451 = _1449 ^ (_1449 >> 11u);
        uint _1454 = _1451 ^ ((_1451 << 7u) & 2636928640u);
        uint _1457 = _1454 ^ ((_1454 << 15u) & 4022730752u);
        uint _1459 = _1457 ^ (_1457 >> 18u);
        float _2338;
        _2338 = _2310;
        uint _1476;
        uint _1495;
        float _1501;
        uint _2337 = 0u;
        uint _2681 = _1459;
        {
            uint _1487 = _2681 + (_2681 << 10u);
            uint _1489 = _1487 ^ (_1487 >> 6u);
            uint _1491 = _1489 + (_1489 << 3u);
            uint _1493 = _1491 ^ (_1491 >> 11u);
            _1495 = _1493 + (_1493 << 15u);
            _1501 = uintBitsToFloat((_2681 & 8388607u) | 1065353216u) - 1.0;
            _1476 = _2337 + 1u;
            _2681 = _1495;
            _2338 = _1501;
            _2337 = _1476;
        }
        vec2 _1507 = (_1150 * _1150) * (vec2(3.0) - (vec2(2.0) * _1150));
        float _1182 = _1507.x;
        float _1183 = 1.0 - _1182;
        float _1185 = _1507.y;
        float _658 = _424 + ((((((1.0 - _1185) * ((_2314 * _1183) + (_2321 * _1182))) + ((_2329 * _1183) * _1185)) + ((_2338 * _1182) * _1185)) - 0.5) * 0.300000011920928955078125);
        float _2347;
        float _1516 = abs(max(0.0, abs(_658) - 0.3549999892711639404296875));
        if (_1516 > 0.100000001490116119384765625) {
            _2347 = 0.0;
        } else {
            float _1520 = _1516 * 10.0;
            _2347 = 1.0 - ((_1520 * _1520) * (3.0 - (_1516 * 20.0)));
        }
        vec4 _715 = vec4(sqrt(textureGrad(material_WindowCurtains, vec2(_658, _425 * (-1.0)) * vec2(3.0, 1.0), vec2(0.001000000047497451305389404296875, 0.0), vec2(0.0, 0.4000000059604644775390625)).xyz), 1.0) * (1.0 - _2347);
        vec3 hit_offset_1 = (positionWS + (_365 * (dot((centerWS - (_328 * 1.2000000476837158203125)) - positionWS, _328) / _1135))) - centerWS;
        float _733 = dot(hit_offset_1, _346);
        float _734 = hit_offset_1.y;
        vec2 _735 = vec2(_733, _734);
        float _739 = _734 * (-1.0);
        _735.y = _739;
        _2598 = clamp(mix(_715, vec4(vec3(0.07500000298023223876953125) + (sqrt(textureLod(material_WindowIndoors, _735 + vec2(0.5), 4.5).xyz) * (0.4000000059604644775390625 * exp((-0.5) * ((_733 * _733) + (_739 * _739))))), 1.0), vec4(1.0 - _715.w)) * 0.4000000059604644775390625, vec4(0.0), vec4(1.0)).xyz;
    }
    else
    {
        _2598 = _2305 * 0.5;
    }
    vec3 _2665;
    if (lightIntensity > 0.0500000007450580596923828125)
    {
        vec3 _2445;
        if (colorId == 0u)
        {
            _2445 = vec3(0.87999999523162841796875, 0.84178292751312255859375, 0.21120001375675201416015625);
        }
        else
        {
            vec3 _2446;
            if (colorId == 1u)
            {
                _2446 = vec3(0.0, 0.300000011920928955078125, 1.5);
            }
            else
            {
                vec3 _2447;
                if (colorId == 2u)
                {
                    _2447 = vec3(0.16000001132488250732421875, 0.800000011920928955078125, 0.16000001132488250732421875);
                }
                else
                {
                    vec3 _2448;
                    if (colorId == 3u)
                    {
                        _2448 = vec3(0.480000019073486328125, 0.3200000226497650146484375, 1.60000002384185791015625);
                    }
                    else
                    {
                        _2448 = mix(_2453, vec3(0.800000011920928955078125, 0.16000001132488250732421875, 0.080000005662441253662109375), bvec3(colorId == 4u));
                    }
                    _2447 = _2448;
                }
                _2446 = _2447;
            }
            _2445 = _2446;
        }
        vec2 _849 = ((positionWS.xy + positionWS.zy) + vec2(1234.0)) * 0.20000000298023223876953125;
        ivec2 _1573 = ivec2(floor(_849));
        vec2 _1574 = fract(_849);
        uvec2 _1575 = uvec2(_1573);
        uint _1625 = _1575.y;
        uint _1631 = _1625 + (_1625 << 10u);
        uint _1633 = _1631 ^ (_1631 >> 6u);
        uint _1635 = _1633 + (_1633 << 3u);
        uint _1637 = _1635 ^ (_1635 >> 11u);
        uint _1645 = (((_1575.x * 1664525u) + (_1637 + (_1637 << 15u))) + 1013904223u) * 1664525u;
        uint _1647 = _1645 ^ (_1645 >> 11u);
        uint _1650 = _1647 ^ ((_1647 << 7u) & 2636928640u);
        uint _1653 = _1650 ^ ((_1650 << 15u) & 4022730752u);
        uint _1655 = _1653 ^ (_1653 >> 18u);
        float _2364;
        _2364 = _2310;
        uint _1672;
        uint _1691;
        float _1697;
        uint _2363 = 0u;
        uint _2680 = _1655;
        {
            uint _1683 = _2680 + (_2680 << 10u);
            uint _1685 = _1683 ^ (_1683 >> 6u);
            uint _1687 = _1685 + (_1685 << 3u);
            uint _1689 = _1687 ^ (_1687 >> 11u);
            _1691 = _1689 + (_1689 << 15u);
            _1697 = uintBitsToFloat((_2680 & 8388607u) | 1065353216u) - 1.0;
            _1672 = _2363 + 1u;
            _2680 = _1691;
            _2364 = _1697;
            _2363 = _1672;
        }
        uvec2 _1583 = uvec2(_1573 + ivec2(1, 0));
        uint _1701 = _1583.y;
        uint _1707 = _1701 + (_1701 << 10u);
        uint _1709 = _1707 ^ (_1707 >> 6u);
        uint _1711 = _1709 + (_1709 << 3u);
        uint _1713 = _1711 ^ (_1711 >> 11u);
        uint _1721 = (((_1583.x * 1664525u) + (_1713 + (_1713 << 15u))) + 1013904223u) * 1664525u;
        uint _1723 = _1721 ^ (_1721 >> 11u);
        uint _1726 = _1723 ^ ((_1723 << 7u) & 2636928640u);
        uint _1729 = _1726 ^ ((_1726 << 15u) & 4022730752u);
        uint _1731 = _1729 ^ (_1729 >> 18u);
        float _2382;
        _2382 = _2310;
        uint _1748;
        uint _1767;
        float _1773;
        uint _2381 = 0u;
        uint _2679 = _1731;
        {
            uint _1759 = _2679 + (_2679 << 10u);
            uint _1761 = _1759 ^ (_1759 >> 6u);
            uint _1763 = _1761 + (_1761 << 3u);
            uint _1765 = _1763 ^ (_1763 >> 11u);
            _1767 = _1765 + (_1765 << 15u);
            _1773 = uintBitsToFloat((_2679 & 8388607u) | 1065353216u) - 1.0;
            _1748 = _2381 + 1u;
            _2679 = _1767;
            _2382 = _1773;
            _2381 = _1748;
        }
        uvec2 _1590 = uvec2(_1573 + ivec2(0, 1));
        uint _1777 = _1590.y;
        uint _1783 = _1777 + (_1777 << 10u);
        uint _1785 = _1783 ^ (_1783 >> 6u);
        uint _1787 = _1785 + (_1785 << 3u);
        uint _1789 = _1787 ^ (_1787 >> 11u);
        uint _1797 = (((_1590.x * 1664525u) + (_1789 + (_1789 << 15u))) + 1013904223u) * 1664525u;
        uint _1799 = _1797 ^ (_1797 >> 11u);
        uint _1802 = _1799 ^ ((_1799 << 7u) & 2636928640u);
        uint _1805 = _1802 ^ ((_1802 << 15u) & 4022730752u);
        uint _1807 = _1805 ^ (_1805 >> 18u);
        float _2401;
        _2401 = _2310;
        uint _1824;
        uint _1843;
        float _1849;
        uint _2400 = 0u;
        uint _2678 = _1807;
        {
            uint _1835 = _2678 + (_2678 << 10u);
            uint _1837 = _1835 ^ (_1835 >> 6u);
            uint _1839 = _1837 + (_1837 << 3u);
            uint _1841 = _1839 ^ (_1839 >> 11u);
            _1843 = _1841 + (_1841 << 15u);
            _1849 = uintBitsToFloat((_2678 & 8388607u) | 1065353216u) - 1.0;
            _1824 = _2400 + 1u;
            _2678 = _1843;
            _2401 = _1849;
            _2400 = _1824;
        }
        uvec2 _1598 = uvec2(_1573 + ivec2(1));
        uint _1853 = _1598.y;
        uint _1859 = _1853 + (_1853 << 10u);
        uint _1861 = _1859 ^ (_1859 >> 6u);
        uint _1863 = _1861 + (_1861 << 3u);
        uint _1865 = _1863 ^ (_1863 >> 11u);
        uint _1873 = (((_1598.x * 1664525u) + (_1865 + (_1865 << 15u))) + 1013904223u) * 1664525u;
        uint _1875 = _1873 ^ (_1873 >> 11u);
        uint _1878 = _1875 ^ ((_1875 << 7u) & 2636928640u);
        uint _1881 = _1878 ^ ((_1878 << 15u) & 4022730752u);
        uint _1883 = _1881 ^ (_1881 >> 18u);
        float _2421;
        _2421 = _2310;
        uint _1900;
        uint _1919;
        float _1925;
        uint _2420 = 0u;
        uint _2677 = _1883;
        {
            uint _1911 = _2677 + (_2677 << 10u);
            uint _1913 = _1911 ^ (_1911 >> 6u);
            uint _1915 = _1913 + (_1913 << 3u);
            uint _1917 = _1915 ^ (_1915 >> 11u);
            _1919 = _1917 + (_1917 << 15u);
            _1925 = uintBitsToFloat((_2677 & 8388607u) | 1065353216u) - 1.0;
            _1900 = _2420 + 1u;
            _2677 = _1919;
            _2421 = _1925;
            _2420 = _1900;
        }
        vec2 _1931 = (_1574 * _1574) * (vec2(3.0) - (vec2(2.0) * _1574));
        float _1606 = _1931.x;
        float _1607 = 1.0 - _1606;
        float _1609 = _1931.y;
        float mult = (mix(0.0, 1.0, clamp((((1.0 - _1609) * ((_2364 * _1607) + (_2382 * _1606))) + ((_2401 * _1607) * _1609)) + ((_2421 * _1606) * _1609), 0.0, 1.0)) * 0.60000002384185791015625) * lightIntensity;
        vec3 _2676;
        if (_2306)
        {
            _2676 = (_2445 * mult) * 1.0;
        }
        else
        {
            _2676 = ((_2445 * 0.20000000298023223876953125) * mult) * 1.0;
        }
        _2665 = _2676;
    }
    else
    {
        _2665 = vec3(0.0);
    }
    normal=_328;
    emission=_2665;
    roughness=_2306 ? .08 : .8;
    return _2598;
}
// Solid supports retain their vertex material. The frame uses the exact
// color-id UV phase and default-layer darkening from the original frame fragment.
vec3 masonryDecorationFinish(vec2 uv,float kind,vec3 centerWS,vec3 positionWS,
 vec3 sourceColor,float lightIntensity,vec3 cameraWS,inout vec3 normal,
 out vec3 emission,out float roughness){
 float colorId=floor(kind/${decorationMaterialStride}.0); kind=mod(kind,${decorationMaterialStride}.0);
 emission=vec3(1.0,.57,.18)*lightIntensity; roughness=.9;
 if(kind < .5) return sourceColor;
 if(kind > 3.5 && kind < 5.5){
   emission=vec3(0.0); roughness=.8;
   if(kind > 4.5) return sourceColor;
   uint h=uint(colorId);h+=h<<10u;h^=h>>6u;h+=h<<3u;h^=h>>11u;h+=h<<15u;
   float phase=uintBitsToFloat((h & 8388607u)|1065353216u)-1.0;
   vec3 timber=texture(material_WindowTimber,vec3(uv+vec2(phase)+positionWS.xz*.1,colorId)).rgb;
   return colorId<.5 ? mix(timber*.7,sourceColor,.3) : timber;
 }
 if(kind > 7.5){
   // Native window_glass instance has_albedo_texture / albedo_texture=2.
   // Dark lead stays opaque; bright texels become glass independently of the
   // mesh is_glass flag. The same source texture is used in every host LOD.
   vec3 albedo=texture(material_WindowGlass,uv).rgb;
   return masonryWindowGlass(positionWS,centerWS,albedo,cameraWS,lightIntensity,
     kind>8.5 || length(albedo)>.12,normal,emission,roughness);
 }
 if(kind > 5.5) return masonryLanternSurface(positionWS,centerWS,sourceColor,cameraWS,lightIntensity,colorId,kind>6.5,emission,roughness);
 if(kind < 1.5){
   uint h=uint(colorId);h+=h<<10u;h^=h>>6u;h+=h<<3u;h^=h>>11u;h+=h<<15u;
   float phase=uintBitsToFloat((h & 8388607u)|1065353216u)-1.0;
   emission=vec3(0.0);return texture(material_WindowTimber,vec3(uv*.5+vec2(phase),colorId)).rgb*(colorId<.5 ? .7 : 1.0);
 }
 return masonryWindowGlass(positionWS,centerWS,sourceColor,cameraWS,lightIntensity,kind>2.5,normal,emission,roughness);
}
`;
