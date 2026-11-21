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
         albedo = mix(albedo, albedo * vec3(0.45, 0.40, 0.36), plasterDetail.y * 0.85);
       }
     #endif
     if (!isPlaster && kind <= 4.5 && v.surfaceTag.z < 0.5) {
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
     vec3 lit = masonryFarProxyLight(albedo, n, v.positionWS);
     lit += vec3(1.0, 0.57, 0.18) * v.color.a;
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
