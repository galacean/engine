        WaterSurfaceFinalClosureV2Input closureInput;
{{ALPHA_INPUT_ASSIGNMENTS}}
#ifdef MATERIAL_WATER_CONNECTIONS
        opticalDepth *= waterConnectionFacts(input.worldPosition.xz).x;
#endif
        float fragmentAlpha = waterSurfaceResolveAlphaV2(
          material_Alpha, saturate(material_Clarity), opticalDepth, waterSurfaceSchlick(fresnelF0, 1.0, normalDotView),
          contactFoamMask,
          closureInput.coastalAlpha, closureInput.coastalAlphaWeight
        ) * clamp(coverage, 0.0, 1.0);
