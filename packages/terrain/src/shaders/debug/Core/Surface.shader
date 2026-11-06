Shader "Terrain/Debug/Core/Surface" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = SurfaceCoreDebugVertex;
      FragmentShader = SurfaceCoreDebugFragment;

      #define TERRAIN_PROJECT_FORWARD_PASS
      #if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && \
        (defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_ENABLE_COVERAGE))
        #define NEED_VERTEX_TANGENT
      #endif
      #if defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_ENABLE_COVERAGE)
        #define NEED_TANGENT_SPACE
      #endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"

      struct Varyings {
        vec2 uv;
        vec3 sourcePositionOS;
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          vec3 sourceNormalOS;
        #endif
        vec3 positionWS;
        vec3 normalWS;
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
      #include "surface/SurfaceEvaluation.glsl"
      #include "shared/LodDither.glsl"
      #include "shared/Lighting.glsl"
      #include "debug/MeshCoreDebug.glsl"

      Varyings SurfaceCoreDebugVertex(Attributes attributes) {
        Varyings varyings;
        vec4 positionOS = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normalOS = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangentOS = attributes.TANGENT;
          #endif
        #else
          vec3 normalOS = vec3(0.0, 1.0, 0.0);
        #endif

        #ifdef RENDERER_HAS_BLENDSHAPE
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
        #ifdef RENDERER_HAS_SKIN
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

        #ifdef RENDERER_HAS_UV
          varyings.uv = attributes.TEXCOORD_0;
        #else
          varyings.uv = vec2(0.0);
        #endif
        varyings.sourcePositionOS = positionOS.xyz;
        #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
          varyings.sourceNormalOS = normalOS;
        #endif
        vec4 homogeneousPositionWS = renderer_ModelMat * positionOS;
        varyings.positionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
        varyings.normalWS = normalize(mat3(renderer_NormalMat) * normalOS);
        #ifdef NEED_VERTEX_TANGENT
          varyings.tangentWS = normalize(mat3(renderer_NormalMat) * tangentOS.xyz);
          varyings.bitangentWS = cross(varyings.normalWS, varyings.tangentWS) * tangentOS.w;
        #endif
        varyings.positionCS = renderer_MVPMat * positionOS;

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

      void SurfaceCoreDebugFragment(Varyings varyings) {
        if (abs(material_DebugView - TERRAIN_PROJECT_DEBUG_LOD_FADE) > 0.5) {
          applyTerrainProjectLodDither(gl_FragCoord.xy);
        }
        SurfaceData surfaceData = evaluateSurfaceMaterial(varyings, gl_FrontFacing);
        TerrainProjectLightingResult lighting = evaluateTerrainProjectLighting(varyings, surfaceData);
        vec3 geometryNormal = normalize(varyings.normalWS) * (gl_FrontFacing ? 1.0 : -1.0);
        gl_FragColor = vec4(terrainProjectMeshCoreDebugColor(surfaceData, lighting, geometryNormal), 1.0);
      }
    }
  }
}
