#ifndef VOLUMETRIC_CLOUD_SHADOW_INCLUDED
#define VOLUMETRIC_CLOUD_SHADOW_INCLUDED

#ifdef SCENE_VOLUMETRIC_CLOUD_SHADOW
  mediump sampler2D scene_VolumetricCloudShadowTexture;
  mediump sampler2D scene_VolumetricCloudShadowMetadata;
  vec3 scene_VolumetricCloudShadowOrigin;
  vec3 scene_VolumetricCloudShadowSunDirection;
  vec3 scene_VolumetricCloudShadowMotion;
  vec4 scene_VolumetricCloudShadowLayer;
  vec4 scene_VolumetricCloudShadowTexelSize;
  float scene_VolumetricCloudShadowReady;

  const float VOLUMETRIC_CLOUD_SHADOW_EPSILON = 0.00001;

  vec2 encodeVolumetricCloudShadowDirection(vec3 direction) {
    vec3 ray = normalize(direction);
    vec2 diamond = ray.xz / max(
      abs(ray.x) + max(ray.y, 0.0) + abs(ray.z),
      VOLUMETRIC_CLOUD_SHADOW_EPSILON
    );
    vec2 square = vec2(diamond.x + diamond.y, diamond.x - diamond.y);
    return square * 0.5 + 0.5;
  }

  vec2 volumetricCloudShadowLayerSegment(vec3 ray) {
    float planetRadius = scene_VolumetricCloudShadowLayer.x;
    float cloudBaseAltitude = scene_VolumetricCloudShadowLayer.y;
    float cloudThickness = scene_VolumetricCloudShadowLayer.z;
    float inversePlanetRadius = 1.0 / max(planetRadius, VOLUMETRIC_CLOUD_SHADOW_EPSILON);
    vec3 offset = vec3(
      0.0,
      1.0 + scene_VolumetricCloudShadowOrigin.y * inversePlanetRadius,
      0.0
    );
    float projection = dot(offset, ray);
    float innerRadius = 1.0 + cloudBaseAltitude * inversePlanetRadius;
    float outerRadius = innerRadius + cloudThickness * inversePlanetRadius;
    float observerRadius = length(offset);
    float innerRoot = sqrt(max(
      projection * projection + (innerRadius - observerRadius) * (innerRadius + observerRadius),
      0.0
    ));
    float outerRoot = sqrt(max(
      projection * projection + (outerRadius - observerRadius) * (outerRadius + observerRadius),
      0.0
    ));
    return vec2(max(0.0, -projection + innerRoot), -projection + outerRoot) * planetRadius;
  }

  vec3 reprojectVolumetricCloudShadowDirection(
    vec3 currentRay,
    float normalizedDistance
  ) {
    vec2 segment = volumetricCloudShadowLayerSegment(currentRay);
    if (segment.y <= segment.x + VOLUMETRIC_CLOUD_SHADOW_EPSILON) return currentRay;
    float representativeDistance = mix(
      segment.x,
      segment.y,
      clamp(normalizedDistance, 0.0, 1.0)
    );
    return normalize(
      currentRay * representativeDistance + scene_VolumetricCloudShadowMotion
    );
  }

  float sampleVolumetricCloudShadow(vec3 positionWS) {
    if (scene_VolumetricCloudShadowReady < 0.5) return 1.0;

    vec3 sunDirection = normalize(scene_VolumetricCloudShadowSunDirection);
    float planetRadius = scene_VolumetricCloudShadowLayer.x;
    float inversePlanetRadius = 1.0 / max(planetRadius, VOLUMETRIC_CLOUD_SHADOW_EPSILON);
    float innerRadius = 1.0 + scene_VolumetricCloudShadowLayer.y * inversePlanetRadius;
    vec3 planetCenter = vec3(
      scene_VolumetricCloudShadowOrigin.x,
      -planetRadius,
      scene_VolumetricCloudShadowOrigin.z
    );
    vec3 surfaceOffset = positionWS - planetCenter;
    if (dot(surfaceOffset, sunDirection) <= 0.0) return 1.0;

    vec3 normalizedSurfaceOffset = surfaceOffset * inversePlanetRadius;
    float projected = dot(normalizedSurfaceOffset, sunDirection);
    float discriminant =
      projected * projected - dot(normalizedSurfaceOffset, normalizedSurfaceOffset) + innerRadius * innerRadius;
    if (discriminant <= 0.0) return 1.0;
    float distanceToCloudBase = (-projected + sqrt(discriminant)) * planetRadius;
    if (distanceToCloudBase <= 0.0) return 1.0;

    vec3 cloudBasePoint = positionWS + sunDirection * distanceToCloudBase;
    vec3 currentRay = normalize(cloudBasePoint - scene_VolumetricCloudShadowOrigin);
    if (currentRay.y <= 0.0) return 1.0;

    vec2 halfTexel = scene_VolumetricCloudShadowTexelSize.xy * 0.5;
    vec2 currentUv = clamp(
      encodeVolumetricCloudShadowDirection(currentRay),
      halfTexel,
      vec2(1.0) - halfTexel
    );
    float weightedCenter = texture2D(
      scene_VolumetricCloudShadowMetadata,
      currentUv
    ).r;
    vec3 historyRay = reprojectVolumetricCloudShadowDirection(currentRay, weightedCenter);
    if (historyRay.y <= 0.0) return 1.0;
    vec2 historyUv = clamp(
      encodeVolumetricCloudShadowDirection(historyRay),
      halfTexel,
      vec2(1.0) - halfTexel
    );
    float cloudOpacity = texture2D(scene_VolumetricCloudShadowTexture, historyUv).a;
    return clamp(1.0 - cloudOpacity, 0.0, 1.0);
  }
#else
  float sampleVolumetricCloudShadow(vec3 positionWS) {
    return 1.0;
  }
#endif

#endif
