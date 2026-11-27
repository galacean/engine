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
   CullMode rasterStateCullMode;
   RasterState = { CullMode = rasterStateCullMode; }
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
   #ifdef GLOBAL_PROXY_ENTRANCE
    vec4 material_ProxyEntrance[64];
   #endif
   struct MasonryGlobalProxyDepthVaryings {
    vec2 uv;
    vec4 surfaceTag;
    float lodFade;
    #ifdef GLOBAL_PROXY_ENTRANCE
     vec4 entrance;
     float worldY;
    #endif
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
    int clampedSlot = clamp(slot, 0, 63);
    vec4 state = material_ProxyState[clampedSlot];
    v.lodFade = state.z;
    #ifdef GLOBAL_PROXY_ENTRANCE
     vec4 entrance = material_ProxyEntrance[clampedSlot];
     v.entrance = entrance;
     v.worldY = positionWS.y;
     if (entrance.x <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return v;
     }
    #endif
    if (state.x < 0.5 || v.lodFade <= -1.0) {
     gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
     return v;
    }
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
    return v;
   }
   void MasonryGlobalProxyDepthFragment(MasonryGlobalProxyDepthVaryings v) {
    #ifdef GLOBAL_PROXY_ENTRANCE
     if (v.entrance.x < 1.0) {
      if (v.entrance.x <= 0.0) discard;
      float eh = clamp((v.worldY - v.entrance.y) / max(v.entrance.z, 0.001), 0.0, 1.0);
      float edelay = (v.surfaceTag.x > 2.5 && v.surfaceTag.x < 3.5) ? 0.12 : ((v.surfaceTag.x > 4.5) ? 0.08 : 0.0);
      float eth = min(0.98, 0.16 + 0.70 * eh + edelay);
      float eamt = smoothstep(0.8 * eth, eth, pow(v.entrance.x, 0.8));
      float emask = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
      if (eamt <= emask) discard;
     }
    #endif
    #ifdef GLOBAL_PROXY_DITHER
     if (v.lodFade < 1.0) {
      if (v.lodFade <= -1.0) discard;
      vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
      vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
      float a = 2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y;
      float b = 2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y;
      float threshold = (4.0 * a + b + 0.5) / 16.0;
      if (v.lodFade >= 0.0 ? threshold > v.lodFade : threshold <= -v.lodFade) discard;
     }
    #endif
    #ifdef GLOBAL_PROXY_PLASTER
     if (v.surfaceTag.x > 2.5 && v.surfaceTag.x < 3.5) {
      if (plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w).x < 0.5) discard;
     }
    #endif
   }
  }

  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   CullMode rasterStateCullMode;
   RasterState = { CullMode = rasterStateCullMode; }
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
   #ifdef GLOBAL_PROXY_ENTRANCE
    vec4 material_ProxyEntrance[64];
   #endif
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
    #ifdef GLOBAL_PROXY_ENTRANCE
     vec4 entrance;
    #endif
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
    int clampedSlot = clamp(slot, 0, 63);
    vec4 state = material_ProxyState[clampedSlot];
    v.lodFade = state.z;
    v.lodDebug = state.w;
    #ifdef GLOBAL_PROXY_ENTRANCE
     vec4 entrance = material_ProxyEntrance[clampedSlot];
     v.entrance = entrance;
     if (entrance.x <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return v;
     }
    #endif
    if (state.x < 0.5 || v.lodFade <= -1.0) {
     gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
     return v;
    }
    #ifdef RENDERER_WORLD_PICK
     if (state.x > 1.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return v;
     }
    #endif
    gl_Position = camera_VPMat * vec4(positionWS, 1.0);
    return v;
   }
   void MasonryGlobalProxyFragment(MasonryGlobalProxyVaryings v) {
    #ifdef GLOBAL_PROXY_ENTRANCE
     float entranceAmt = 1.0;
     if (v.entrance.x < 1.0) {
      if (v.entrance.x <= 0.0) discard;
      float eh = clamp((v.positionWS.y - v.entrance.y) / max(v.entrance.z, 0.001), 0.0, 1.0);
      float edelay = (v.surfaceTag.x > 2.5 && v.surfaceTag.x < 3.5) ? 0.12 : ((v.surfaceTag.x > 4.5) ? 0.08 : 0.0);
      float eth = min(0.98, 0.16 + 0.70 * eh + edelay);
      entranceAmt = smoothstep(0.8 * eth, eth, pow(v.entrance.x, 0.8));
      float emask = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
      if (entranceAmt <= emask) discard;
     }
    #endif
    #ifdef GLOBAL_PROXY_DITHER
     if (v.lodFade < 1.0) {
      if (v.lodFade <= -1.0) discard;
      vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
      vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
      float a = 2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y;
      float b = 2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y;
      float threshold = (4.0 * a + b + 0.5) / 16.0;
      if (v.lodFade >= 0.0 ? threshold > v.lodFade : threshold <= -v.lodFade) discard;
     }
    #endif
    float kind = v.surfaceTag.x;
    #ifdef RENDERER_WORLD_PICK
     #ifdef GLOBAL_PROXY_PLASTER
      if (kind > 2.5 && kind < 3.5 && plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w).x < 0.5) discard;
     #endif
     float id = floor(renderer_WorldPickBase + v.worldPickOffset + 0.5);
     #ifdef RENDERER_WORLD_PICK_DEPTH
      id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
     #endif
     gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
     vec3 albedo = v.color.rgb;
     bool isPlaster = false;
     #ifdef GLOBAL_PROXY_PLASTER
      if (kind > 2.5 && kind < 3.5) {
       isPlaster = true;
       vec3 plasterDetail = plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w);
       if (plasterDetail.x < 0.5) discard;
       float limeVariation = plasterNativeNoise(v.uv * 1.2, 2) * 0.04;
       albedo = clamp(albedo + limeVariation, vec3(0.0), vec3(1.5));
       // Match LOD1 pale stone-grey recessed mortar coat + subtle sunlit rim highlight (avoid dark brown outline).
       float plasterLum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
       vec3 mortarAlbedo = mix(albedo, vec3(plasterLum), 0.72) * vec3(0.86, 0.89, 0.85);
       albedo = mix(albedo, mortarAlbedo, plasterDetail.y * 0.92);
       albedo *= 1.0 + plasterDetail.z * 0.08;
      }
     #endif
     if (!isPlaster && kind <= 4.5 && v.surfaceTag.z < 0.5) {
      if (kind < 0.5) {
       // Match LOD1 sunlit brick reflectance & pale mortar/bevel joints across all distances.
       albedo *= 1.20 * masonryFarCourseTone(v.uv, vec2(2.1, 3.8), 0.5, 1.10, 0.90, 1.08);
      } else if (kind < 1.5) {
       // Match LOD1 3D shingle-overlap AO & course crevices even at far distance (prevent washed-out pastel roof).
       albedo *= 0.73 * masonryFarCourseTone(v.uv, vec2(3.6, 3.2), 0.5, 0.56, 0.86, 1.12);
      } else if (kind < 2.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(0.8, 4.5), 0.0, 0.84, 0.88, 1.06);
      } else if (kind > 3.5) {
       albedo *= masonryFarCourseTone(v.uv, vec2(1.8, 1.8), 0.5, 0.90, 0.88, 1.08);
      }
     }
     vec3 n = normalize(v.normalWS) * (gl_FrontFacing || (kind > 2.5 && kind < 3.5) ? 1.0 : -1.0);
     vec3 baseLit = masonryFarProxyLight(kind > 5.5 ? vec3(0.05, 0.065, 0.075) : albedo, n, v.positionWS);
     vec3 lit;
     if (kind > 5.5) {
      // Lightweight GPR-neutral glass shading (no cubemap sampler, no envDFGApprox, no GGX/fwidth)
      // so Adreno wave occupancy stays flat on wall/roof pixels while keeping crisp reflective panes
      // inside the 4-bar hollow window frames.
      vec3 viewDir = normalize(camera_Position - v.positionWS);
      float ndotv = max(dot(n, viewDir), 0.0);
      float f1 = 1.0 - ndotv;
      float f2 = f1 * f1;
      float fresnel = 0.06 + 0.74 * (f2 * f2 * f1);
      float reflY = clamp(2.0 * ndotv * n.y - viewDir.y, 0.0, 1.0);
      float skyLum = min(dot(baseLit, vec3(12.0, 14.0, 14.0)), 2.2);
      vec3 skyRefl = mix(vec3(0.55, 0.68, 0.80), vec3(0.72, 0.92, 1.25), reflY) * skyLum;
      vec3 glassColor = baseLit + fresnel * skyRefl + vec3(0.88, 0.78, 0.24) * (v.color.a * 0.55);
      lit = mix(glassColor, baseLit * 0.28, 0.38);
     } else {
      lit = baseLit + vec3(1.0, 0.57, 0.18) * v.color.a;
     }
     vec3 outRgb = masonrySceneFog(lit, v.positionWS);
     #ifdef GLOBAL_PROXY_ENTRANCE
      float rainbowEdge = 0.0;
      float eNormY = clamp((v.positionWS.y - v.entrance.y) / max(v.entrance.z, 0.001), 0.0, 1.0);
      if (v.entrance.x > 1.5) {
       float sweepP = clamp(v.entrance.x - 2.0, 0.0, 1.0);
       float sweep = mix(-0.24, 1.24, sweepP);
       rainbowEdge = (1.0 - smoothstep(0.0, 0.30, abs(eNormY - sweep))) * sin(sweepP * 3.14159265);
      } else if (v.entrance.x > 0.0 && v.entrance.x < 1.0) {
       rainbowEdge = entranceAmt * (1.0 - entranceAmt) * 4.0;
      }
      if (rainbowEdge > 0.001) {
       float shift = v.entrance.x > 1.5 ? (v.entrance.x - 2.0) * 1.4 : v.entrance.x * 1.1;
       float phase = fract(eNormY * 1.65 + (v.positionWS.x + v.positionWS.z) * 0.16 - shift);
       vec3 raw = clamp(abs(mod(phase * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
       vec3 rainbow = pow(raw, vec3(2.2)) * rainbowEdge * 2.65;
       float rainbowW = clamp(rainbowEdge * 0.76, 0.0, 0.76);
       outRgb = outRgb * (1.0 - rainbowW) + rainbow;
      }
     #endif
     if (v.lodDebug > 0.0) {
      outRgb = mix(outRgb, vec3(0.95, 0.2, 0.18), 0.82 * v.lodDebug);
     }
     gl_FragColor = vec4(outRgb, 1.0);
    #endif
   }
  }
 }
}
