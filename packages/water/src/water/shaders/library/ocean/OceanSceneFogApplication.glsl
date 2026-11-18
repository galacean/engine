#if SCENE_FOG_MODE != 0
        {
          {{COLOR_EXPRESSION}} = waterOceanApplySceneFog(
            vec4({{COLOR_EXPRESSION}}, 1.0),
            input.positionVS
          ).rgb;
        }
#endif
