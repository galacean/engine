#ifndef WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECT_{{INDEX}}_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECT_{{INDEX}}_INCLUDED
        float appearanceBoundaryField{{INDEX}} = {{FIELD}};
        float appearanceBoundaryRawNormalized{{INDEX}} = appearanceBoundaryField{{INDEX}}
          / max({{RANGE}}, 0.0001);
#if {{HAS_PATTERN}} == 0 || {{PATTERN_COMBINE}} != 2
        float appearanceBoundaryNormalized{{INDEX}} = clamp(
          appearanceBoundaryRawNormalized{{INDEX}},
          0.0,
          1.0
        );
#if {{BOUNDARY_RESPONSE}} == 0
        float appearanceBoundaryMask{{INDEX}} = appearanceBoundaryNormalized{{INDEX}};
#elif {{BOUNDARY_RESPONSE}} == 1
        float appearanceBoundaryMask{{INDEX}} = smoothstep(0.0, 1.0, appearanceBoundaryNormalized{{INDEX}});
#else
        float appearanceBoundaryMask{{INDEX}} = pow(appearanceBoundaryNormalized{{INDEX}}, {{BOUNDARY_EXPONENT}});
#endif
#if {{INVERT_BOUNDARY}} == 1
        appearanceBoundaryMask{{INDEX}} = 1.0 - appearanceBoundaryMask{{INDEX}};
#else
        appearanceBoundaryMask{{INDEX}} = appearanceBoundaryMask{{INDEX}};
#endif
#else
        float appearanceBoundaryMask{{INDEX}} = 0.0;
#endif

#if {{HAS_PATTERN}} == 1
        bool appearanceBoundaryGate{{INDEX}} = ({{PATTERN_OPACITY}} > 0.0001);
#if {{OUTPUT_ALPHA}} == 0
        appearanceBoundaryGate{{INDEX}} = appearanceBoundaryGate{{INDEX}} && ({{BOUNDARY_MATERIAL_ENABLED}} > 0.0001);
#endif
#if {{USE_OBSTACLE_BEHIND_GATE}} == 1
        appearanceBoundaryGate{{INDEX}} = appearanceBoundaryGate{{INDEX}} && (centeredDepthBehind > 0.0001);
#endif
#if {{GUARD_PATTERN_SAMPLE}} == 1
        appearanceBoundaryGate{{INDEX}} = appearanceBoundaryGate{{INDEX}} && (appearanceBoundaryMask{{INDEX}} > 0.0001);
#endif
        if (appearanceBoundaryGate{{INDEX}}) {
#if {{PATTERN_COMBINE}} == 2
          float appearanceBoundaryRawNorm{{INDEX}} = appearanceBoundaryRawNormalized{{INDEX}};
#if {{PATTERN_RESPONSE}} == 0
          if (appearanceBoundaryRawNorm{{INDEX}} >= 2.0) {
            appearanceBoundaryMask{{INDEX}} = 0.0;
          } else if (appearanceBoundaryRawNorm{{INDEX}} <= 0.0) {
            appearanceBoundaryMask{{INDEX}} = {{PATTERN_OPACITY}};
          } else {
#if {{PATTERN_MODEL}} == 0
            float appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
#if {{INVERT_PATTERN}} == 0
            float appearanceBoundaryPattern{{INDEX}} = appearanceBoundaryRawNorm{{INDEX}} > 1.0
              ? evaluateWaterAnimatedVoronoiF1UpperBounded( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}}, appearanceBoundaryRawNorm{{INDEX}} - 1.0 )
              : evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
            float appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#else
            float appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#if {{INVERT_PATTERN}} == 1
            float appearanceBoundaryPatternResponse{{INDEX}} = 1.0 - appearanceBoundaryPattern{{INDEX}};
#else
            float appearanceBoundaryPatternResponse{{INDEX}} = appearanceBoundaryPattern{{INDEX}};
