#ifndef WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_{{INCLUDE_NAMESPACE}}_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = {{COASTAL_ALPHA_INITIAL}};
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;
{{BOUNDARY_EFFECTS}}
#if {{EMIT_ROUGHNESS}}
        float {{ROUGHNESS_RESULT}} = clamp(
          {{BASE_ROUGHNESS}} + appearanceBoundaryRoughness,
          0.045,
          1.0
        );
#endif
#endif
