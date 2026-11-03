#ifndef WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_{{SECTION}}_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_{{SECTION}}_INCLUDED
#if {{SECTION}} == 0
#if {{MODEL}} == 0
        float appearanceDepthTintFactor = 0.0;
        vec3 appearanceDepthTintColor = vec3(0.0);
#elif {{MODEL}} == 5
        float appearanceDepthTintFactor = min(max({{FIELD}}, 0.0) * {{COEFFICIENT_1}}, material_AppearanceV2DepthMaximumOpacity);
        vec3 appearanceDepthTintColor = mix({{SHALLOW_COLOR}}.rgb, {{DEEP_COLOR}}.rgb, clamp(max({{FIELD}}, 0.0) * {{COEFFICIENT_0}}, 0.0, 1.0));
#elif {{MODEL}} == 4
        float appearanceDepthTintFactor = 1.0 - exp(-max({{FIELD}}, 0.0) * {{COEFFICIENT_0}});
        vec3 appearanceDepthTintColor = {{DEEP_COLOR}}.rgb;
#elif {{MODEL}} == 1
        float appearanceDepthTintFactor = waterSurfaceAppearanceDepthTintFactor(
          {{FIELD}},
          {{DISTANCE}},
          {{EXPONENT}}
        );
        vec3 appearanceDepthTintColor = {{COLOR}}.rgb;
#elif {{MODEL}} == 2
        float appearanceDepthTintFactor = clamp({{FIELD}} / max({{DISTANCE}}, 0.0001), 0.0, 1.0);
        vec3 appearanceDepthTintColor = {{COLOR_0}}.rgb;
        appearanceDepthTintColor = mix(
          appearanceDepthTintColor,
          {{COLOR_1}}.rgb,
          smoothstep(
            {{POSITION_0}},
            {{POSITION_1}},
            appearanceDepthTintFactor
          )
        );
#if {{COLOR_STOP_COUNT}} > 2
        appearanceDepthTintColor = mix(
          appearanceDepthTintColor,
          {{COLOR_2}}.rgb,
          smoothstep(
            {{POSITION_1}},
            {{POSITION_2}},
            appearanceDepthTintFactor
          )
        );
#endif
#if {{COLOR_STOP_COUNT}} > 3
        appearanceDepthTintColor = mix(
          appearanceDepthTintColor,
          {{COLOR_3}}.rgb,
          smoothstep(
            {{POSITION_2}},
            {{POSITION_3}},
            appearanceDepthTintFactor
          )
        );
#endif
#else
        float appearanceDepthTerm0 = max({{FIRST_FIELD}}, 0.0)
          * {{COEFFICIENT_0}};
        float appearanceDepthTerm1 = max({{SECOND_FIELD}}, 0.0)
          * {{COEFFICIENT_1}};
        float appearanceDepthTintFactor = waterSurfaceCompositeExponentialDensity(
          appearanceDepthTerm0,
          appearanceDepthTerm1
        );
        vec3 appearanceDepthShallowColor = {{SHALLOW_COLOR}}.rgb;
        vec3 appearanceDepthTintColor = {{DEEP_COLOR}}.rgb;
#endif
        appearanceDepthTintColor = appearanceDepthTintColor * (1.0 - appearanceBoundaryAlbedoWeight) + appearanceBoundaryAlbedo;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + appearanceBoundaryAlbedoWeight, 0.0, 1.0);
#if {{HAS_CAUSTICS}} == 1
        vec3 causticsView = normalize(camera_Position - input.worldPosition);
        vec2 causticsUv = input.worldPosition.xz * material_AppearanceV2CausticsTransform.xy
          + {{CAUSTICS_OFFSET}}
          + material_AppearanceV2CausticsParallax.x * causticsView.xz / (abs(causticsView.y) + material_AppearanceV2CausticsParallax.y)
          + appearanceLayerNormal0.x * material_AppearanceV2CausticsResponse.y;
        vec3 causticsColor = clamp(texture2D(material_AppearanceV2CausticsTexture, causticsUv).rgb * material_AppearanceV2CausticsResponse.x, 0.0, 1.0)
          * (1.0 - clamp(max({{CAUSTICS_DEPTH}}, 0.0) * material_AppearanceV2CausticsResponse.z, 0.0, 1.0));
        appearanceDepthTintColor += causticsColor;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + length(causticsColor) * material_AppearanceV2CausticsResponse.w, 0.0, 1.0);
#endif
#if {{REFRACTED_ALBEDO}} == 1
        appearanceDepthTintFactor *= appearanceCoastalAlpha;
#endif
#else
        if ({{DEBUG_VIEW}} > {{FINAL_THRESHOLD}}) {
          float appearanceDebugValue = 0.0;
          if ({{DEBUG_VIEW}} < {{SURFACE_NORMAL_DEPTH_THRESHOLD}}) {
            appearanceDebugValue = clamp({{SCENE_RAY_DEPTH}} / 10.0, 0.0, 1.0);
          } else if ({{DEBUG_VIEW}} < {{SCENE_RAY_TERM_THRESHOLD}}) {
            appearanceDebugValue = clamp({{SURFACE_NORMAL_DEPTH}} / 10.0, 0.0, 1.0);
          } else if ({{DEBUG_VIEW}} < {{SURFACE_NORMAL_TERM_THRESHOLD}}) {
            appearanceDebugValue = clamp(
              max({{FIRST_FIELD}}, 0.0) * {{COEFFICIENT_0}},
              0.0,
              1.0
            );
          } else if ({{DEBUG_VIEW}} < {{DENSITY_THRESHOLD}}) {
            appearanceDebugValue = clamp(
              max({{SECOND_FIELD}}, 0.0) * {{COEFFICIENT_1}},
              0.0,
              1.0
            );
          } else {
            appearanceDebugValue = clamp({{DENSITY}}, 0.0, 1.0);
          }
          {{OUTPUT_COLOR}} = vec3(appearanceDebugValue);
        }
#endif
#endif
