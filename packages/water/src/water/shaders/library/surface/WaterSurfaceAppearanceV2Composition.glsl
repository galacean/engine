#ifndef WATER_SURFACE_APPEARANCE_V2_COMPOSITION_{{SECTION}}_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_COMPOSITION_{{SECTION}}_INCLUDED
#if {{SECTION}} == 0
{{INPUT}}.coastalAlpha = {{COASTAL_ALPHA}};
        {{INPUT}}.coastalAlphaWeight = {{COASTAL_ALPHA_WEIGHT}};
#elif {{SECTION}} == 1
        // Boundary color is diffuse material albedo. Apply it before
        // reflection/specular composition so those terms retain one energy owner.
        waterColor = max(waterColor + appearanceBoundaryColor * waterDiffuseLighting, vec3(0.0));
#elif {{SECTION}} == 2
        // Scene Color already contains scene lighting and shadowing. Only
        // Water-owned tint and boundaries receive Water diffuse lighting above.
        // Fresnel still preserves one transmission/reflection energy split.
        waterColor *= 1.0 - effectiveFresnel;
#elif {{SECTION}} == 3
        float alpha = waterSurfaceResolveAlphaV2(
          material_Alpha,
          clarity,
          opticalDepth,
          effectiveFresnel,
          foamTint,
          material_OpticsCalibrationMode,
          {{COASTAL_ALPHA}},
          {{COASTAL_ALPHA_WEIGHT}}
        );
#else
        if (material_CompositionMode > 0.5) {
          shaderCompositedColor = mix(centeredOpaqueColor, waterColor, surfaceAlpha);
        }
#endif
#endif
