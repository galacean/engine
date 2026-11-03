// Both geometry modes share world-space texture projection and color settings.
#include "shared/RockSurfaceColor.glsl"
#ifdef SEED_ROCK_ORIGINAL_SURFACE
#include "SeedWorld/RockSurface/CellularLighting.glsl"
#endif

void originalRockSurface(inout SurfaceData surface, Varyings v) {
  vec3 projectionNormal = surface.normal;
  float cellOffset = 0.0;
  #ifdef SEED_ROCK_ORIGINAL_SURFACE
  float rockMask = clamp(v.uv.x, 0.0, 1.0);
  float cavity = clamp(v.uv.y, 0.0, 1.0);
  vec3 sharedNormal = v.rockSmoothNormal / max(length(v.rockSmoothNormal), 0.000001);
  projectionNormal = mix(sharedNormal, cellularLightingNormal(v, surface.normal), rockMask);
  surface.normal = normalize(projectionNormal);
  surface.dotNV = saturate(dot(surface.normal, surface.viewDir));
  cellOffset = v.rockBarycentrics.w;
  surface.ambientOcclusion *= mix(1.0, 1.0 - cavity * 0.94, 0.7 * rockMask);
  #endif
  surface.albedoColor = originalRockColor(v.positionWS, projectionNormal, cellOffset);
}
