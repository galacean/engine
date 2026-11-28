#ifndef TERRAIN_PROJECT_GROUND_WIND_FIELD_INCLUDED
#define TERRAIN_PROJECT_GROUND_WIND_FIELD_INCLUDED

vec2 terrainProjectGroundWindCoordinates(vec2 worldXZ) {
  vec2 direction = scene_GroundWindMotion.xy;
  vec2 perpendicular = vec2(-direction.y, direction.x);
  return vec2(dot(worldXZ, perpendicular), dot(worldXZ, direction));
}

vec2 terrainProjectGroundWindBroadUv(vec2 worldXZ) {
  vec2 coordinates = terrainProjectGroundWindCoordinates(worldXZ);
  float advectionAlongWind = dot(scene_GroundWindAdvection.xy, scene_GroundWindMotion.xy);
  vec2 tiling = vec2(0.35, 1.0) / max(scene_GroundWindWave.y, 0.001);
  return (coordinates + vec2(0.0, advectionAlongWind)) * tiling;
}

vec2 terrainProjectGroundWindDetailUv(vec2 worldXZ) {
  vec2 coordinates = terrainProjectGroundWindCoordinates(worldXZ);
  float advectionAlongWind = dot(scene_GroundWindAdvection.xy, scene_GroundWindMotion.xy);
  vec2 tiling = vec2(0.35, 1.0) / max(scene_GroundWindWave.y, 0.001);
  return (
    coordinates + vec2(0.0, advectionAlongWind * scene_GroundWindShape.y)
  ) * tiling * 10.0;
}

float terrainProjectGroundWindAngle(float broadNoise, float detailNoise) {
  return scene_GroundWindWave.w -
    max(scene_GroundWindWave.x, 0.0) * broadNoise +
    max(scene_GroundWindWave.z, 0.0) * detailNoise;
}

float terrainProjectGroundWindNormalized(float angle) {
  float minimumAngle = scene_GroundWindWave.w - max(scene_GroundWindWave.x, 0.0);
  float angleRange = max(scene_GroundWindWave.x + scene_GroundWindWave.z, 0.001);
  return clamp((angle - minimumAngle) / angleRange, 0.0, 1.0);
}

float terrainProjectGroundWindAngleFromNormalized(float normalizedField) {
  float minimumAngle = scene_GroundWindWave.w - max(scene_GroundWindWave.x, 0.0);
  float angleRange = max(scene_GroundWindWave.x + scene_GroundWindWave.z, 0.001);
  return minimumAngle + clamp(normalizedField, 0.0, 1.0) * angleRange;
}

float terrainProjectGroundWindBodyWeight(float rootWeight) {
  float weight = clamp(rootWeight, 0.0, 1.0);
  float rootAnchor = smoothstep(0.0, 0.18, weight);
  return rootAnchor * mix(0.62, 1.0, weight);
}

float terrainProjectGroundWindHeightResponse(float bendAngle, float maximumBendAngle) {
  float maximumHeightLoss = max(1.0 - cos(max(maximumBendAngle, 0.001)), 0.001);
  return clamp((1.0 - cos(abs(bendAngle))) / maximumHeightLoss, 0.0, 1.0);
}

float terrainProjectGroundWindAngleAt(vec2 worldXZ) {
  float broadNoise = texture2D(
    scene_WindSpectrumTexture,
    terrainProjectGroundWindBroadUv(worldXZ)
  ).r;
  float detailNoise = texture2D(
    scene_WindSpectrumTexture,
    terrainProjectGroundWindDetailUv(worldXZ)
  ).r;
  return terrainProjectGroundWindAngle(broadNoise, detailNoise);
}

vec3 terrainProjectGroundWindCarrierNormal(vec2 worldXZ, float centerAngle) {
  float sampleStep = max(scene_GroundWindWave.y / 32.0, 0.2);
  float heightScale = scene_GroundWindWave.y * 0.55;
  float slopeX = (
    terrainProjectGroundWindAngleAt(worldXZ + vec2(sampleStep, 0.0)) - centerAngle
  ) * heightScale / sampleStep;
  float slopeZ = (
    terrainProjectGroundWindAngleAt(worldXZ + vec2(0.0, sampleStep)) - centerAngle
  ) * heightScale / sampleStep;
  return normalize(vec3(-slopeX, 1.0, -slopeZ));
}

vec3 terrainProjectGroundWindDirectionalNormal(float angle) {
  float signedField = terrainProjectGroundWindNormalized(angle) * 2.0 - 1.0;
  float slope = signedField * max(scene_GroundWindWave.x + scene_GroundWindWave.z, 0.001);
  vec2 direction = scene_GroundWindMotion.xy;
  return normalize(vec3(-direction.x * slope, 1.0, -direction.y * slope));
}

vec3 terrainProjectGroundWindBandNormal(float broadBand, float detailBand) {
  vec2 direction = scene_GroundWindMotion.xy;
  vec2 perpendicular = vec2(-direction.y, direction.x);
  vec2 slope =
    direction * (-broadBand * max(scene_GroundWindWave.x, 0.0)) +
    perpendicular * (detailBand * max(scene_GroundWindWave.z, 0.0) * 2.0);
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}

#endif
