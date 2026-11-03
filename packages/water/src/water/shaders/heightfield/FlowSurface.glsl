        vec2 layerFlowDirection0 = safeNormalize2(
          mix(
            vec2({{STILL_DIRECTION_0_X}}, {{STILL_DIRECTION_0_Y}}),
            flowDirection,
            flowWeight
          ),
          flowDirection
        );
        vec4 flowSurface0 = sampleFlowSurface(
          waterWorldToLocalXZ(baseWorldPosition.xz),
          layerFlowDirection0,
          flowSpeed,
          elapsedTime * material_TimeScale,
          {{LAYER_SCALE_0}},
          {{LAYER_RATE_0}},
          vec2({{LAYER_OFFSET_0_X}}, {{LAYER_OFFSET_0_Y}}),
          vec2({{LAYER_CYCLE_JUMP_0_X}}, {{LAYER_CYCLE_JUMP_0_Y}}),
          vec2({{LAYER_SPATIAL_PHASE_0_X}}, {{LAYER_SPATIAL_PHASE_0_Y}})
        );
#if {{LAYER_COUNT}} > 1
        vec2 layerFlowDirection1 = safeNormalize2(
          mix(
            vec2({{STILL_DIRECTION_1_X}}, {{STILL_DIRECTION_1_Y}}),
            flowDirection,
            flowWeight
          ),
          flowDirection
        );
        vec4 flowSurface1 = sampleFlowSurface(
          waterWorldToLocalXZ(baseWorldPosition.xz),
          layerFlowDirection1,
          flowSpeed,
          elapsedTime * material_TimeScale,
          {{LAYER_SCALE_1}},
          {{LAYER_RATE_1}},
          vec2({{LAYER_OFFSET_1_X}}, {{LAYER_OFFSET_1_Y}}),
          vec2({{LAYER_CYCLE_JUMP_1_X}}, {{LAYER_CYCLE_JUMP_1_Y}}),
          vec2({{LAYER_SPATIAL_PHASE_1_X}}, {{LAYER_SPATIAL_PHASE_1_Y}})
        );
#endif
#if {{LAYER_COUNT}} > 2
        vec2 layerFlowDirection2 = safeNormalize2(
          mix(
            vec2({{STILL_DIRECTION_2_X}}, {{STILL_DIRECTION_2_Y}}),
            flowDirection,
            flowWeight
          ),
          flowDirection
        );
        vec4 flowSurface2 = sampleFlowSurface(
          waterWorldToLocalXZ(baseWorldPosition.xz),
          layerFlowDirection2,
          flowSpeed,
          elapsedTime * material_TimeScale,
          {{LAYER_SCALE_2}},
          {{LAYER_RATE_2}},
          vec2({{LAYER_OFFSET_2_X}}, {{LAYER_OFFSET_2_Y}}),
          vec2({{LAYER_CYCLE_JUMP_2_X}}, {{LAYER_CYCLE_JUMP_2_Y}}),
          vec2({{LAYER_SPATIAL_PHASE_2_X}}, {{LAYER_SPATIAL_PHASE_2_Y}})
        );
#endif
#if {{LAYER_COUNT}} == 1
        vec4 flowSurface = (flowSurface0 * {{LAYER_WEIGHT_0}}) / {{LAYER_WEIGHT_SUM_1}};
#elif {{LAYER_COUNT}} == 2
        vec4 flowSurface = (flowSurface0 * {{LAYER_WEIGHT_0}} + flowSurface1 * {{LAYER_WEIGHT_1}}) / {{LAYER_WEIGHT_SUM_2}};
#else
        vec4 flowSurface = (
          flowSurface0 * {{LAYER_WEIGHT_0}}
          + flowSurface1 * {{LAYER_WEIGHT_1}}
          + flowSurface2 * {{LAYER_WEIGHT_2}}
        ) / {{LAYER_WEIGHT_SUM_3}};
#endif
