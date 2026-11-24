Shader "Terrain/Vegetation" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = VegetationVertex;
      FragmentShader = VegetationFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #define TERRAIN_PROJECT_OIL_PAINT_FOLIAGE
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && defined(MATERIAL_HAS_NORMALTEXTURE)
        #define NEED_VERTEX_TANGENT
      #endif
      #ifdef MATERIAL_HAS_NORMALTEXTURE
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyAttributes.glsl"
      #elif defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
        #include "vegetation/VegetationDetailAttributes.glsl"
      #else
        #include "vegetation/VegetationAttributes.glsl"
        #include "ShaderLibrary/Skin/Skin.glsl"
        #include "ShaderLibrary/Skin/BlendShape.glsl"
      #endif
      #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
        #include "vegetation/ProceduralTreeLeafFrame.glsl"
      #endif

      #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
        #include "shared/AssetAssemblyInstancing.glsl"
      #endif
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      #ifdef RENDERER_WORLD_PICK
        float renderer_WorldPickBase;
        float renderer_WorldPickInstanced;
      #endif

      struct Varyings {

        #ifdef RENDERER_WORLD_PICK
          float worldPickId;
        #endif
        vec2 uv;
        #ifdef MATERIAL_ENABLE_SECOND_COLOR
          vec3 sourcePositionOS;
        #elif defined(MATERIAL_ENABLE_TRANSLUCENCY) || (!defined(SCENE_SURFACE_CLIMATE_DRY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
          float sourcePositionOSY;
        #endif
        vec3 positionWS;
        #ifdef MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE
          vec4 sharedGrassRootTip;
          vec3 sharedGrassColorOverrideMask;
          #ifdef MATERIAL_WIND_GROUND_VEGETATION
            vec3 groundWindCarrierNormalWS;
          #endif
        #endif
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          vec3 assetAssemblyColor;
          #ifdef RENDERER_LOD_DITHER
            float assetAssemblyLodFade;
          #endif
        #endif
        #ifdef SCENE_OIL_PAINT_STYLE
          float oilPaintLeafId;
        #endif
        #if defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          float proceduralLeafShape;
        #endif
        #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
          float proceduralTreeCanopyOpticalDepth;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          vec4 generationRevealData;
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
            vec3 treeDissolveTint;
          #endif
        #endif
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
        vec3 normalWS;
        #ifdef NEED_VERTEX_TANGENT
          vec4 tangentWS;
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
      #ifdef MATERIAL_ENABLE_SECOND_COLOR
        #include "vegetation/VegetationSecondColor.glsl"
      #endif
      #include "vegetation/VegetationEvaluation.glsl"
      #ifdef MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE
        vec4 renderer_GrassRootPositionHeight;
        vec3 renderer_GrassColorOverrideMask;
      #endif
      #include "shared/VegetationWind.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/EntranceWave.glsl"
      #define TERRAIN_PROJECT_HAS_OIL_PAINT_LEAF_ID
      #ifdef SCENE_OIL_PAINT_STYLE
        float terrainProjectOilPaintLeafId(Varyings varyings) {
          return varyings.oilPaintLeafId;
        }
      #endif
      #include "shared/Lighting.glsl"
      #ifdef MATERIAL_ENABLE_TRANSLUCENCY
        #include "vegetation/VegetationTranslucency.glsl"
      #endif

      #if defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) && defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
        #include "vegetation/ProceduralTreeLeafBillboard.glsl"
      #endif

      Varyings VegetationVertex(Attributes attributes) {
        Varyings varyings;
        #ifdef RENDERER_WORLD_PICK
          varyings.worldPickId = renderer_WorldPickBase + float(gl_InstanceID) * renderer_WorldPickInstanced;
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
          ProceduralTreeLeafFrame proceduralLeafFrame = terrainProjectProceduralTreeLeafFrame(attributes);
          positionOS.xyz = terrainProjectProceduralTreeLeafPositionOS(proceduralLeafFrame, attributes.LEAF_SHAPE_POSITION);
          normalOS = terrainProjectProceduralTreeLeafNormalOS(proceduralLeafFrame, attributes.LEAF_SHAPE_NORMAL);
          normalOS = terrainProjectProceduralTreeLeafShadingNormalOS(positionOS.xyz, normalOS);
          proceduralTreeWindOriginOS = proceduralLeafFrame.pivotOS;
          #ifdef MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION
            varyings.proceduralTreeCanopyOpticalDepth = proceduralLeafFrame.canopyOpticalDepth;
          #endif
          #ifdef NEED_VERTEX_TANGENT
            tangentOS = vec4(
              renderer_ProceduralTreeLeafNormalField.w > 0.0
                ? terrainProjectProceduralTreeLeafShadingTangentOS(proceduralLeafFrame, normalOS)
                : terrainProjectProceduralTreeLeafTangentOS(proceduralLeafFrame),
              proceduralLeafFrame.tangentHandedness
            );
          #endif
        #elif defined(MATERIAL_WIND_PROCEDURAL_TREE)
          proceduralTreeWindOriginOS = attributes.LEAF_PIVOT;
        #endif
        #if defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
          varyings.proceduralTreeCanopyOpticalDepth = attributes.PLANT_CANOPY_DEPTH;
        #endif
        #ifdef MATERIAL_ENABLE_SECOND_COLOR
          varyings.sourcePositionOS = positionOS.xyz;
        #elif defined(MATERIAL_ENABLE_TRANSLUCENCY) || (!defined(SCENE_SURFACE_CLIMATE_DRY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
          varyings.sourcePositionOSY = positionOS.y;
        #endif
        normalOS = normalize(mix(normalOS, vec3(0.0, 1.0, 0.0), material_LightingFlatness));
        #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
          normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
          #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
            tangentOS.xyz = terrainProjectAssetAssemblyTangentOS(tangentOS.xyz, attributes);
          #endif
          varyings.assetAssemblyColor = terrainProjectAssetAssemblyColor(attributes);
          #ifdef RENDERER_LOD_DITHER
            varyings.assetAssemblyLodFade = terrainProjectAssetAssemblyLodFade(attributes);
          #endif
        #else
          normalOS = terrainProjectDetailNormalOS(normalOS, attributes);
          #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT)
            tangentOS.xyz = terrainProjectDetailTangentOS(tangentOS.xyz, attributes);
          #endif
        #endif
        #ifdef SCENE_OIL_PAINT_STYLE
          float hasPivot = dot(proceduralTreeWindOriginOS, proceduralTreeWindOriginOS) > 1e-6 ? 1.0 : 0.0;
          vec3 leafKey = mix(floor(positionOS.xyz * 4.0), floor(proceduralTreeWindOriginOS * 100.0 + 0.5), hasPivot);
          float oilLeafSeed = dot(leafKey, vec3(12.9898, 78.233, 37.719));
          #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
            oilLeafSeed += dot(varyings.assetAssemblyColor, vec3(91.7, 157.3, 211.9));
          #endif
          varyings.oilPaintLeafId = fract(sin(oilLeafSeed) * 43758.5453);
        #endif
        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif
        #if defined(RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
          varyings.proceduralLeafShape = terrainProjectProceduralTreeLeafShape(attributes);
        #endif
        vec3 tangentWS = vec3(0.0);
        float windShadingResponse;
        vec3 groundWindDiagnostics;
        vec3 groundWindCarrierNormalWS;
        #if defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) && defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
          vec3 leafOriginWS;
          terrainProjectBuildProceduralTreeLeafFrame(
            attributes,
            varyings.positionWS,
            varyings.normalWS,
            tangentWS,
            leafOriginWS
          );
          varyings.positionWS = terrainProjectApplyVegetationWind(
            varyings.positionWS,
            leafOriginWS,
            attributes,
            varyings.normalWS,
            tangentWS,
            windShadingResponse,
            groundWindDiagnostics,
            groundWindCarrierNormalWS
          );
        #else
          varyings.normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
          #ifdef MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE
            // Source cards own coverage. Like terrain blades, wind bends a common upright lighting frame.
            varyings.normalWS = vec3(0.0, 1.0, 0.0);
            vec3 restPositionWS = (renderer_ModelMat * positionOS).xyz;
            varyings.sharedGrassRootTip = vec4(renderer_GrassRootPositionHeight.xyz,
              clamp((restPositionWS.y - renderer_GrassRootPositionHeight.y) / renderer_GrassRootPositionHeight.w, 0.0, 1.0));
            varyings.sharedGrassColorOverrideMask = renderer_GrassColorOverrideMask;
          #endif
          #ifdef NEED_VERTEX_TANGENT
            tangentWS = normalize(mat3(renderer_NormalMat) * tangentOS.xyz);
          #endif
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
        #endif
        #if defined(MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE) && defined(MATERIAL_WIND_GROUND_VEGETATION)
          varyings.groundWindCarrierNormalWS = groundWindCarrierNormalWS;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
            varyings.treeDissolveTint = material_TreeDissolvePalette[terrainProjectProceduralTreeCatalogIndex(attributes)].rgb;
          #endif
          varyings.generationRevealData = terrainProjectGenerationRevealData(varyings.positionWS.y, attributes);
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          varyings.positionWS = terrainProjectApplyEntranceWavePosition(varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          varyings.positionWS = terrainProjectApplyGenerationRevealPosition(
            varyings.positionWS,
            varyings.generationRevealData
          );
        #endif
        #if SCENE_FOG_MODE != 0
          varyings.positionVS = (camera_ViewMat * vec4(varyings.positionWS, 1.0)).xyz;
        #endif
        #ifdef NEED_VERTEX_TANGENT
          #if defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) && defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
            varyings.tangentWS = vec4(tangentWS, 1.0);
          #else
            varyings.tangentWS = vec4(tangentWS, tangentOS.w);
          #endif
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

      void VegetationFragment(Varyings varyings) {
        #if defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && defined(RENDERER_LOD_DITHER)
          applyTerrainProjectInstanceLodDither(gl_FragCoord.xy, varyings.assetAssemblyLodFade);
        #else
          applyTerrainProjectLodDither(gl_FragCoord.xy);
        #endif
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          if (terrainProjectEntranceWaveReveal(varyings.positionWS) <= 0.001) discard;
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          if (terrainProjectGenerationRevealAmount(varyings.generationRevealData) <= 0.001) discard;
        #endif
        #if defined(MATERIAL_PROCEDURAL_TREE_LEAF_VERTEX_NORMAL_DEBUG) && !defined(RENDERER_WORLD_PICK)
          // Blender-style normal inspection: encode the actual interpolated shading normal
          // in view space. Textures, PBR, transmission, canopy AO and fog do not affect it.
          vec3 vertexNormalVS = normalize(mat3(camera_ViewMat) * normalize(varyings.normalWS));
          gl_FragColor = vec4(vertexNormalVS * 0.5 + 0.5, 1.0);
          return;
        #endif
        float alphaCoverage = 1.0;
        #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
          if (material_LeafGlancingAngleCut > 0.001) {
            vec3 geometricFaceNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS)));
            vec3 coverageViewDirection = normalize(camera_Position - varyings.positionWS);
            float grazingVisibility = abs(dot(geometricFaceNormal, coverageViewDirection));
            alphaCoverage = mix(
              1.0,
              grazingVisibility,
              clamp(material_LeafGlancingAngleCut, 0.0, 1.0)
            );
          }
        #endif
        SurfaceData surfaceData = evaluateVegetationMaterial(varyings, gl_FrontFacing, alphaCoverage);
        #ifdef RENDERER_WORLD_PICK
          float pickId = floor(varyings.worldPickId + 0.5);
          #ifdef RENDERER_WORLD_PICK_DEPTH
            pickId = floor(gl_FragCoord.z * 16777215.0 + 0.5);
          #endif
          gl_FragColor = vec4(mod(pickId, 256.0), mod(floor(pickId / 256.0), 256.0), floor(pickId / 65536.0), 255.0) / 255.0;
          return;
        #endif
        TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
          float canopyOccludedFraction = 1.0 - clamp(surfaceData.ambientOcclusion, 0.0, 1.0);
          vec3 canopyOcclusionTint = mix(
            vec3(1.0),
            material_ProceduralTreeCanopyOcclusionColor.rgb,
            canopyOccludedFraction
          );
          // Tint only the absorbed indirect fraction. Direct sun, Base Color and
          // environment specular keep their existing energy and colour response.
          lighting.environmentDiffuse *= canopyOcclusionTint;
        #endif
        vec3 transmission = vec3(0.0);
        #ifdef MATERIAL_ENABLE_TRANSLUCENCY
          #ifdef MATERIAL_ENABLE_SECOND_COLOR
            float transmissionSourceY = varyings.sourcePositionOS.y;
          #else
            float transmissionSourceY = varyings.sourcePositionOSY;
          #endif
          transmission = terrainProjectEvaluateVegetationTransmission(
            surfaceData.normal,
            surfaceData.position,
            transmissionSourceY,
            surfaceData.viewDir,
            surfaceData.albedoColor,
            lighting.shadowAttenuation,
            surfaceData.ambientOcclusion
          );
        #endif
        vec4 color = vec4(
          terrainProjectFinalLighting(lighting) + transmission + surfaceData.emissiveColor,
          1.0
        );
        #ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
          color.rgb = applyTerrainProjectEntranceWave(color.rgb, varyings.positionWS);
        #endif
        #ifdef RENDERER_GENERATION_REVEAL
          #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
            color.rgb = terrainProjectApplyGenerationRevealTint(color.rgb, varyings.generationRevealData, varyings.treeDissolveTint);
          #else
            color.rgb = terrainProjectApplyGenerationRevealColor(color.rgb, varyings.generationRevealData);
          #endif
        #endif
        #if SCENE_FOG_MODE != 0
          color = fog(color, varyings.positionVS);
        #endif
        gl_FragColor = color;
      }
    }

    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = VegetationShadowVertex;
      FragmentShader = VegetationShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "vegetation/VegetationDepthShadowPass.glsl"
    }

    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = AlphaTest;

      VertexShader = VegetationDepthOnlyVertex;
      FragmentShader = VegetationDepthOnlyFragment;

      #define TERRAIN_PROJECT_DEPTH_ONLY_PASS
      #include "vegetation/VegetationDepthShadowPass.glsl"
    }
  }
}