#endif
            appearanceBoundaryMask{{INDEX}} = clamp(1.0 - appearanceBoundaryRawNorm{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
          }
#else
          float appearanceBoundaryPatternExp{{INDEX}} = {{PATTERN_EXPONENT}};
          if (appearanceBoundaryPatternExp{{INDEX}} == 0.0) {
            appearanceBoundaryMask{{INDEX}} = clamp(2.0 - appearanceBoundaryRawNorm{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
          } else if (appearanceBoundaryPatternExp{{INDEX}} < 0.0) {
            if (appearanceBoundaryRawNorm{{INDEX}} <= 1.0) {
              appearanceBoundaryMask{{INDEX}} = {{PATTERN_OPACITY}};
            } else {
              float appearanceBoundaryPMax{{INDEX}} = -1.0;
              bool appearanceBoundaryAlwaysZero{{INDEX}} = false;
              if (appearanceBoundaryRawNorm{{INDEX}} > 2.0) {
                float appearanceBoundaryBaseReq{{INDEX}} = pow(
                  appearanceBoundaryRawNorm{{INDEX}} - 1.0,
                  1.0 / appearanceBoundaryPatternExp{{INDEX}}
                );
                if (appearanceBoundaryBaseReq{{INDEX}} <= 0.0001) {
                  appearanceBoundaryAlwaysZero{{INDEX}} = true;
                }
#if {{INVERT_PATTERN}} == 1 && {{PATTERN_MODEL}} == 1
                else {
                  appearanceBoundaryPMax{{INDEX}} = 1.0 - appearanceBoundaryBaseReq{{INDEX}};
                }
#endif
              }
              if (appearanceBoundaryAlwaysZero{{INDEX}}) {
                appearanceBoundaryMask{{INDEX}} = 0.0;
              } else {
#if {{PATTERN_MODEL}} == 0
                float appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
#if {{INVERT_PATTERN}} == 1
                float appearanceBoundaryPattern{{INDEX}} = appearanceBoundaryPMax{{INDEX}} >= 0.0
                  ? evaluateWaterAnimatedVoronoiF1UpperBounded( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}}, appearanceBoundaryPMax{{INDEX}} )
                  : evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
                float appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#else
                float appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#if {{INVERT_PATTERN}} == 1
                float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(1.0 - appearanceBoundaryPattern{{INDEX}}), 0.0001), appearanceBoundaryPatternExp{{INDEX}});
#else
                float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(appearanceBoundaryPattern{{INDEX}}), 0.0001), appearanceBoundaryPatternExp{{INDEX}});
#endif
                appearanceBoundaryMask{{INDEX}} = clamp(1.0 - appearanceBoundaryRawNorm{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
              }
            }
          } else {
            if (appearanceBoundaryRawNorm{{INDEX}} >= 2.0) {
              appearanceBoundaryMask{{INDEX}} = 0.0;
            } else if (appearanceBoundaryRawNorm{{INDEX}} <= 0.0) {
              appearanceBoundaryMask{{INDEX}} = {{PATTERN_OPACITY}};
            } else {
              float appearanceBoundaryPMax{{INDEX}} = -1.0;
#if {{INVERT_PATTERN}} == 0 && {{PATTERN_MODEL}} == 1
              if (appearanceBoundaryRawNorm{{INDEX}} > 1.0) {
                float appearanceBoundaryBaseMax{{INDEX}} = pow(
                  appearanceBoundaryRawNorm{{INDEX}} - 1.0,
                  1.0 / appearanceBoundaryPatternExp{{INDEX}}
                );
                if (appearanceBoundaryBaseMax{{INDEX}} > 0.0001) {
                  appearanceBoundaryPMax{{INDEX}} = appearanceBoundaryBaseMax{{INDEX}};
                }
              }
#endif
#if {{PATTERN_MODEL}} == 0
              float appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
#if {{INVERT_PATTERN}} == 0
              float appearanceBoundaryPattern{{INDEX}} = appearanceBoundaryPMax{{INDEX}} >= 0.0
                ? evaluateWaterAnimatedVoronoiF1UpperBounded( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}}, appearanceBoundaryPMax{{INDEX}} )
                : evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
              float appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#else
              float appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
