Shader "Planning/OilPaint" {
  SubShader "Default" {
    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = shadowVert;
      FragmentShader = shadowFrag;
      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "planning/OilPaintWind.glsl"
      #include "shared/Shadow.glsl"
      #include "shared/LodDither.glsl"
      sampler2D material_BaseTexture;
      float material_AlphaCutoff;
      struct ShadowVaryings { vec2 uv; };
      ShadowVaryings shadowVert(Attributes a) {
        ShadowVaryings v;
        vec3 normalWS = normalize(mat3(renderer_NormalMat) * a.NORMAL);
        vec3 positionWS = oilPaintWind(a, normalWS);
        gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
        v.uv = a.TEXCOORD_0;
        return v;
      }
      void shadowFrag(ShadowVaryings v) {
        applyTerrainProjectLodDither(gl_FragCoord.xy);
        if (texture2D(material_BaseTexture, v.uv).a < material_AlphaCutoff) discard;
        gl_FragColor = terrainProjectShadowColor();
      }
    }
    // The generic depth pass does not test coverage. Keep the same brush
    // silhouette here as in forward rendering and the native shadow caster.
    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = depthVert;
      FragmentShader = depthFrag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "planning/OilPaintWind.glsl"
      #include "shared/LodDither.glsl"
      sampler2D material_BaseTexture;
      float material_AlphaCutoff;
      struct DepthVaryings { vec2 uv; };
      DepthVaryings depthVert(Attributes a) {
        DepthVaryings v;
        vec3 normalWS = normalize(mat3(renderer_NormalMat) * a.NORMAL);
        gl_Position = camera_VPMat * vec4(oilPaintWind(a, normalWS), 1.0);
        v.uv = a.TEXCOORD_0;
        return v;
      }
      void depthFrag(DepthVaryings v) {
        applyTerrainProjectLodDither(gl_FragCoord.xy);
        if (texture2D(material_BaseTexture, v.uv).a < material_AlphaCutoff) discard;
      }
    }
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      CompareFunction material_WorldPickDepthCompare;
      DepthState = { CompareFunction = material_WorldPickDepthCompare; WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/Light.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"
      #include "shared/LodDither.glsl"

      vec3 material_ShadePigments[MATERIAL_OIL_PAINT_PALETTE_SIZE];
      vec3 material_HalfTonePigments[MATERIAL_OIL_PAINT_PALETTE_SIZE];
      vec3 material_SunlightPigments[MATERIAL_OIL_PAINT_PALETTE_SIZE];
      sampler2D material_BaseTexture;
      float material_AlphaCutoff;
      float material_GrowthStart;
      #ifdef MATERIAL_OIL_PAINT_TREE
        vec4 material_PigmentBase;
        vec4 renderer_AssetAssemblyColor;
      #endif
      #ifdef MATERIAL_OIL_PAINT_LEAF
        float material_LeafTransmittance;
      #endif
      #ifdef RENDERER_WORLD_PICK
        float renderer_WorldPickBase;
      #endif

      #include "planning/OilPaintWind.glsl"

      struct Varyings {
        vec2 uv;
        vec4 pigment;
        vec3 shadePigment;
        vec3 sunlightPigment;
        vec3 positionWS;
        vec3 positionVS;
        vec3 normalWS;
        vec4 paintData;
      };

      // Source: patch.gg/blendi/oil-paint, common.js. These are final paint
      // mixtures in display RGB, not albedo to multiply by HDR irradiance.
      vec4 paintRandom(float seed) {
        vec4 q = fract(vec4(seed) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
        q += dot(q, q.wzxy + 33.33);
        return fract((q.xxyz + q.yzzw) * q.zywx);
      }
      vec3 paint3(vec3 light, vec3 middle, vec3 shade, float lit, float variation) {
        lit += (variation - 0.5) * 0.2;
        vec3 color = mix(shade, middle, smoothstep(0.24, 0.36, lit));
        return mix(color, light, smoothstep(0.56, 0.7, lit));
      }
      vec3 brokenColor(vec3 color, vec3 random, float amount) {
        float angle = (random.y - 0.5) * 0.9 * amount;
        vec3 axis = vec3(0.57735);
        color = color * cos(angle) + cross(axis, color) * sin(angle)
          + axis * dot(axis, color) * (1.0 - cos(angle));
        float grey = dot(color, vec3(0.3, 0.59, 0.11));
        color = mix(vec3(grey), color, 1.0 + (random.z - 0.5) * 0.7 * amount);
        return max(color * (1.0 + (random.x - 0.5) * 0.5 * amount), 0.0);
      }
      vec3 finishPaint(vec3 color) {
        // The source's white-paint shoulder and varnish, evaluated locally.
        // No canvas-wide oil-paint pass, ACES, exposure or saturation filter.
        vec3 over = max(color - 0.8, 0.0);
        color = min(color, 0.8) + over / (1.0 + over * 5.0);
        return mix(color, color * color * (3.0 - 2.0 * color), 0.22);
      }

      Varyings vert(Attributes attr) {
        Varyings v;
        vec3 deformedNormal = normalize(mat3(renderer_NormalMat) * attr.NORMAL);
        vec4 position = vec4(oilPaintWind(attr, deformedNormal), 1.0);
        gl_Position = camera_VPMat * position;
        v.positionWS = position.xyz;
        v.positionVS = (camera_ViewMat * position).xyz;
        v.normalWS = deformedNormal;
        v.uv = attr.TEXCOORD_0;
        int pigmentIndex = int(attr.COLOR_0.r + 0.5);
        v.pigment = vec4(material_HalfTonePigments[pigmentIndex], attr.COLOR_0.a);
        v.shadePigment = material_ShadePigments[pigmentIndex];
        v.sunlightPigment = material_SunlightPigments[pigmentIndex];
        v.paintData = vec4(attr.COLOR_0.r, attr.COLOR_0.b, attr.POSITION.y, attr.COLOR_0.g);
        return v;
      }

      void frag(Varyings v) {
        applyTerrainProjectLodDither(gl_FragCoord.xy);
        vec4 brush = texture2D(material_BaseTexture, v.uv);
        vec3 normal = normalize(v.normalWS);
        // Brush relief is the paint on the canvas, not a change to the tree's
        // geometric lighting normal. Derivatives precede the coverage discard.
        vec3 dpdx = dFdx(v.positionWS), dpdy = dFdy(v.positionWS);
        vec2 duvdx = dFdx(v.uv), duvdy = dFdy(v.uv);
        vec3 pdy = cross(dpdy, normal), pdx = cross(normal, dpdx);
        vec3 tangent = pdy * duvdx.x + pdx * duvdy.x;
        vec3 bitangent = pdy * duvdx.y + pdx * duvdy.y;
        float frameScale = inversesqrt(max(max(dot(tangent, tangent), dot(bitangent, bitangent)), 1e-12));
        vec2 slope = brush.rg * 2.0 - 1.0;
        if (brush.a < material_AlphaCutoff) discard;
        #ifdef RENDERER_WORLD_PICK
          float id = floor(renderer_WorldPickBase + 0.5);
          #ifdef RENDERER_WORLD_PICK_DEPTH
            id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
          #endif
          gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
          return;
        #endif

        float shadow = 1.0;
        #ifdef NEED_CALCULATE_SHADOWS
          shadow = sampleShadowMap(v.positionWS, getShadowCoord(v.positionWS));
        #endif
        float lit = 0.0;
        float facing = 0.0;
        vec3 view = normalize(camera_Position - v.positionWS);
        #ifdef SCENE_DIRECT_LIGHT_COUNT
          for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
              float dotNL = dot(normal, -scene_DirectLightDirection[i]);
              float sun = i == 0 ? shadow : 1.0;
              // Native lights still supply direction, visibility and shadow.
              // The source palette represents a fully lit mark at unit light;
              // extra HDR energy must not bleach that authored paint again.
              float energy = clamp(max(max(scene_DirectLightColor[i].r, scene_DirectLightColor[i].g), scene_DirectLightColor[i].b), 0.0, 1.0);
              #ifdef MATERIAL_OIL_PAINT_LEAF
                float through = pow(max(dot(-view, -scene_DirectLightDirection[i]), 0.0), 2.0);
                float response = mix(0.5, 1.0, sun) * clamp(0.55 + 0.45 * dotNL + 1.2 * material_LeafTransmittance * through, 0.0, 1.0);
                response *= mix(0.6, 1.0, smoothstep(-0.7, 0.1, normal.y));
              #elif defined(MATERIAL_OIL_PAINT_TREE)
                float response = sun * clamp(dotNL * 1.2 + 0.25, 0.0, 1.0);
              #else
                float response = v.paintData.x >= material_GrowthStart ? sun : sun * clamp(dotNL * 2.4, 0.0, 1.0);
              #endif
              lit = max(lit, response * energy);
              if (i == 0) facing = dotNL;
            }
          }
        #endif
        vec4 random = paintRandom(v.pigment.a * 1000.0);
        vec4 other = paintRandom(v.pigment.a * 1000.0 + 271.3);
        vec3 color = paint3(v.sunlightPigment, v.pigment.rgb, v.shadePigment, lit, random.x);
        vec3 second;
        #ifdef MATERIAL_OIL_PAINT_LEAF
          color = mix(color, vec3(0.2, 0.16, 0.25), (1.0 - smoothstep(0.1, 0.4, lit)) * 0.14);
          color = brokenColor(color, random.yzw, 0.55);
          second = brokenColor(color * 1.16, other.zxy, 0.7);
        #elif defined(MATERIAL_OIL_PAINT_TREE)
          float foot = max(v.paintData.z, 0.0);
          color += vec3(0.1, 0.045, 0.0) * (1.0 - lit) * exp(-foot * 0.45);
          // Species-specific scars, moss, lichen and cool reflected sky.
          if (abs(v.paintData.x - 1.0) < 0.5 && random.y < 0.16) color = vec3(0.13, 0.11, 0.15);
          if (abs(v.paintData.x - 1.0) >= 0.5 && foot < 2.2 && random.z < 0.3 * (1.0 - foot / 2.2) + 0.1 * max(-facing, 0.0))
            color = mix(color, vec3(0.34, 0.4, 0.14) * (0.5 + 0.9 * shadow), 0.8);
          if (random.w < 0.1) color = mix(color, vec3(0.56, 0.58, 0.4) * (0.45 + 0.6 * dot(color, vec3(0.6))), 0.7);
          else if (random.w > 0.9 && facing < 0.0) color = mix(color, vec3(0.3, 0.33, 0.48), 0.6);
          if (v.paintData.w < 0.0) {
            // Continuous round underpainting; bright/cool dabs are laid over
            // it. Random whole-facet colour changes created horizontal bands.
            color = paint3(v.sunlightPigment, v.pigment.rgb, v.shadePigment, lit, brush.b);
            color += vec3(0.1, 0.045, 0.0) * (1.0 - lit) * exp(-foot * 0.45);
            color *= 0.72 + 0.3 * brush.b;
            second = color;
          } else {
            color = brokenColor(color, random.yzw, 0.7);
            second = brokenColor(color * 1.2 + vec3(0.02, 0.02, 0.05), random.wxy, 0.6);
          }
        #else
          if (v.paintData.x >= material_GrowthStart) {
            color = brokenColor(color, random.zwx, 0.55);
            second = brokenColor(color * 1.2, random.xzy, 0.8);
          } else {
            if (lit < 0.2 && other.w > 0.93) color = mix(vec3(0.34, 0.36, 0.52), vec3(0.2, 0.17, 0.26), other.z);
            color = brokenColor(color, random.wzy, 0.5);
            int secondIndex = int(v.paintData.y + 0.5);
            second = paint3(material_SunlightPigments[secondIndex], material_HalfTonePigments[secondIndex], material_ShadePigments[secondIndex], lit, other.w);
            second = brokenColor(second, other.wzy, 0.5);
          }
        #endif
        color = mix(color, second, smoothstep(0.52, 0.78, brush.b));
        vec3 relief = (tangent * slope.x + bitangent * slope.y) * frameScale;
        vec2 canvasRelief = (mat3(camera_ViewMat) * relief).xy;
        float rake = 0.5 * canvasRelief.x - 0.7 * canvasRelief.y;
        color *= 1.0 + rake * 1.25;
        color += vec3(1.0, 0.97, 0.9) * pow(max(rake, 0.0), 2.0) * 1.2;
        // Decode once at the material boundary. The HDR render target and
        // engine's final sRGB write then reproduce the source canvas values.
        vec4 result = sRGBToLinear(vec4(finishPaint(max(color, 0.0)), 1.0));
        #ifdef MATERIAL_OIL_PAINT_TREE
          result.rgb *= renderer_AssetAssemblyColor.rgb / max(material_PigmentBase.rgb, vec3(0.001));
        #endif
        #if SCENE_FOG_MODE != 0
          result = fog(result, v.positionVS);
        #endif
        gl_FragColor = result;
      }
    }
  }
}
