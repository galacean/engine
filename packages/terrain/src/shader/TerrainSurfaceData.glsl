#ifndef TERRAIN_PROJECT_SURFACE_DATA_INCLUDED
#define TERRAIN_PROJECT_SURFACE_DATA_INCLUDED

SurfaceData terrainProjectBuildSurfaceData(
  Varyings varyings,
  vec3 albedo,
  vec3 surfaceNormal,
  float metallic,
  float smoothness,
  float ambientOcclusion
) {
  SurfaceData surfaceData;
  surfaceData.albedoColor = albedo;
  surfaceData.emissiveColor = vec3(0.0);
  surfaceData.metallic = clamp(metallic, 0.0, 1.0);
  surfaceData.roughness = 1.0 - clamp(smoothness, 0.0, 1.0);
  surfaceData.ambientOcclusion = clamp(ambientOcclusion, 0.0, 1.0);
  surfaceData.opacity = 1.0;
  surfaceData.IOR = 1.5;
  surfaceData.position = varyings.positionWS;
  surfaceData.positionCS = varyings.positionCS;
  surfaceData.normal = surfaceNormal;
  #ifdef CAMERA_ORTHOGRAPHIC
    surfaceData.viewDir = -camera_Forward;
  #else
    surfaceData.viewDir = normalize(camera_Position - varyings.positionWS);
  #endif
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
  surfaceData.specularIntensity = 1.0;
  surfaceData.specularColor = vec3(1.0);
  return surfaceData;
}

#endif
