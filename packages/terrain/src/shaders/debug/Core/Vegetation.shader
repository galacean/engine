Shader "Terrain/Debug/Core/Vegetation" {
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

      VertexShader = VegetationCoreDebugVertex;
      FragmentShader = VegetationCoreDebugFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && defined(MATERIAL_HAS_NORMALTEXTURE)
        #define NEED_VERTEX_TANGENT
      #endif
      #ifdef MATERIAL_HAS_NORMALTEXTURE
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #if defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
        #include "vegetation/VegetationDetailAttributes.glsl"
      #else
        #include "vegetation/VegetationAttributes.glsl"
        #include "ShaderLibrary/Skin/Skin.glsl"
        #include "ShaderLibrary/Skin/BlendShape.glsl"
      #endif
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec2 uv;
        vec3 sourcePositionOS;
        vec3 positionWS;
        #if defined(MATERIAL_VEGETATION_VERTEX_COLOR_GRADIENT) && defined(RENDERER_ENABLE_VERTEXCOLOR)
          float vertexColorGradient;
        #endif
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          float assetAssemblyLodFade;
        #endif
        #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
          float proceduralTreeCanopyNormalConcentration;
        #endif
        vec3 normalWS;
        vec3 windDisplacement;
        float windWeight;
        float geometryParityError;
        #ifdef MATERIAL_ENABLE_TRANSLUCENCY
          float windShadingResponse;
        #endif
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
      #include "vegetation/VegetationSecondColor.glsl"
      #include "vegetation/VegetationEvaluation.glsl"
      #include "shared/VegetationWind.glsl"
      #include "shared/LodDither.glsl"
      #ifdef MATERIAL_ENABLE_TRANSLUCENCY
        #include "ShaderLibrary/Lighting/Light.glsl"
        #include "vegetation/VegetationTranslucency.glsl"
      #endif
      #include "shared/Lighting.glsl"
      #include "debug/MeshCoreDebug.glsl"
      #include "debug/VegetationCoreDebug.glsl"

      Varyings VegetationCoreDebugVertex(Attributes attributes) {
        Varyings varyings;
        #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
          // Core debug renders the source mesh instead of reconstructing the GPU frame.
          varyings.proceduralTreeCanopyNormalConcentration = 1.0;
        #endif
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangentOS = attributes.TANGENT;
          #endif
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif

        #if defined(RENDERER_HAS_BLENDSHAPE) && !defined(RENDERER_DETAIL_INSTANCE) && \
          !defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && \
          !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          calculateBlendShape(
            attributes,
            positionOS
            #ifdef RENDERER_HAS_NORMAL
              , normalOS
              #ifdef RENDERER_HAS_TANGENT
                , tangentOS
              #endif
            #endif
          );
        #endif
        #if defined(RENDERER_HAS_SKIN) && !defined(RENDERER_DETAIL_INSTANCE) && \
          !defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && \
          !defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          mat4 skinMatrix = getSkinMatrix(attributes);
          positionOS = skinMatrix * positionOS;
          #ifdef RENDERER_HAS_NORMAL
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normalOS = normalOS * skinNormalMatrix;
            #ifdef RENDERER_HAS_TANGENT
              tangentOS.xyz = tangentOS.xyz * skinNormalMatrix;
            #endif
          #endif
        #endif

        vec3 proceduralTreeWindOriginOS = vec3(0.0);
        #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
          proceduralTreeWindOriginOS = terrainProjectProceduralTreeLeafPivotOS(attributes);
        #elif defined(MATERIAL_WIND_PROCEDURAL_TREE)
          proceduralTreeWindOriginOS = attributes.LEAF_PIVOT;
        #endif

        normalOS = normalize(mix(normalOS, vec3(0.0, 1.0, 0.0), material_LightingFlatness));
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
          #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
            tangentOS.xyz = terrainProjectAssetAssemblyTangentOS(tangentOS.xyz, attributes);
          #endif
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
        #else
          normalOS = terrainProjectDetailNormalOS(normalOS, attributes);
          #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
            tangentOS.xyz = terrainProjectDetailTangentOS(tangentOS.xyz, attributes);
          #endif
        #endif
        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif
        varyings.sourcePositionOS = positionOS.xyz;
        #if defined(MATERIAL_VEGETATION_VERTEX_COLOR_GRADIENT) && defined(RENDERER_ENABLE_VERTEXCOLOR)
          varyings.vertexColorGradient = attributes.COLOR_0.a;
        #endif
        vec3 detailPositionOS = terrainProjectDetailPositionOS(positionOS.xyz, attributes);
        vec4 homogeneousSourcePositionWS = renderer_ModelMat * vec4(detailPositionOS, 1.0);
        vec3 sourcePositionWS = homogeneousSourcePositionWS.xyz / homogeneousSourcePositionWS.w;
        varyings.normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        vec3 tangentWS = vec3(0.0);
        #ifdef NEED_VERTEX_TANGENT
          tangentWS = normalize(mat3(renderer_NormalMat) * tangentOS.xyz);
        #endif
        float windShadingResponse;
        vec3 groundWindDiagnostics;
        vec3 groundWindCarrierNormalWS;
        varyings.positionWS = terrainProjectVegetationPositionWS(
          positionOS,
          attributes,
          proceduralTreeWindOriginOS,
          varyings.normalWS,
          tangentWS,
          windShadingResponse,
          groundWindDiagnostics,
          groundWindCarrierNormalWS
        );
        #ifdef MATERIAL_ENABLE_TRANSLUCENCY
          varyings.windShadingResponse = windShadingResponse;
        #endif
        varyings.windDisplacement = varyings.positionWS - sourcePositionWS;
        varyings.windWeight = terrainProjectVegetationVertexColorWeight(attributes) *
          terrainProjectVegetationBaseLockWeight(attributes);
        vec3 parityNormalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        vec3 parityTangentWS = vec3(0.0);
        #ifdef NEED_VERTEX_TANGENT
          parityTangentWS = normalize(mat3(renderer_NormalMat) * tangentOS.xyz);
        #endif
        float parityWindShadingResponse;
        vec3 parityGroundWindDiagnostics;
        vec3 parityGroundWindCarrierNormalWS;
        vec3 parityPositionWS = terrainProjectVegetationPositionWS(
          positionOS,
          attributes,
          parityNormalWS,
          parityTangentWS,
          parityWindShadingResponse,
          parityGroundWindDiagnostics,
          parityGroundWindCarrierNormalWS
        );
        varyings.geometryParityError = length(parityPositionWS - varyings.positionWS);
        #ifdef NEED_VERTEX_TANGENT
          varyings.tangentWS = tangentWS;
          varyings.bitangentWS = cross(varyings.normalWS, varyings.tangentWS) * tangentOS.w;
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

      void VegetationCoreDebugFragment(Varyings varyings) {
        vec2 materialUv = varyings.uv * material_Tiling;
        float alpha = sampleVegetationAlpha(materialUv);
        float alphaCoverage = 1.0;
        #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
          vec3 geometricFaceNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS)));
          vec3 coverageViewDirection = normalize(camera_Position - varyings.positionWS);
          float grazingVisibility = abs(dot(geometricFaceNormal, coverageViewDirection));
          alphaCoverage = mix(
            1.0,
            grazingVisibility,
            clamp(material_LeafGlancingAngleCut, 0.0, 1.0)
          );
        #endif
        if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_ALPHA) < 0.5) {
          gl_FragColor = vec4(vec3(alpha), 1.0);
        } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_ALPHA_CUTOFF) < 0.5) {
          gl_FragColor = vec4(alpha >= material_AlphaCutoff ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), 1.0);
        } else if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_DITHER_THRESHOLD) < 0.5) {
          gl_FragColor = vec4(vec3(terrainProjectDebugDitherThreshold(gl_FragCoord.xy)), 1.0);
        } else {
          applyVegetationAlphaCutoff(alpha * alphaCoverage);
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
            SurfaceData surfaceData = evaluateVegetationMaterial(varyings, gl_FrontFacing, alphaCoverage);
            TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
            vec3 geometryNormal = normalize(varyings.normalWS);
            gl_FragColor = vec4(terrainProjectMeshCoreDebugColor(surfaceData, lighting, geometryNormal), 1.0);
          }
        }
      }
    }
  }
}
