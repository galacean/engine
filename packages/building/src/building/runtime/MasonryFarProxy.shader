Shader "Masonry/FarProxy" {
 SubShader "Default" {
  Pass "DepthOnly" {
   Tags { pipelineStage = "DepthOnly" }
   RasterState = { CullMode = CullMode.Off; }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "ShaderLibrary/Common/Attributes.glsl"
   #include "Masonry/LodDither.glsl"
   #include "Masonry/Plaster.glsl"
   VertexShader = MasonryFarProxyDepthVertex;
   FragmentShader = MasonryFarProxyDepthFragment;
   struct MasonryFarProxyDepthVaryings {
     vec2 uv;
     vec4 surfaceTag;
   };
   MasonryFarProxyDepthVaryings MasonryFarProxyDepthVertex(Attributes a) {
     MasonryFarProxyDepthVaryings v;
     #ifdef RENDERER_HAS_UV
       v.uv = a.TEXCOORD_0;
     #else
       v.uv = vec2(0.0);
     #endif
     #ifdef RENDERER_HAS_TANGENT
       v.surfaceTag = vec4(a.TANGENT.x * 255.0, a.TANGENT.y, a.TANGENT.z * 256.0, a.TANGENT.w);
     #else
       v.surfaceTag = vec4(0.0);
     #endif
     gl_Position = camera_VPMat * renderer_ModelMat * vec4(a.POSITION, 1.0);
     return v;
   }
   void MasonryFarProxyDepthFragment(MasonryFarProxyDepthVaryings v) {
     #ifdef MASONRY_FAR_DITHER
       masonryLodDither();
     #endif
     #ifdef MASONRY_FAR_PLASTER
       if (v.surfaceTag.x > 2.5 && v.surfaceTag.x < 3.5) {
         if (plasterSurface(v.uv, v.surfaceTag.y, v.surfaceTag.z, v.surfaceTag.w).x < 0.5) discard;
       }
     #endif
   }
  }
  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   RasterState = { CullMode = CullMode.Off; }
   CompareFunction material_WorldPickDepthCompare;
   DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "Masonry/LodDither.glsl"
   #include "Masonry/Plaster.glsl"
   #include "Masonry/SceneLighting.glsl"
   struct Attributes {
    vec3 POSITION;
    vec4 NORMAL;
    vec4 COLOR_0;
    vec2 TEXCOORD_0;
    vec4 TANGENT;
    float TEXCOORD_1;
   };
   vec4 renderer_MasonryLodDebugColor;
   #ifdef RENDERER_WORLD_PICK
     float renderer_WorldPickBase;
   #endif
   struct MasonryFarProxyVaryings {
     vec3 positionWS;
     vec3 normalWS;
     vec4 color;
     vec2 uv;
     vec4 surfaceTag;
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
   VertexShader = MasonryFarProxyVertex;
   FragmentShader = MasonryFarProxyFragment;
   MasonryFarProxyVaryings MasonryFarProxyVertex(Attributes a) {
     MasonryFarProxyVaryings v;
     vec4 worldPos = renderer_ModelMat * vec4(a.POSITION, 1.0);
     v.positionWS = worldPos.xyz;
     v.normalWS = normalize(mat3(renderer_NormalMat) * a.NORMAL.xyz);
     #ifdef RENDERER_ENABLE_VERTEXCOLOR
       v.color = vec4(a.COLOR_0.rgb * 2.0, a.COLOR_0.a * 8.0);
     #else
       v.color = vec4(1.0);
     #endif
     #ifdef RENDERER_HAS_UV
       v.uv = a.TEXCOORD_0;
     #else
       v.uv = vec2(0.0);
     #endif
     #ifdef RENDERER_HAS_TANGENT
       v.surfaceTag = vec4(a.TANGENT.x * 255.0, a.TANGENT.y, a.TANGENT.z * 256.0, a.TANGENT.w);
     #else
       v.surfaceTag = vec4(0.0);
     #endif
     #ifdef RENDERER_WORLD_PICK
       #ifdef FAR_PROXY_INLINE_PICK
         v.worldPickOffset = max(0.0, floor(a.NORMAL.w * 127.0 + 0.5));
       #else
         v.worldPickOffset = a.TEXCOORD_1.x;
       #endif
     #endif
     gl_Position = camera_VPMat * worldPos;
     return v;
   }
   void MasonryFarProxyFragment(MasonryFarProxyVaryings v) {
     #ifdef MASONRY_FAR_DITHER
       masonryLodDither();
     #endif
     float kind = v.surfaceTag.x;
     #ifdef RENDERER_WORLD_PICK
       #ifdef MASONRY_FAR_PLASTER
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
     #ifdef MASONRY_FAR_PLASTER
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
       // Match LOD1 glass.shaderc / masonryWindowGlass (roughness=0.08, F0=0.04):
       // dark recessed interior + physical view-dependent Fresnel sky/sun reflection + bold 45 deg diamond lead lattice.
       vec2 horiz = abs(n.y) < 0.9 ? normalize(vec2(-n.z, n.x)) : vec2(1.0, 0.0);
       float uWin = dot(v.positionWS.xz, horiz);
       float vWin = v.positionWS.y;
       vec2 diag = vec2(uWin + vWin, uWin - vWin) * 4.8;
       vec2 fw = max(fwidth(diag), vec2(1e-4));
       vec2 dEdge = abs(fract(diag) - 0.5);
       vec2 lineMask = smoothstep(0.38 - fw, 0.38 + fw, dEdge);
       float leadRaw = max(lineMask.x, lineMask.y);
       float leadAA = 1.0 - smoothstep(0.35, 0.90, max(fw.x, fw.y));
       float lead = mix(0.38, leadRaw, leadAA);
       SurfaceData gs;
       gs.viewDir = normalize(camera_Position - v.positionWS);
       float ndotv = max(dot(n, gs.viewDir), 0.0001);
       vec2 gDfg = envDFGApprox(0.08, ndotv);
       vec3 skyRefl = getLightProbeRadiance(gs, n, 0.08);
       vec3 specRefl = (0.04 * gDfg.x + gDfg.y) * skyRefl;
       #ifdef SCENE_DIRECT_LIGHT_COUNT
         DirectLight gSun = getDirectLight(0);
         vec3 gL = -gSun.direction;
         float gNL = max(dot(n, gL), 0.0);
         if (gNL > 0.0) {
           vec3 gH = normalize(gL + gs.viewDir);
           float gNH = max(dot(n, gH), 0.0);
           float gLH = max(dot(gL, gH), 0.0);
           float gF = 0.04 + 0.96 * exp2((-5.55473 * gLH - 6.98316) * gLH);
           float gA2 = 0.00004096;
           float gDen = gNH * gNH * (gA2 - 1.0) + 1.0;
           float gD = gA2 / (gDen * gDen);
           float gV = gNL * sqrt(gA2 + (1.0 - gA2) * (ndotv * ndotv));
           float gLT = ndotv * sqrt(gA2 + (1.0 - gA2) * (gNL * gNL));
           float gG = 0.5 / max(gV + gLT, 1e-6);
           specRefl += (gNL * gSun.color) * (gF * gD * gG);
         }
       #endif
       vec3 glassColor = baseLit + specRefl + vec3(0.88, 0.78, 0.24) * (v.color.a * 0.55);
       lit = mix(glassColor, baseLit * 0.28, lead);
     } else {
       lit = baseLit + vec3(1.0, 0.57, 0.18) * v.color.a;
     }
     vec3 outRgb = masonrySceneFog(lit, v.positionWS);
     if (renderer_MasonryLodDebugColor.a > 0.0) {
       outRgb = mix(outRgb, renderer_MasonryLodDebugColor.rgb, renderer_MasonryLodDebugColor.a);
     }
     gl_FragColor = vec4(outRgb, 1.0);
     #endif
   }
  }
 }
}
