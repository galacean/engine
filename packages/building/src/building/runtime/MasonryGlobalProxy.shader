Shader "Masonry/GlobalProxy" {
 SubShader "Default" {
  Pass "ShadowCaster" {
   Tags { pipelineStage = "ShadowCaster" }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   struct Attributes {
    vec3 POSITION;
    vec4 NORMAL;
    #ifdef GLOBAL_PROXY_INSTANCED
     vec4 TEXCOORD_1;
     vec4 TEXCOORD_2;
     vec4 TEXCOORD_3;
     vec4 TEXCOORD_4;
    #endif
   };
   vec4 material_ProxyState[64];
   vec2 scene_ShadowBias;
   vec3 scene_LightDirection;
   struct Varyings { float unused; };
   VertexShader = MasonryGlobalProxyShadowVertex;
   FragmentShader = MasonryGlobalProxyShadowFragment;
   #include "Masonry/GlobalProxyShadowCaster.glsl"
  }

  Pass "DepthOnly" {
   Tags { pipelineStage = "DepthOnly" }
   RasterState = { CullMode = CullMode.Off; }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "Masonry/Plaster.glsl"
   struct Attributes {
    vec3 POSITION;
    vec4 NORMAL;
    vec2 TEXCOORD_0;
    vec4 TANGENT;
    #ifdef GLOBAL_PROXY_INSTANCED
     vec4 TEXCOORD_1;
     vec4 TEXCOORD_2;
     vec4 TEXCOORD_3;
     vec4 TEXCOORD_4;
    #endif
   };
   vec4 material_ProxyState[64];
   struct MasonryGlobalProxyDepthVaryings {
    vec2 uv;
    vec4 surfaceTag;
    float lodFade;
   };
   VertexShader = MasonryGlobalProxyDepthVertex;
   FragmentShader = MasonryGlobalProxyDepthFragment;
   MasonryGlobalProxyDepthVaryings MasonryGlobalProxyDepthVertex(Attributes a) {
    MasonryGlobalProxyDepthVaryings v;
    v.uv = a.TEXCOORD_0;
    v.surfaceTag = vec4(a.TANGENT.x * 255.0, a.TANGENT.y, a.TANGENT.z * 256.0, a.TANGENT.w);
    #ifdef GLOBAL_PROXY_INSTANCED
     int slot = int(a.TEXCOORD_4.x + 0.5);
     vec4 p4 = vec4(a.POSITION, 1.0);
     vec3 positionWS = vec3(dot(a.TEXCOORD_1, p4), dot(a.TEXCOORD_2, p4), dot(a.TEXCOORD_3, p4));
    #else
     int metaCode = int(floor(max(0.0, a.NORMAL.w) * 127.0 + 0.5));
     int slot = metaCode & 63;
     vec3 positionWS = a.POSITION;
    #endif
    vec4 state = material_ProxyState[clamp(slot, 0, 63)];
    v.lodFade = state.z;
    if (state.x < 0.5 || v.lodFade <= -1.0) {
     gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
     return v;
    }
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
    return v;
   }
   void MasonryGlobalProxyDepthFragment(MasonryGlobalProxyDepthVaryings v) {
    if (v.lodFade < 1.0) {
     if (v.lodFade <= -1.0) discard;
     vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
     vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
     float a = 2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y;
     float b = 2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y;
     float threshold = (4.0 * a + b + 0.5) / 16.0;
     if (v.lodFade >= 0.0 ? threshold > v.lodFade : threshold <= -v.lodFade) discard;
    }
    if (v.surfaceTag.x > 2.5 && v.surfaceTag.x < 3.5) {
     if (plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w).x < 0.5) discard;
    }
   }
  }

  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   RasterState = { CullMode = CullMode.Off; }
   CompareFunction material_WorldPickDepthCompare;
   DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "Masonry/Plaster.glsl"
   #include "Masonry/SceneLighting.glsl"
   struct Attributes {
    vec3 POSITION;
    vec4 NORMAL;
    vec4 COLOR_0;
    vec2 TEXCOORD_0;
    vec4 TANGENT;
    #ifdef GLOBAL_PROXY_INSTANCED
     vec4 TEXCOORD_1;
     vec4 TEXCOORD_2;
     vec4 TEXCOORD_3;
     vec4 TEXCOORD_4;
    #else
     float TEXCOORD_1;
    #endif
   };
   vec4 material_ProxyState[64];
   #ifdef RENDERER_WORLD_PICK
    float renderer_WorldPickBase;
   #endif
   struct MasonryGlobalProxyVaryings {
    vec3 positionWS;
    vec3 normalWS;
    vec4 color;
    vec2 uv;
    vec4 surfaceTag;
    float lodFade;
    float lodDebug;
    #ifdef RENDERER_WORLD_PICK
     float worldPickOffset;
    #endif
   };
   float masonryFarHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
   }
   float masonryFarCourseTone(vec2 uv, vec2 scale, float stagger, float edgeDarken, float minTone, float maxTone) {
    vec2 fw = max(fwidth(uv) * scale, vec2(1e-4));
    float aa = 1.0 - smoothstep(0.35, 1.15, max(fw.x, fw.y));
    if (aa <= 0.001) return 1.0;
    vec2 coord = uv * scale;
    float row = floor(coord.y);
    float col = floor(coord.x + mod(row, 2.0) * stagger);
    float tileTone = mix(minTone, maxTone, masonryFarHash12(vec2(col, row)));
    float rowEdge = smoothstep(0.0, 0.15, fract(coord.y));
    float pattern = tileTone * mix(edgeDarken, 1.0, rowEdge);
    return mix(1.0, pattern, aa);
   }
   VertexShader = MasonryGlobalProxyVertex;
   FragmentShader = MasonryGlobalProxyFragment;
   MasonryGlobalProxyVaryings MasonryGlobalProxyVertex(Attributes a) {
    MasonryGlobalProxyVaryings v;
    v.color = vec4(a.COLOR_0.rgb * 2.0, a.COLOR_0.a * 8.0);
    v.uv = a.TEXCOORD_0;
    v.surfaceTag = vec4(a.TANGENT.x * 255.0, a.TANGENT.y, a.TANGENT.z * 256.0, a.TANGENT.w);
    #ifdef GLOBAL_PROXY_INSTANCED
     int slot = int(a.TEXCOORD_4.x + 0.5);
     vec4 p4 = vec4(a.POSITION, 1.0);
     vec3 positionWS = vec3(dot(a.TEXCOORD_1, p4), dot(a.TEXCOORD_2, p4), dot(a.TEXCOORD_3, p4));
     vec3 c0 = vec3(a.TEXCOORD_1.x, a.TEXCOORD_2.x, a.TEXCOORD_3.x);
     vec3 c1 = vec3(a.TEXCOORD_1.y, a.TEXCOORD_2.y, a.TEXCOORD_3.y);
     vec3 c2 = vec3(a.TEXCOORD_1.z, a.TEXCOORD_2.z, a.TEXCOORD_3.z);
     v.normalWS = normalize(
      c0 * (a.NORMAL.x / max(dot(c0, c0), 1e-8)) +
      c1 * (a.NORMAL.y / max(dot(c1, c1), 1e-8)) +
      c2 * (a.NORMAL.z / max(dot(c2, c2), 1e-8))
     );
     #ifdef RENDERER_WORLD_PICK
      v.worldPickOffset = a.TEXCOORD_4.y;
     #endif
    #else
     int metaCode = int(floor(max(0.0, a.NORMAL.w) * 127.0 + 0.5));
     int slot = metaCode & 63;
     vec3 positionWS = a.POSITION;
     v.normalWS = normalize(a.NORMAL.xyz);
     #ifdef RENDERER_WORLD_PICK
      v.worldPickOffset = a.TEXCOORD_1;
     #endif
    #endif
    v.positionWS = positionWS;
    vec4 state = material_ProxyState[clamp(slot, 0, 63)];
    v.lodFade = state.z;
    v.lodDebug = state.w;
    if (state.x < 0.5 || v.lodFade <= -1.0) {
     gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
     return v;
    }
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
    return v;
   }
   void MasonryGlobalProxyFragment(MasonryGlobalProxyVaryings v) {
    if (v.lodFade < 1.0) {
     if (v.lodFade <= -1.0) discard;
     vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
     vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
     float a = 2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y;
     float b = 2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y;
     float threshold = (4.0 * a + b + 0.5) / 16.0;
     if (v.lodFade >= 0.0 ? threshold > v.lodFade : threshold <= -v.lodFade) discard;
    }
    float kind = v.surfaceTag.x;
    #ifdef RENDERER_WORLD_PICK
     if (kind > 2.5 && kind < 3.5 && plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w).x < 0.5) discard;
     float id = floor(renderer_WorldPickBase + v.worldPickOffset + 0.5);
     #ifdef RENDERER_WORLD_PICK_DEPTH
      id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
     #endif
     gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
     vec3 albedo = v.color.rgb;
     float roughness = 0.9;
     if (kind > 2.5 && kind < 3.5) {
      vec3 plasterDetail = plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w);
      if (plasterDetail.x < 0.5) discard;
      float limeVariation = plasterNativeNoise(v.uv * 1.2, 2) * 0.04;
      albedo = clamp(albedo + limeVariation, vec3(0.0), vec3(1.5));
      albedo = mix(albedo, albedo * vec3(0.45, 0.40, 0.36), plasterDetail.y * 0.85);
     } else if (kind > 5.5) {
      roughness = 0.35;
     } else if (kind < 4.5 && v.surfaceTag.z < 0.5) {
      if (kind < 0.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(2.1, 3.8), 0.5, 0.88, 0.88, 1.08);
      } else if (kind < 1.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(3.6, 3.2), 0.5, 0.82, 0.85, 1.10);
      } else if (kind < 2.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(0.8, 4.5), 0.0, 0.84, 0.88, 1.06);
      } else if (kind > 3.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(1.8, 1.8), 0.5, 0.90, 0.88, 1.08);
      }
     }
     vec3 n = normalize(v.normalWS) * (gl_FrontFacing || (kind > 2.5 && kind < 3.5) ? 1.0 : -1.0);
     vec3 lit = masonryResidentSceneLight(albedo, n, v.positionWS, roughness);
     lit += vec3(1.0, 0.57, 0.18) * v.color.a;
     vec3 outRgb = masonrySceneFog(lit, v.positionWS);
     if (v.lodDebug > 0.0) {
      outRgb = mix(outRgb, vec3(0.95, 0.2, 0.18), 0.82 * v.lodDebug);
     }
     gl_FragColor = vec4(outRgb, 1.0);
    #endif
   }
  }
 }
}
