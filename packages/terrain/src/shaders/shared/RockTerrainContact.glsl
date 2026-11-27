#ifndef TERRAIN_PROJECT_ROCK_TERRAIN_CONTACT_INCLUDED
#define TERRAIN_PROJECT_ROCK_TERRAIN_CONTACT_INCLUDED

#if defined(MATERIAL_TERRAIN_HEIGHT_FIELD) && defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP)
#include "shared/TerrainHeightField.glsl"
#include "shared/TerrainLayerEvaluation.glsl"
#include "shared/SurfaceRelief.glsl"
#endif

// Sample at mesh vertices / blade roots, never once per rock fragment.
float terrainProjectRockGroundClearance(vec3 positionWS) {
  #if defined(MATERIAL_TERRAIN_HEIGHT_FIELD) && defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP)
    float valid;
    float height = terrainProjectHeightAt(positionWS.xz, valid);
    if (valid > 0.5) return positionWS.y - height;
  #endif
  return 10000.0;
}

// One terrain-clearance transition for the wall and rock-attached roots.
float terrainProjectRockContactWeight(float clearance) {
  return 1.0 - smoothstep(0.0, 0.85, max(clearance, 0.0));
}

// Shared by the rock substrate and attached roots. Contact is independent of
// the rock's meadow mask: steep walls can meet soil without growing blades.
float terrainProjectBlendRockContact(vec3 positionWS, float clearance,
    inout vec4 ground, inout vec3 normal, inout float snowResponse) {
  #if defined(MATERIAL_TERRAIN_HEIGHT_FIELD) && defined(MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP)
    float weight = terrainProjectRockContactWeight(clearance);
    if (weight > 0.0) {
      TerrainProjectLayerBlend terrain = terrainProjectSimpleGroundSurface(positionWS, vec2(0.0), vec2(0.0));
      weight *= terrain.weight;
      float valid;
      vec3 terrainNormal = terrainProjectGeometryNormalAt(positionWS.xz, valid);
      float relief = terrainProjectSurfaceReliefWeight(positionWS);
      if (relief > 0.0) terrainNormal = normalize(mix(terrainNormal,
        terrainProjectSurfaceReliefNormal(positionWS, terrainNormal, terrain.grassWeight * terrain.weight), relief));
      ground = mix(ground, vec4(terrainProjectGroundColor(terrain, positionWS), 1.0 - terrain.smoothness), weight);
      normal = normalize(mix(normal, terrainNormal, weight));
      snowResponse = mix(snowResponse, terrain.snowResponse, weight);
    }
    return weight;
  #else
    return 0.0;
  #endif
}
#endif
