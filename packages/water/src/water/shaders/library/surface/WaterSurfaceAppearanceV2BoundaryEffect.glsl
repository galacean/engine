#ifndef WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECT_{{INDEX}}_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECT_{{INDEX}}_INCLUDED
        float appearanceBoundaryField{{INDEX}} = {{FIELD}};
        float appearanceBoundaryRawNormalized{{INDEX}} = appearanceBoundaryField{{INDEX}}
          / max({{RANGE}}, 0.0001);
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

#if {{HAS_PATTERN}} == 1
#if {{GUARD_PATTERN_SAMPLE}} == 1
        float appearanceBoundaryPattern{{INDEX}} = 0.0;
        if (appearanceBoundaryMask{{INDEX}} > 0.0001) {
#if {{PATTERN_MODEL}} == 0
          appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
          appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
          appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
        }
#else
#if {{PATTERN_MODEL}} == 0
        float appearanceBoundaryPattern{{INDEX}} = evaluateWaterContactFoamVoronoi( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#elif {{PATTERN_MODEL}} == 1
        float appearanceBoundaryPattern{{INDEX}} = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#else
        float appearanceBoundaryPattern{{INDEX}} = evaluateWaterShorelineBreakerBand( appearanceBoundaryField{{INDEX}}, input.worldPosition.xz, {{PATTERN_TIME}}, {{PATTERN_WORLD_SCALE}}, {{PATTERN_TIME_RATE}}, {{PATTERN_WEIGHTS}}, {{PATTERN_LACUNARITY}} );
#endif
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
#elif {{PATTERN_COMBINE}} == 1
        appearanceBoundaryMask{{INDEX}} = clamp(appearanceBoundaryMask{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
#else
        appearanceBoundaryMask{{INDEX}} = clamp(1.0 - appearanceBoundaryRawNormalized{{INDEX}} + appearanceBoundaryPatternResponse{{INDEX}}, 0.0, 1.0) * {{PATTERN_OPACITY}};
#endif
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
