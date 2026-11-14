Shader "Terrain/Debug/Core/Billboard" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = BillboardCoreDebugVertex;
      FragmentShader = BillboardCoreDebugFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && defined(MATERIAL_HAS_NORMALTEXTURE)
        #define NEED_VERTEX_TANGENT
      #endif
      #ifdef MATERIAL_HAS_NORMALTEXTURE
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"

        #include "shared/AssetAssemblyInstancing.glsl"
      #elif defined(RENDERER_BILLBOARD_INSTANCE)
        #include "billboard/BillboardInstanceAttributes.glsl"
      #else
        #include "ShaderLibrary/Common/Attributes.glsl"
      #endif
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec2 uv;
        vec3 positionWS;
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          float assetAssemblyLodFade;
        #endif
        vec3 normalWS;
        vec3 windDisplacement;
        float windWeight;
        float geometryParityError;
        #ifdef NEED_VERTEX_TANGENT
          vec3 tangentWS;
          vec3 bitangentWS;
        #endif
        vec4 positionCS;
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          float probeWeight;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          vec3 shadowCoord;
        #endif
      };

      #include "ShaderLibrary/PBR/BSDF.glsl"
      #include "billboard/BillboardEvaluation.glsl"
      #include "billboard/BillboardDeformation.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/Lighting.glsl"
      #include "debug/MeshCoreDebug.glsl"
      #include "debug/VegetationCoreDebug.glsl"

      Varyings BillboardCoreDebugVertex(Attributes attributes) {
        Varyings varyings;
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
        #else
          vec3 normalOS = vec3(0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_TANGENT
          vec4 tangentOS = attributes.TANGENT;
        #else
          vec4 tangentOS = vec4(1.0, 0.0, 0.0, 1.0);
        #endif
        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif

        TerrainProjectBillboardDeformation deformation = terrainProjectBillboardDeformation(
          positionOS,
          normalOS,
          tangentOS,
          attributes
        );
        TerrainProjectBillboardDeformation parityDeformation = terrainProjectBillboardDeformation(
          positionOS,
          normalOS,
          tangentOS,
          attributes
        );
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #endif
        varyings.positionWS = deformation.positionWS;
        varyings.normalWS = deformation.normalWS;
        varyings.windDisplacement = deformation.positionWS - deformation.sourcePositionWS;
        varyings.windWeight = deformation.windWeight;
        varyings.geometryParityError = length(parityDeformation.positionWS - deformation.positionWS);
        #ifdef NEED_VERTEX_TANGENT
          varyings.tangentWS = deformation.tangentWS.xyz;
          varyings.bitangentWS = cross(varyings.normalWS, varyings.tangentWS) * deformation.tangentWS.w;
        #endif
        varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);

        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          vec3 probeIrradiance;
          bool hasProbe = sampleProbeVolume(
            varyings.positionWS,
            varyings.normalWS,
            normalize(camera_Position - varyings.positionWS),
            probeIrradiance
          );
          varyings.probeIrradiance = probeIrradiance;
          varyings.probeWeight = hasProbe ? 1.0 : 0.0;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          varyings.shadowCoord = getShadowCoord(varyings.positionWS);
        #endif

        gl_Position = varyings.positionCS;
        return varyings;
      }

      void BillboardCoreDebugFragment(Varyings varyings) {
        vec2 materialUv = varyings.uv * material_Tiling;
        float alpha = sampleBillboardBaseTexture(materialUv).a;
        if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_ALPHA) < 0.5) {
          gl_FragColor = vec4(vec3(alpha), 1.0);
        } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_ALPHA_CUTOFF) < 0.5) {
          gl_FragColor = vec4(alpha >= material_AlphaCutoff ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), 1.0);
        } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_DITHER_THRESHOLD) < 0.5) {
          gl_FragColor = vec4(vec3(terrainProjectDebugDitherThreshold(gl_FragCoord.xy)), 1.0);
        } else {
          applyBillboardAlphaCutoff(alpha);
          if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_LOD_FADE) > 0.5) {
            applyTerrainProjectLodDither(gl_FragCoord.xy);
          }
          if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_WIND_WEIGHT) < 0.5) {
            gl_FragColor = vec4(vec3(clamp(varyings.windWeight, 0.0, 1.0)), 1.0);
          } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_WIND_DISPLACEMENT) < 0.5) {
            gl_FragColor = vec4(abs(varyings.windDisplacement), 1.0);
          } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_GEOMETRY_PARITY) < 0.5) {
            gl_FragColor = vec4(vec3(clamp(varyings.geometryParityError, 0.0, 1.0)), 1.0);
          } else {
            SurfaceData surfaceData = evaluateBillboardMaterial(varyings);
            TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
            vec3 geometryNormal = normalize(varyings.normalWS);
            gl_FragColor = vec4(terrainProjectMeshCoreDebugColor(surfaceData, lighting, geometryNormal), 1.0);
          }
        }
      }
    }
  }
}
