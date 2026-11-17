Shader "Pipeline/ScreenSpaceReflectionSurface" {
  SubShader "Default" {
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV3"
      }

      RenderQueueType renderQueueType;
      CullMode rasterStateCullMode;

      DepthState = {
        Enabled = true;
        WriteEnabled = true;
      }

      BlendState = {
        Enabled = false;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = renderQueueType;

      VertexShader = PBRVertex;
      FragmentShader = screenSpaceReflectionSurfaceFragment;

      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      float material_ScreenSpaceReflectionMode;
      #ifndef PBR_TRANSMISSION_SSR
        float material_ScreenSpaceReflectionIntensity;
      #endif


      struct ScreenSpaceReflectionSurfaceOutput {
        layout(location = 0) vec4 geometry;
        layout(location = 1) vec4 responseColor;
      };

      float getScreenSpaceReflectionFogVisibility(vec3 positionVS) {
        #if SCENE_FOG_MODE != 0
          return getSceneFogVisibility(positionVS);
        #else
          return 1.0;
        #endif
      }

      ScreenSpaceReflectionSurfaceOutput screenSpaceReflectionSurfaceFragment(Varyings varyings) {
        if (material_ScreenSpaceReflectionMode < 0.5 || material_ScreenSpaceReflectionIntensity <= 0.0) {
          discard;
        }

        vec2 aoUV = varyings.uv;
        #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(RENDERER_HAS_UV1)
          if (material_OcclusionTextureCoord == 1.0) {
            aoUV = varyings.uv1;
          }
        #endif

        SurfaceData surfaceData = getSurfaceData(varyings, aoUV, gl_FrontFacing);
        BSDFData bsdfData;
        initBSDFData(surfaceData, bsdfData);

        vec3 reflectionResponse = vec3(material_ScreenSpaceReflectionIntensity);
        bool isOpaqueReceiver =
          material_ScreenSpaceReflectionMode < 1.5 || material_ScreenSpaceReflectionMode > 2.5;
        if (isOpaqueReceiver) {
          float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.roughness);
          vec3 baseLobeResponse =
            specularAO *
            envBRDFApprox(
              bsdfData.resolvedSpecularF0,
              bsdfData.specularF90,
              bsdfData.roughness,
              surfaceData.dotNV
            ) *
            bsdfData.energyCompensation;
          #ifdef MATERIAL_ENABLE_CLEAR_COAT
            baseLobeResponse *= evaluateClearCoatIBLAttenuation(surfaceData, bsdfData);
          #endif
          #ifdef MATERIAL_ENABLE_SHEEN
            // Match Forward's base-layer attenuation, leaving the Sheen term unchanged.
            baseLobeResponse *= bsdfData.sheenScaling;
          #endif
          float fogVisibility = 1.0;
          #if SCENE_FOG_MODE != 0
            fogVisibility = getScreenSpaceReflectionFogVisibility(varyings.positionVS);
          #endif
          reflectionResponse = saturate(baseLobeResponse * material_ScreenSpaceReflectionIntensity * fogVisibility);
        }

        ScreenSpaceReflectionSurfaceOutput output;
        // Match the direction already used by Forward's anisotropic IBL.
        // The same packed normal drives Trace and the environment subtraction.
        #ifdef MATERIAL_ENABLE_ANISOTROPY
          vec3 receiverNormal = surfaceData.anisotropicN;
        #else
          vec3 receiverNormal = surfaceData.normal;
        #endif
        output.geometry = packScreenSpaceReflectionSurface(receiverNormal, bsdfData.roughness, 1.0);
        output.responseColor = vec4(reflectionResponse, 1.0);
        return output;
      }
    }
  }
}
