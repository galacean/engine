        if (material_DebugMode > {{FINAL_MODE}}) {
          if (material_DebugMode < {{BASE_HEIGHT_MODE}}) {
            fragmentColor = vec3(fract(abs(input.baseSurfaceHeight) * 0.1));
          } else if (material_DebugMode < {{BASE_NORMAL_MODE}}) {
            fragmentColor = normalize(input.baseNormalWS) * 0.5 + 0.5;
          } else if (material_DebugMode < {{SIGNED_DISTANCE_MODE}}) {
            fragmentColor = signedDistance >= 0.0
              ? vec3(0.1, clamp(signedDistance / max(material_LocalMapDecode.z, 0.001), 0.0, 1.0), 1.0)
              : vec3(1.0, 0.1, 0.1);
          } else if (material_DebugMode < {{DEPTH_MODE}}) {
            fragmentColor = vec3(depthRatio);
          } else if (material_DebugMode < {{FLOW_MODE}}) {
            fragmentColor = vec3(flowDirection * 0.5 + 0.5, clamp(length(flowXZ), 0.0, 1.0));
          } else if (material_DebugMode < {{WAVE_DISPLACEMENT_MODE}}) {
            float normalizedWave = input.waveOffset / max(material_MaxVerticalDisplacement, 0.0001) * 0.5 + 0.5;
            fragmentColor = vec3(normalizedWave, 0.2, 1.0 - normalizedWave);
          } else if (material_DebugMode < {{CENTERED_OPAQUE_COLOR_MODE}}) {
            fragmentColor = centeredOpaqueColor;
          } else if (material_DebugMode < {{DISPLACED_OPAQUE_COLOR_MODE}}) {
            fragmentColor = displacedOpaqueColor;
          } else if (material_DebugMode < {{REFRACTION_UV_DELTA_MODE}}) {
            // Signed UV delta: neutral is 0.5 in RG; +/- 1/64 screen maps to [0, 1].
            fragmentColor = vec3(
              clamp(refractionUvDelta * 32.0 + 0.5, vec2(0.0), vec2(1.0)),
              0.5
            );
          } else if (material_DebugMode < {{OPTICAL_DEPTH_MODE}}) {
            fragmentColor = vec3(depthRatio);
          } else if (material_DebugMode < {{DEPTH_CONTINUITY_MODE}}) {
            fragmentColor = vec3(refractionDepthContinuity);
          } else if (material_DebugMode < {{SAMPLE_VALIDITY_MODE}}) {
            fragmentColor = vec3(refractionSampleValidity);
          } else if (material_DebugMode < {{FRESNEL_MODE}}) {
            fragmentColor = vec3(reflectionFresnel);
          } else if (material_DebugMode < {{SHADER_COMPOSITED_COLOR_MODE}}) {
            fragmentColor = shaderCompositedColor;
          } else if (material_DebugMode < {{SURFACE_ALPHA_MODE}}) {
            fragmentColor = vec3(surfaceAlpha);
          } else if (material_DebugMode < {{REFLECTION_SOURCE_MODE}}) {
            fragmentColor = reflectionSourceDebug;
          } else if (material_DebugMode < {{REFRACTION_AMOUNT_MODE}}) {
            fragmentColor = vec3(resolvedContributions.refractionWeight);
          } else if (material_DebugMode < {{REFRACTION_GATES_MODE}}) {
            // R/G/B isolate the depth, shore, and Beer-Lambert transmission gates.
            fragmentColor = vec3(
              refractionDepthWeight,
              refractionShoreWeight,
              waterSurfaceOpticalTransmittance(material_AbsorptionCoefficient, opticalDepth).g
            );
          } else if (material_DebugMode < {{REFLECTION_COLOR_MODE}}) {
            fragmentColor = reflectionColor;
          } else if (material_DebugMode < {{NORMAL_DOT_VIEW_MODE}}) {
            fragmentColor = vec3(normalDotView);
          } else if (material_DebugMode < {{DETAIL_NORMAL_MODE}}) {
            fragmentColor = appearanceNormalTS * 0.5 + 0.5;
          } else if (material_DebugMode < {{SCENE_DEPTH_DELTA_MODE}}) {
            fragmentColor = vec3({{DEPTH_DEBUG_VALUE}});
          } else if (material_DebugMode < {{DEPTH_TINT_MODE}}) {
            fragmentColor = vec3(appearanceDepthTintFactor);
          } else if (material_DebugMode < {{CONTACT_FOAM_MODE}}) {
            fragmentColor = vec3(contactFoamMask);
          } else if (material_DebugMode < {{COASTAL_ALPHA_MODE}}) {
            fragmentColor = vec3(appearanceCoastalAlpha);
          } else if (material_DebugMode < {{DIRECT_SPECULAR_MODE}}) {
            fragmentColor = directSpecularRadiance;
          } else if (material_DebugMode < {{EFFECTIVE_ROUGHNESS_MODE}}) {
            fragmentColor = vec3(effectiveSurfaceRoughness);
          } else if (material_DebugMode < {{ENVIRONMENT_REFLECTION_MODE}}) {
            fragmentColor = environmentReflectionDebug;
          } else {
            fragmentColor = reflectionColor;
          }
          // Debug outputs are diagnostic values, not another alpha-composited water layer.
          fragmentAlpha = 1.0;
        }
