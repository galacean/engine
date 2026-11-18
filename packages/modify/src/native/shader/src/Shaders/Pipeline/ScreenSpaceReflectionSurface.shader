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
      float material_ScreenSpaceReflectionIntensity;

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
          float fogVisibility = 1.0;
          #if SCENE_FOG_MODE != 0
            fogVisibility = getScreenSpaceReflectionFogVisibility(varyings.positionVS);
          #endif
          reflectionResponse = saturate(baseLobeResponse * material_ScreenSpaceReflectionIntensity * fogVisibility);
        }

        ScreenSpaceReflectionSurfaceOutput output;
        output.geometry = packScreenSpaceReflectionSurface(surfaceData.normal, bsdfData.roughness, 1.0);
        output.responseColor = vec4(reflectionResponse, 1.0);
        return output;
      }
    }
  }
}
