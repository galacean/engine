#ifndef WATER_SURFACE_DEPTH_RESPONSE_INCLUDED
#define WATER_SURFACE_DEPTH_RESPONSE_INCLUDED

float waterSurfaceDepthSampleValidity(float rawDepth, float sceneEyeDepth, float surfaceEyeDepth) {
  return step(0.0, sceneEyeDepth)
    * step(sceneEyeDepth, 1000000.0)
    * step(surfaceEyeDepth + 0.000001, sceneEyeDepth)
    * (1.0 - step(0.999999, rawDepth));
}

vec3 waterSurfaceReconstructOpaquePositionWS(
  vec3 surfacePositionWS,
  vec3 cameraPositionWS,
  mat4 cameraViewInverse,
  float surfaceEyeDepth,
  float sceneEyeDepth,
  float orthographicProjection
) {
  float safeSurfaceEyeDepth = max(surfaceEyeDepth, 0.000001);
  vec3 perspectivePosition = cameraPositionWS
    + (surfacePositionWS - cameraPositionWS) * (sceneEyeDepth / safeSurfaceEyeDepth);
  vec3 cameraForwardWS = normalize((cameraViewInverse * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 orthographicPosition = surfacePositionWS
    + cameraForwardWS * max(sceneEyeDepth - surfaceEyeDepth, 0.0);
  return mix(perspectivePosition, orthographicPosition, clamp(orthographicProjection, 0.0, 1.0));
}

// Surface-normal depth uses the normalized physical macro normal; scrolling
// detail normals never affect the appearance depth field.
float waterSurfaceNormalDepth(
  vec3 surfacePositionWS,
  vec3 opaquePositionWS,
  vec3 macroNormalWS
) {
  return abs(dot(surfacePositionWS - opaquePositionWS, normalize(macroNormalWS)));
}

float waterSurfaceDerivedSceneRayDepth(
  float verticalDepth,
  vec3 macroNormalWS,
  vec3 viewDirectionWS
) {
  float projectionDenominator = abs(dot(normalize(viewDirectionWS), normalize(macroNormalWS)));
  return min(
    max(verticalDepth, 0.0) / max(projectionDenominator, 0.001),
    1000000.0
  );
}

// max(1-exp(-a), 1-exp(-b)) == 1-exp(-max(a,b)); one exp for one or two terms.
float waterSurfaceCompositeExponentialDensity(float firstScaledDepth, float secondScaledDepth) {
  return clamp(1.0 - exp(-max(max(firstScaledDepth, 0.0), max(secondScaledDepth, 0.0))), 0.0, 1.0);
}

#endif
