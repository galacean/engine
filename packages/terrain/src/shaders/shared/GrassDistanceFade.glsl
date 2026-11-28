#ifndef TERRAIN_PROJECT_GRASS_DISTANCE_FADE_INCLUDED
#define TERRAIN_PROJECT_GRASS_DISTANCE_FADE_INCLUDED

float material_GrassDistanceFadeEnable;
float material_GrassFadeDistance;
float material_GrassFalloff;

#ifdef RENDERER_GRASS_DENSITY_LOD
vec4 renderer_GrassDensityLod;
float terrainProjectGrassDensityVisibility(vec3 rootPositionWS) {
  if (renderer_GrassDensityLod.y < 0.5) return 1.0;
  float t = clamp(distance(camera_Position, rootPositionWS) / max(renderer_GrassDensityLod.z, 0.001), 0.0, 1.0);
  float density = 1.0 - 0.8 * t * t * (3.0 - 2.0 * t);
  float rank = (float(gl_InstanceID) + 0.5) / max(renderer_GrassDensityLod.x, 1.0);
  return smoothstep(0.0, min(renderer_GrassDensityLod.w, 1.0 - rank), density - rank);
}
#endif

float terrainProjectGrassDistanceVisibility(vec3 rootPositionWS) {
  float distanceVisibility;
  #if defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) || defined(MATERIAL_GRASS_RADIAL_DISTANCE_FADE)
    vec3 cameraOffsetFromRoot = camera_Position - rootPositionWS;
    float cameraDistanceSquared = dot(cameraOffsetFromRoot, cameraOffsetFromRoot);
    float maximumDistanceSquared = max(
      material_GrassFadeDistance * material_GrassFadeDistance,
      0.0001
    );
    distanceVisibility = clamp(
      2.0 * (maximumDistanceSquared - cameraDistanceSquared) / maximumDistanceSquared,
      0.0,
      1.0
    );
  #else
    float eyeDepth = -(camera_ViewMat * vec4(rootPositionWS, 1.0)).z;
    float cameraDepthFade = (
      eyeDepth - camera_ProjectionParams.y - material_GrassFadeDistance
    ) / 5.0;
    distanceVisibility = clamp(
      mix(1.0 - cameraDepthFade, cameraDepthFade, material_GrassFalloff * 0.5),
      0.0,
      1.0
    );
  #endif
  return mix(1.0, distanceVisibility, material_GrassDistanceFadeEnable);
}

#endif
