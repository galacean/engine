        vec3 directDiffuseRadiance = vec3(0.0);
        vec3 directSpecularRadiance = vec3(0.0);
        evaluateWaterSurfaceDirectionalLighting(
          input.worldPosition,
          surfaceNormalWS,
          viewDirection,
          normalDotView,
          fresnelF0,
          effectiveSurfaceRoughness,
          {{VALUE_001_LITSCENECOLORCLOSURE_1_0_0_0}},
          directDiffuseRadiance,
          directSpecularRadiance
        );
        directSpecularRadiance *= material_AppearanceDirectSpecularEnabled;
        vec3 ambientDiffuse = waterSurfaceAppearanceAmbientIrradiance(surfaceNormalWS)
          / WATER_SURFACE_PI;
        vec3 waterDiffuseLighting = max(ambientDiffuse + directDiffuseRadiance, vec3(0.0));