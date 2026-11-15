Shader "Pipeline/ScreenSpaceReflectionSurface" {
  SubShader "Default" {
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV3",
        screenSpaceReflectionClearCoat = "SingleLayerV1",
        screenSpaceReflectionSourceConfidence = "SignedAlphaV1"
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
      float camera_ScreenSpaceReflectionSurfaceMaxRoughness;

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

        float sourceConfidence = 1.0;
        vec3 reflectionResponse = vec3(material_ScreenSpaceReflectionIntensity);
        vec3 receiverNormal = surfaceData.normal;
        float receiverRoughness = bsdfData.roughness;
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
            vec3 coatLobeResponse = surfaceData.clearCoat * evaluateClearCoatIBLResponse(surfaceData, bsdfData);
            float maxRoughness = max(camera_ScreenSpaceReflectionSurfaceMaxRoughness, EPSILON);
            // Score the eligible lobes using the same roughness confidence as Trace.
            // Never interpolate normals or subtract the unselected lobe's environment.
            float baseScore = max(max(baseLobeResponse.r, baseLobeResponse.g), baseLobeResponse.b) *
              saturate(1.0 - bsdfData.roughness / maxRoughness);
            float coatScore = max(max(coatLobeResponse.r, coatLobeResponse.g), coatLobeResponse.b) *
              saturate(1.0 - bsdfData.clearCoatRoughness / maxRoughness);
            float scoreSum = baseScore + coatScore;
            float dominance = abs(coatScore - baseScore) / max(scoreSum, EPSILON);
            // Fade this receiver's correction through IBL near a layer switch.
            // Spatial filtering must also weight sources before mixing trace RGB.
            sourceConfidence = smoothstep(0.0, 0.1, dominance);
            if (coatScore > baseScore) {
              receiverNormal = surfaceData.clearCoatNormal;
              receiverRoughness = bsdfData.clearCoatRoughness;
              baseLobeResponse = coatLobeResponse;
            }
          #endif
          float fogVisibility = 1.0;
          #if SCENE_FOG_MODE != 0
            fogVisibility = getScreenSpaceReflectionFogVisibility(varyings.positionVS);
          #endif
          reflectionResponse = saturate(baseLobeResponse * material_ScreenSpaceReflectionIntensity * fogVisibility);
        }

        // Preserve the original response's RGBA8 rounding even when a layered
        // receiver requires signed alpha in a half-float attachment.
        reflectionResponse = floor(reflectionResponse * 255.0 + 0.5) / 255.0;
        ScreenSpaceReflectionSurfaceOutput output;
        output.geometry = packScreenSpaceReflectionSurface(receiverNormal, receiverRoughness, 1.0);
        // SignedAlphaV1 is opt-in and only emitted for the layered variant.
        // RGB remains the unscaled lobe response; negative alpha stores a
        // dimensionless source confidence, not BRDF, intensity, AO or fog.
        #ifdef MATERIAL_ENABLE_CLEAR_COAT
          output.responseColor = vec4(reflectionResponse, -1.0 - sourceConfidence);
        #else
          output.responseColor = vec4(reflectionResponse, 1.0);
        #endif
        return output;
      }
    }
  }
}
