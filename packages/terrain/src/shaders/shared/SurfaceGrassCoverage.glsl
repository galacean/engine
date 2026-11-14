#ifndef TERRAIN_PROJECT_SURFACE_GRASS_COVERAGE_INCLUDED
#define TERRAIN_PROJECT_SURFACE_GRASS_COVERAGE_INCLUDED

#ifdef RENDERER_SURFACE_GRASS_COVERAGE
  #include "shared/GrassColorField.glsl"

  float material_SurfaceGrassTopSlope;
  float material_SurfaceGrassTopSoftness;
  float material_SurfaceGrassIrregularity;

  struct TerrainProjectSurfaceGrassCoverage {
    float coverage;
    vec3 nearAlbedo;
    vec3 farAlbedo;
    float vistaWeight;
  };

  TerrainProjectSurfaceGrassCoverage terrainProjectEvaluateSurfaceGrassCoverage(
    vec3 positionWS,
    vec3 normalWS
  ) {
    TerrainProjectSurfaceGrassCoverage result;
    result.coverage = 0.0;
    result.nearAlbedo = vec3(0.0);
    result.farAlbedo = vec3(0.0);
    result.vistaWeight = 0.0;
    float minimumSlope = clamp(material_SurfaceGrassTopSlope, -1.0, 0.95);
    if (normalWS.y < minimumSlope) return result;

    result.vistaWeight = grassColorFieldVistaBlendWeight(positionWS);
    float nearField;
    float farField;
    if (result.vistaWeight <= 0.001) {
      nearField = sampleGrassColorField(positionWS.xz);
      farField = nearField;
    } else if (result.vistaWeight >= 0.999) {
      farField = sampleGrassVistaColorField(positionWS.xz);
      nearField = farField;
    } else {
      nearField = sampleGrassColorField(positionWS.xz);
      farField = sampleGrassVistaColorField(positionWS.xz);
    }
    float field = mix(nearField, farField, result.vistaWeight);
    float irregularity = clamp(material_SurfaceGrassIrregularity, 0.0, 0.75);
    // Breakup may retreat into the top, but never lowers the artist-authored slope boundary.
    float transitionOffset = abs(field - 0.5) * irregularity * 0.35;
    float topSoftness = max(material_SurfaceGrassTopSoftness, 0.005);
    float coverageStart = min(minimumSlope + transitionOffset, 0.995);
    result.coverage = smoothstep(
      coverageStart,
      min(coverageStart + topSoftness, 1.0),
      normalWS.y
    );
    result.nearAlbedo = grassColorFromField(nearField);
    result.farAlbedo = grassColorFromField(farField);
    return result;
  }

#endif

#endif
