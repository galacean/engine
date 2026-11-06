Shader "Terrain/SeedWorldRockToon" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = SeedWorldRockToonVertex;
      FragmentShader = SeedWorldRockToonFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Lighting/Light.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec3 positionWS;
        vec3 normalWS;
        #ifdef RENDERER_SURFACE_GRASS_COVERAGE
          vec4 positionCS;
          #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
            vec3 probeIrradiance;
            float probeWeight;
          #endif
        #endif
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          vec3 shadowCoord;
        #endif
      };

      #include "SeedWorldRockToon/Shadow.glsl"
      #include "shared/ToonDiffuseLighting.glsl"
      #include "shared/SurfaceGrassCoverage.glsl"
      #include "shared/ProceduralLodDither.glsl"
      #ifdef RENDERER_SURFACE_GRASS_COVERAGE
        #include "shared/Lighting.glsl"
        #include "shared/GrassGroundAppearance.glsl"
      #endif

      vec4 material_ShadowColor;
      vec4 material_BaseColor;
      vec4 material_HighlightColor;
      float material_ShadowStep;
      float material_HighlightStep;
      #ifdef RENDERER_SURFACE_GRASS_COVERAGE
        float material_SurfaceGrassLightScale;
        float material_SurfaceGrassSnowResponse;
        #ifdef MATERIAL_ROCK_TOP_GRASS_TOON_BANDS
          float material_SurfaceGrassToonBandStrength;
        #endif
      #endif

      Varyings SeedWorldRockToonVertex(Attributes attributes) {
        Varyings varyings;
        vec4 localPositionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif
        vec4 localPositionWS = renderer_ModelMat * localPositionOS;
        varyings.positionWS = localPositionWS.xyz / localPositionWS.w;
        varyings.normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        vec4 positionCS = renderer_MVPMat * localPositionOS;

        #ifdef RENDERER_SURFACE_GRASS_COVERAGE
          varyings.positionCS = positionCS;
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
        #endif
        #if SCENE_FOG_MODE != 0
          varyings.positionVS = (renderer_MVMat * localPositionOS).xyz;
        #endif
        #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
          varyings.shadowCoord = getShadowCoord(varyings.positionWS);
        #endif
        gl_Position = positionCS;
        return varyings;
      }

      void SeedWorldRockToonFragment(Varyings varyings) {
        applyTerrainProjectProceduralLodDither(gl_FragCoord.xy);
        vec3 surfaceNormalWS = normalize(varyings.normalWS);
        float shadowAttenuation = sampleTerrainProjectShadow(varyings);
        TerrainProjectToonDiffuseLighting toonLighting = terrainProjectEvaluateToonDiffuseLighting(
          surfaceNormalWS,
          shadowAttenuation,
          material_ShadowStep,
          material_HighlightStep
        );
        vec3 litColor = terrainProjectApplyToonDiffusePalette(
          toonLighting,
          material_ShadowColor.rgb,
          material_BaseColor.rgb,
          material_HighlightColor.rgb
        );

        #ifdef MATERIAL_ROCK_DEBUG_VIEW
          float surfaceGrassCoverage = 0.0;
        #endif

        #ifdef RENDERER_SURFACE_GRASS_COVERAGE
          TerrainProjectSurfaceGrassCoverage grass = terrainProjectEvaluateSurfaceGrassCoverage(
            varyings.positionWS,
            surfaceNormalWS
          );
          #ifdef MATERIAL_ROCK_DEBUG_VIEW
            surfaceGrassCoverage = grass.coverage;
          #else
            if (grass.coverage > 0.0001) {
              SurfaceData grassSurface = terrainProjectBuildGrassGroundSurface(
                varyings,
                grass.nearAlbedo,
                grass.farAlbedo,
                grass.vistaWeight,
                surfaceNormalWS,
                surfaceNormalWS,
                material_SurfaceGrassSnowResponse
              );
              vec3 grassColor = terrainProjectFinalLighting(
                evaluateTerrainProjectLighting(varyings, grassSurface)
              );
              #ifdef MATERIAL_ROCK_TOP_GRASS_TOON_BANDS
                grassColor = terrainProjectApplyToonLightBandsToLitColor(
                  toonLighting,
                  grassColor,
                  material_ShadowColor.rgb,
                  material_BaseColor.rgb,
                  material_HighlightColor.rgb,
                  material_SurfaceGrassToonBandStrength
                );
              #endif
              grassColor *= max(material_SurfaceGrassLightScale, 0.0);
              litColor = mix(litColor, max(grassColor, vec3(0.0)), grass.coverage);
            }
          #endif
        #endif

        #ifdef MATERIAL_ROCK_DEBUG_VIEW
          float diagnostic = 0.0;
          #if MATERIAL_ROCK_DEBUG_VIEW == 1
            diagnostic = surfaceGrassCoverage;
          #elif MATERIAL_ROCK_DEBUG_VIEW == 2
            diagnostic = surfaceGrassCoverage;
          #elif MATERIAL_ROCK_DEBUG_VIEW == 3
            diagnostic = clamp(1.0 - abs(surfaceGrassCoverage * 2.0 - 1.0), 0.0, 1.0);
          #elif MATERIAL_ROCK_DEBUG_VIEW == 4
            diagnostic = 1.0;
          #endif
          gl_FragColor = vec4(vec3(diagnostic), 1.0);
        #else
          vec4 color = vec4(litColor, 1.0);
          #if SCENE_FOG_MODE != 0
            color = fog(color, varyings.positionVS);
          #endif
          gl_FragColor = color;
        #endif
      }
    }

    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }

      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = SeedWorldRockToonShadowVertex;
      FragmentShader = SeedWorldRockToonShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "SeedWorldRockToon/Shadow.glsl"
      #include "shared/ProceduralLodDither.glsl"

      void SeedWorldRockToonShadowVertex(Attributes attributes) {
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif
        vec3 positionWS = (renderer_ModelMat * positionOS).xyz;
        vec3 normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        gl_Position = terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS));
      }

      void SeedWorldRockToonShadowFragment() {
        applyTerrainProjectProceduralLodDither(gl_FragCoord.xy);
        gl_FragColor = terrainProjectShadowColor();
      }
    }
  }
}
