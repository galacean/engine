#ifndef WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
        vec3 appearanceNormalTS = vec3(0.0, 0.0, 1.0);

#if {{DETAIL_LAYER_COUNT}} > 0
#if {{DETAIL_0_SPACE}} == 0
        vec2 appearanceLayerCoordinate0 = baseWorldPosition.xz;
#elif {{DETAIL_0_SPACE}} == 1
        vec2 appearanceLayerCoordinate0 = input.objectPosition.xz;
#elif {{DETAIL_0_SPACE}} == 2
        vec2 appearanceLayerCoordinate0 = input.meshUv;
#else
        vec2 appearanceLayerCoordinate0 = {{FLOW_ADVECTED_COORDINATE}};
#endif
        vec2 appearanceLayerScaled0 = appearanceLayerCoordinate0 * {{DETAIL_0_TRANSFORM}}.xy;
        vec2 appearanceLayerUv0 = vec2(
          appearanceLayerScaled0.x * {{DETAIL_0_ROTATION}}.x - appearanceLayerScaled0.y * {{DETAIL_0_ROTATION}}.y,
          appearanceLayerScaled0.x * {{DETAIL_0_ROTATION}}.y + appearanceLayerScaled0.y * {{DETAIL_0_ROTATION}}.x
        ) + {{DETAIL_0_OFFSET}};
#if {{DETAIL_0_STRENGTH_MODE}} == 0
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormal(
          texture2D({{DETAIL_0_SAMPLER}}, appearanceLayerUv0),
          {{DETAIL_0_STRENGTH}},
          {{DETAIL_0_FLIP_GREEN}}
        );
#else
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D({{DETAIL_0_SAMPLER}}, appearanceLayerUv0),
          {{DETAIL_0_STRENGTH}},
          {{DETAIL_0_FLIP_GREEN}}
        );
#endif
#if {{DETAIL_0_SPACE}} == 3
        // Fade the transported normal, including FirstDetailLayer refraction,
        // rather than switching its time coordinate at a local speed boundary.
        appearanceLayerNormal0 = mix(vec3(0.0, 0.0, 1.0), appearanceLayerNormal0, {{FLOW_ADVECTED_WEIGHT}});
#endif
#if {{DETAIL_0_BLEND_MODE}} == 0
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal0);
#elif {{DETAIL_0_BLEND_MODE}} == 1
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal0);
#elif {{DETAIL_0_BLEND_MODE}} == 2
        appearanceNormalTS = waterSurfaceAppearanceV2BlendReoriented(appearanceNormalTS, appearanceLayerNormal0);
#else
        appearanceNormalTS = waterSurfaceAppearanceV2BlendAddSlope(appearanceNormalTS, appearanceLayerNormal0);
#endif
#endif

#if {{DETAIL_LAYER_COUNT}} > 1
#if {{DETAIL_1_SPACE}} == 0
        vec2 appearanceLayerCoordinate1 = baseWorldPosition.xz;
#elif {{DETAIL_1_SPACE}} == 1
        vec2 appearanceLayerCoordinate1 = input.objectPosition.xz;
#elif {{DETAIL_1_SPACE}} == 2
        vec2 appearanceLayerCoordinate1 = input.meshUv;
#else
        vec2 appearanceLayerCoordinate1 = {{FLOW_ADVECTED_COORDINATE}};
#endif
        vec2 appearanceLayerScaled1 = appearanceLayerCoordinate1 * {{DETAIL_1_TRANSFORM}}.xy;
        vec2 appearanceLayerUv1 = vec2(
          appearanceLayerScaled1.x * {{DETAIL_1_ROTATION}}.x - appearanceLayerScaled1.y * {{DETAIL_1_ROTATION}}.y,
          appearanceLayerScaled1.x * {{DETAIL_1_ROTATION}}.y + appearanceLayerScaled1.y * {{DETAIL_1_ROTATION}}.x
        ) + {{DETAIL_1_OFFSET}};
#if {{DETAIL_1_STRENGTH_MODE}} == 0
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormal(
          texture2D({{DETAIL_1_SAMPLER}}, appearanceLayerUv1),
          {{DETAIL_1_STRENGTH}},
          {{DETAIL_1_FLIP_GREEN}}
        );
#else
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D({{DETAIL_1_SAMPLER}}, appearanceLayerUv1),
          {{DETAIL_1_STRENGTH}},
          {{DETAIL_1_FLIP_GREEN}}
        );
#endif
#if {{DETAIL_1_SPACE}} == 3
        appearanceLayerNormal1 = mix(vec3(0.0, 0.0, 1.0), appearanceLayerNormal1, {{FLOW_ADVECTED_WEIGHT}});
#endif
#if {{DETAIL_1_BLEND_MODE}} == 0
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormals(appearanceNormalTS, appearanceLayerNormal1);
#elif {{DETAIL_1_BLEND_MODE}} == 1
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal1);
#elif {{DETAIL_1_BLEND_MODE}} == 2
        appearanceNormalTS = waterSurfaceAppearanceV2BlendReoriented(appearanceNormalTS, appearanceLayerNormal1);
#else
        appearanceNormalTS = waterSurfaceAppearanceV2BlendAddSlope(appearanceNormalTS, appearanceLayerNormal1);
#endif
#endif

        appearanceNormalTS = normalize(mix(vec3(0.0, 0.0, 1.0), appearanceNormalTS, material_AppearanceV2DetailNormalStrength));
        vec3 appearanceTangentWS = safeNormalize3(
          input.tangentWS - input.macroNormalWS * dot(input.tangentWS, input.macroNormalWS),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 appearanceBitangentWS = safeNormalize3(
          cross(input.macroNormalWS, appearanceTangentWS),
          vec3(0.0, 0.0, 1.0)
        );
        vec3 appearanceSurfaceNormalWS = safeNormalize3(
          appearanceTangentWS * appearanceNormalTS.x
            + appearanceBitangentWS * appearanceNormalTS.y
            + input.macroNormalWS * appearanceNormalTS.z,
          input.macroNormalWS
        );
        surfaceNormalWS = safeNormalize3(
          mix(
            surfaceNormalWS,
            appearanceSurfaceNormalWS,
            {{DETAIL_ENABLED}} * material_MicroNormalsEnabled
          ),
          input.macroNormalWS
        );
#endif
