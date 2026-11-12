        vec3 surfaceNormalWS = safeNormalize3(input.macroNormalWS, input.macroNormalWS);
{{APPEARANCE_NORMAL_STATEMENTS}}
#if {{CONNECTION_BEFORE_RAIN}}
        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
#endif
{{RAIN_NORMAL_STATEMENTS}}
#if !{{CONNECTION_BEFORE_RAIN}}
        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
#endif