#if {{INVERT_PATTERN}} == 1
              float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(1.0 - appearanceBoundaryPattern{{INDEX}}), 0.0001), appearanceBoundaryPatternExp{{INDEX}});
#else
              float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(appearanceBoundaryPattern{{INDEX}}), 0.0001), appearanceBoundaryPatternExp{{INDEX}});
#endif
              appearanceBoundaryMask{{INDEX}} = clamp(1.0 - appearanceBoundaryRawNorm{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
            }
          }
#endif
#else
#if {{PATTERN_MODEL}} == 0
          float appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
          float appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
          float appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif

#if {{PATTERN_RESPONSE}} == 0
#if {{INVERT_PATTERN}} == 1
          float appearanceBoundaryPatternResponse{{INDEX}} = 1.0 - appearanceBoundaryPattern{{INDEX}};
#else
          float appearanceBoundaryPatternResponse{{INDEX}} = appearanceBoundaryPattern{{INDEX}};
#endif
#else
#if {{INVERT_PATTERN}} == 1
          float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(1.0 - appearanceBoundaryPattern{{INDEX}}), 0.0001), {{PATTERN_EXPONENT}});
#else
          float appearanceBoundaryPatternResponse{{INDEX}} = pow(max(abs(appearanceBoundaryPattern{{INDEX}}), 0.0001), {{PATTERN_EXPONENT}});
#endif
#endif

#if {{PATTERN_COMBINE}} == 0
          appearanceBoundaryMask{{INDEX}} = appearanceBoundaryMask{{INDEX}} * appearanceBoundaryPatternResponse{{INDEX}} * {{PATTERN_OPACITY}};
#else
          appearanceBoundaryMask{{INDEX}} = clamp(appearanceBoundaryMask{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
#endif
#endif
        } else {
          appearanceBoundaryMask{{INDEX}} = 0.0;
        }
#endif

#if {{USE_OBSTACLE_BEHIND_GATE}} == 1
        appearanceBoundaryMask{{INDEX}} *= centeredDepthBehind;
#else
        appearanceBoundaryMask{{INDEX}} *= 1.0;
#endif
#if {{EMIT_CONTACT_FOAM}} == 1
        contactFoamMask = max(
          contactFoamMask,
          appearanceBoundaryMask{{INDEX}}
            * {{BOUNDARY_MATERIAL_ENABLED}}
        );
#endif
#if {{OUTPUT_ALPHA}} == 1
        appearanceCoastalAlpha = max(
          appearanceCoastalAlpha,
          appearanceBoundaryMask{{INDEX}} * {{BOUNDARY_ALPHA}}
        );
#endif
#if {{OUTPUT_COLOR}} == 1
#if {{COLOR_ALBEDO}} == 1
        float albedoWeight{{INDEX}} = clamp(appearanceBoundaryMask{{INDEX}} * {{BOUNDARY_MATERIAL_ENABLED}}, 0.0, 1.0);
        appearanceBoundaryAlbedo = mix(appearanceBoundaryAlbedo, {{BOUNDARY_COLOR}}, albedoWeight{{INDEX}});
        appearanceBoundaryAlbedoWeight = mix(appearanceBoundaryAlbedoWeight, 1.0, albedoWeight{{INDEX}});
#else
        appearanceBoundaryColor += appearanceBoundaryMask{{INDEX}}
          * {{BOUNDARY_COLOR}}
          * {{BOUNDARY_MATERIAL_ENABLED}};
#endif
#endif
#if {{OUTPUT_ROUGHNESS}} == 1
        appearanceBoundaryRoughness += appearanceBoundaryMask{{INDEX}}
          * {{BOUNDARY_ROUGHNESS}}
          * {{BOUNDARY_MATERIAL_ENABLED}};
#endif
#if {{OUTPUT_REFRACTION}} == 1
        appearanceBoundaryRefractionSuppression = max(
          appearanceBoundaryRefractionSuppression,
          appearanceBoundaryMask{{INDEX}}
            * {{BOUNDARY_REFRACTION_SUPPRESSION}}
            * {{BOUNDARY_MATERIAL_ENABLED}}
        );
#endif
#endif
