#ifndef TERRAIN_PROJECT_TERRAIN_EXTENSION_DEBUG_INCLUDED
#define TERRAIN_PROJECT_TERRAIN_EXTENSION_DEBUG_INCLUDED

struct TerrainExtensionDebugVaryings {
  vec3 positionWS;
  vec4 positionCS;
  float terrainValid;
};

TerrainExtensionDebugVaryings TerrainExtensionDebugVertex(Attributes attributes) {
  TerrainExtensionDebugVaryings varyings;
  vec4 homogeneousPositionWS = renderer_ModelMat * vec4(attributes.POSITION, 1.0);
  varyings.positionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
  varyings.positionWS.y = terrainProjectHeightAt(varyings.positionWS.xz, varyings.terrainValid);
  varyings.positionCS = camera_VPMat * vec4(varyings.positionWS, 1.0);
  gl_Position = varyings.positionCS;
  return varyings;
}

bool terrainProjectExtensionDebugDiscard(TerrainExtensionDebugVaryings varyings) {
  return varyings.terrainValid < 0.999 || terrainProjectSolidAt(varyings.positionWS.xz) < 0.5;
}

#endif
