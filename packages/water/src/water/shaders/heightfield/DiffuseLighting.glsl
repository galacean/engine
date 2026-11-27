        vec3 directDiffuseRadiance = vec3(0.0);
        vec3 directSpecularRadiance = vec3(0.0);
#if defined(SCENE_VOLUMETRIC_CLOUD_SHADOW) && !defined(RENDERER_WORLD_PICK)
        float cloudShadowAttenuation = input.cloudShadow;
#else
        float cloudShadowAttenuation = 1.0;
#endif
        evaluateWaterSurfaceDirectionalLighting(
          cloudShadowAttenuation,
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