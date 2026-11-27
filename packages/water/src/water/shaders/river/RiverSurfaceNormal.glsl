// Shared by Forward and the SSR receiver, including detail layers and face orientation.
        vec2 baseFlow = safeNormalize2(input.worldFlow, vec2(0.0, 1.0));
        vec2 localFlowDirection = safeNormalize2(localFlow, baseFlow);
        vec2 flowDirection = safeNormalize2(mix(baseFlow, localFlowDirection, localFlowWeight), baseFlow);
        float flowSpeed = max(input.localFlowSpeed * material_FlowSpeed, 0.0);
        vec3 surfaceNormalWS = evaluateRiverFlowNormalWS(input.motionCoordinates, input.riverHalfWidth,
          input.localFlowSpeed, flowDirection, normalize(input.macroNormalWS));
        vec3 baseWorldPosition = input.worldPosition;
        float material_MicroNormalsEnabled = material_MicroSurfaceEnabled;
{{APPEARANCE_NORMAL}}
        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        // Geometry decides which side of the sheet is visible. Flipping individual
        // detail normals at grazing angles creates discontinuous dark islands.
        float geometryFacingSign = step(0.0, dot(input.macroNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= geometryFacingSign;
