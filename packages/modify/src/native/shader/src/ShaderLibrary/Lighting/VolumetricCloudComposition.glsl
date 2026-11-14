#ifndef VOLUMETRIC_CLOUD_COMPOSITION_INCLUDED
#define VOLUMETRIC_CLOUD_COMPOSITION_INCLUDED

const float VOLUMETRIC_CLOUD_COMPOSITION_EPSILON = 0.0001;
const float VOLUMETRIC_CLOUD_COMPOSITION_FOUR_PI = 12.5663706144;

mediump sampler2D material_VolumetricCloudHistory;
mediump sampler2D material_VolumetricCloudHistoryMetadata;
vec3 material_VolumetricCloudDisplayMotion;
vec4 material_VolumetricCloudHistoryTexelSize;
vec3 material_VolumetricCloudSunDirection;
vec3 material_VolumetricCloudLight;
vec3 material_VolumetricCloudZenith;
vec3 material_VolumetricCloudHorizon;
float material_VolumetricCloudCacheReady;
float material_VolumetricCloudCacheCompression;
float material_VolumetricCloudPlanetRadius;
float material_VolumetricCloudObserverAltitude;
float material_VolumetricCloudBaseAltitude;
float material_VolumetricCloudThickness;
float material_VolumetricCloudPhaseForwardAnisotropy;
float material_VolumetricCloudPhaseBackwardAnisotropy;
float material_VolumetricCloudPhaseBlend;
float material_VolumetricCloudCachePhaseIsotropyBlend;
float material_VolumetricCloudCacheAmbientWeight;
float material_VolumetricCloudCacheExposureScale;
float material_VolumetricCloudCacheExposureMinimum;
float material_VolumetricCloudCacheExposureMaximum;
float material_VolumetricCloudCacheEncodingGamma;

float volumetricCloudHenyeyGreenstein(float cosine, float anisotropy) {
  float anisotropySquared = anisotropy * anisotropy;
  return (1.0 - anisotropySquared) /
    (
      VOLUMETRIC_CLOUD_COMPOSITION_FOUR_PI *
      pow(
        max(
          1.0 + anisotropySquared - 2.0 * anisotropy * cosine,
          VOLUMETRIC_CLOUD_COMPOSITION_EPSILON
        ),
        1.5
      )
    );
}

float volumetricCloudCachePhase(vec3 ray) {
  vec3 sunDirection = normalize(material_VolumetricCloudSunDirection);
  float cosine = dot(ray, sunDirection);
  float phase = mix(
    volumetricCloudHenyeyGreenstein(cosine, material_VolumetricCloudPhaseForwardAnisotropy),
    volumetricCloudHenyeyGreenstein(cosine, material_VolumetricCloudPhaseBackwardAnisotropy),
    material_VolumetricCloudPhaseBlend
  );
  float isotropicPhase = 1.0 / VOLUMETRIC_CLOUD_COMPOSITION_FOUR_PI;
  return mix(phase / isotropicPhase, 1.0, material_VolumetricCloudCachePhaseIsotropyBlend);
}

float volumetricCloudCachePreExposure() {
  float direct = max(
    material_VolumetricCloudLight.r,
    max(material_VolumetricCloudLight.g, material_VolumetricCloudLight.b)
  );
  vec3 ambientColor = max(material_VolumetricCloudZenith, material_VolumetricCloudHorizon);
  float ambient = max(ambientColor.r, max(ambientColor.g, ambientColor.b));
  return clamp(
    (direct + ambient * material_VolumetricCloudCacheAmbientWeight) *
      material_VolumetricCloudCacheExposureScale,
    material_VolumetricCloudCacheExposureMinimum,
    material_VolumetricCloudCacheExposureMaximum
  );
}

vec3 decodeVolumetricCloudRadiance(vec3 encodedRadiance, vec3 ray) {
  if (material_VolumetricCloudCacheCompression < 0.5) return max(encodedRadiance, vec3(0.0));
  return
    pow(max(encodedRadiance, vec3(0.0)), vec3(material_VolumetricCloudCacheEncodingGamma)) *
    volumetricCloudCachePhase(ray) *
    volumetricCloudCachePreExposure();
}

vec2 encodeVolumetricCloudHemiOctahedron(vec3 direction) {
  vec3 ray = normalize(direction);
  vec2 diamond =
    ray.xz /
    max(abs(ray.x) + max(ray.y, 0.0) + abs(ray.z), VOLUMETRIC_CLOUD_COMPOSITION_EPSILON);
  vec2 square = vec2(diamond.x + diamond.y, diamond.x - diamond.y);
  return square * 0.5 + 0.5;
}

vec2 getVolumetricCloudLayerSegment(vec3 ray) {
  vec3 center = vec3(
    0.0,
    -(material_VolumetricCloudPlanetRadius + material_VolumetricCloudObserverAltitude),
    0.0
  );
  vec3 offset = -center;
  float projection = dot(offset, ray);
  float innerRadius = material_VolumetricCloudPlanetRadius + material_VolumetricCloudBaseAltitude;
  float outerRadius = innerRadius + material_VolumetricCloudThickness;
  float observerRadius = length(offset);
  float innerRoot = sqrt(
    max(projection * projection + (innerRadius - observerRadius) * (innerRadius + observerRadius), 0.0)
  );
  float outerRoot = sqrt(
    max(projection * projection + (outerRadius - observerRadius) * (outerRadius + observerRadius), 0.0)
  );
  return vec2(max(0.0, -projection + innerRoot), -projection + outerRoot);
}

vec3 reprojectVolumetricCloudRay(vec3 currentRay, float normalizedDistance) {
  vec2 segment = getVolumetricCloudLayerSegment(currentRay);
  if (segment.y <= segment.x + 0.001) return currentRay;
  float representativeDistance = mix(segment.x, segment.y, clamp(normalizedDistance, 0.0, 1.0));
  return normalize(currentRay * representativeDistance + material_VolumetricCloudDisplayMotion);
}

vec4 sampleVolumetricCloudComposition(vec3 direction) {
  vec3 ray = normalize(direction);
  if (ray.y <= 0.0 || material_VolumetricCloudCacheReady < 0.5) return vec4(0.0);

  vec2 currentUV = encodeVolumetricCloudHemiOctahedron(ray);
  float weightedCenter = texture2D(material_VolumetricCloudHistoryMetadata, currentUV).r;
  vec3 historyRay = reprojectVolumetricCloudRay(ray, weightedCenter);
  vec2 cacheUV = encodeVolumetricCloudHemiOctahedron(historyRay);
  vec2 halfTexel = material_VolumetricCloudHistoryTexelSize.xy * 0.5;
  vec4 encodedCloud = texture2D(
    material_VolumetricCloudHistory,
    clamp(cacheUV, halfTexel, vec2(1.0) - halfTexel)
  );
  return vec4(decodeVolumetricCloudRadiance(encodedCloud.rgb, historyRay), encodedCloud.a);
}

#endif
