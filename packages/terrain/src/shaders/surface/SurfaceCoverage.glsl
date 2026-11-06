#ifndef TERRAIN_PROJECT_SURFACE_COVERAGE_INCLUDED
#define TERRAIN_PROJECT_SURFACE_COVERAGE_INCLUDED

#ifdef MATERIAL_ENABLE_COVERAGE

sampler2D material_CoverageBaseTexture;
sampler2D material_CoverageNormalTexture;
sampler2D material_CoverageMetallicSmoothnessTexture;
sampler2D material_CoverageMaskTexture;
vec4 material_CoverageColor;
float material_CoverageTiling;
float material_CoverageNormalScale;
float material_CoverageMetallic;
float material_CoverageSmoothness;
float material_CoverageSmoothnessSource;
float material_CoverageOverlayMethod;
float material_CoverageOffset;
float material_CoverageBalance;
float material_CoverageMaskContrast;
float material_CoverageNormalBlending;
vec2 material_CoverageMaskTiling;

struct TerrainProjectSurfaceCoverageResult {
  vec3 albedoColor;
  float metallic;
  float smoothness;
  vec3 normalWS;
};

vec3 terrainProjectCoverageWeights(vec3 normalWS) {
  vec3 weights = pow(abs(normalWS), vec3(10.0));
  return weights / (weights.x + weights.y + weights.z + 0.00001);
}

vec2 terrainProjectRotateCoverageUv(vec2 value, vec2 cosineSine) {
  return vec2(
    cosineSine.x * value.x + cosineSine.y * value.y,
    cosineSine.x * value.y - cosineSine.y * value.x
  );
}

float terrainProjectCoverageRandomCell(vec2 cell) {
  vec3 value = fract(vec3(cell.xyx) * 0.1031);
  value += dot(value, value.yzx + 33.33);
  return fract((value.x + value.y) * value.z);
}

void terrainProjectPrepareCoverageUv(
  vec2 baseUv,
  vec2 cellOffset,
  out vec2 sampleUv,
  out vec2 sampleDdx,
  out vec2 sampleDdy,
  out vec2 tangentCosineSine
) {
  sampleUv = baseUv;
  sampleDdx = dFdx(baseUv);
  sampleDdy = dFdy(baseUv);
  tangentCosineSine = vec2(1.0, 0.0);
#ifdef MATERIAL_ENABLE_COVERAGE_DETILING
  vec2 cell = floor(baseUv + vec2(0.5));
  float angle = (terrainProjectCoverageRandomCell(cell + cellOffset) * 2.0 - 1.0) * PI;
  vec2 cosineSine = vec2(cos(angle), sin(angle));
  sampleUv = terrainProjectRotateCoverageUv(baseUv - cell, cosineSine) + cell;
  sampleDdx = terrainProjectRotateCoverageUv(sampleDdx, cosineSine);
  sampleDdy = terrainProjectRotateCoverageUv(sampleDdy, cosineSine);
  tangentCosineSine = vec2(cosineSine.x, -cosineSine.y);
#endif
}

vec4 terrainProjectSampleCoverageColorProjection(vec2 baseUv, vec2 cellOffset) {
  vec2 sampleUv;
  vec2 sampleDdx;
  vec2 sampleDdy;
  vec2 tangentCosineSine;
  terrainProjectPrepareCoverageUv(baseUv, cellOffset, sampleUv, sampleDdx, sampleDdy, tangentCosineSine);
#ifdef MATERIAL_ENABLE_COVERAGE_DETILING
  vec4 color = textureGrad(material_CoverageBaseTexture, sampleUv, sampleDdx, sampleDdy);
  #ifdef ENGINE_NO_SRGB
    color = sRGBToLinear(color);
  #endif
  return color;
#else
  return texture2DSRGB(material_CoverageBaseTexture, sampleUv);
#endif
}

vec4 terrainProjectSampleCoverageLinearProjection(
  sampler2D source,
  vec2 baseUv,
  vec2 cellOffset,
  out vec2 tangentCosineSine
) {
  vec2 sampleUv;
  vec2 sampleDdx;
  vec2 sampleDdy;
  terrainProjectPrepareCoverageUv(baseUv, cellOffset, sampleUv, sampleDdx, sampleDdy, tangentCosineSine);
#ifdef MATERIAL_ENABLE_COVERAGE_DETILING
  return textureGrad(source, sampleUv, sampleDdx, sampleDdy);
#else
  return texture2D(source, sampleUv);
#endif
}

vec4 terrainProjectSampleCoverageColor(vec3 positionWS, vec3 normalWS) {
  vec3 weights = terrainProjectCoverageWeights(normalWS);
  vec3 normalSign = sign(normalWS);
  vec4 xProjection = terrainProjectSampleCoverageColorProjection(
    material_CoverageTiling * positionWS.zy * vec2(normalSign.x, 1.0),
    vec2(17.0, 3.0)
  );
  vec4 yProjection = terrainProjectSampleCoverageColorProjection(
    material_CoverageTiling * positionWS.xz * vec2(normalSign.y, 1.0),
    vec2(31.0, 11.0)
  );
  vec4 zProjection = terrainProjectSampleCoverageColorProjection(
    material_CoverageTiling * positionWS.xy * vec2(-normalSign.z, 1.0),
    vec2(47.0, 19.0)
  );
  return xProjection * weights.x + yProjection * weights.y + zProjection * weights.z;
}

vec4 terrainProjectSampleCoverageMetallicSmoothness(vec3 positionWS, vec3 normalWS) {
  vec3 weights = terrainProjectCoverageWeights(normalWS);
  vec3 normalSign = sign(normalWS);
  vec2 xRotation;
  vec2 yRotation;
  vec2 zRotation;
  vec4 xProjection = terrainProjectSampleCoverageLinearProjection(
    material_CoverageMetallicSmoothnessTexture,
    material_CoverageTiling * positionWS.zy * vec2(normalSign.x, 1.0),
    vec2(17.0, 3.0),
    xRotation
  );
  vec4 yProjection = terrainProjectSampleCoverageLinearProjection(
    material_CoverageMetallicSmoothnessTexture,
    material_CoverageTiling * positionWS.xz * vec2(normalSign.y, 1.0),
    vec2(31.0, 11.0),
    yRotation
  );
  vec4 zProjection = terrainProjectSampleCoverageLinearProjection(
    material_CoverageMetallicSmoothnessTexture,
    material_CoverageTiling * positionWS.xy * vec2(-normalSign.z, 1.0),
    vec2(47.0, 19.0),
    zRotation
  );
  return xProjection * weights.x + yProjection * weights.y + zProjection * weights.z;
}

vec3 terrainProjectUnpackCoverageNormal(vec4 packedNormal) {
  vec3 normal = packedNormal.xyz * 2.0 - 1.0;
  normal.xy *= material_CoverageNormalScale;
  normal.z = mix(1.0, normal.z, clamp(material_CoverageNormalScale, 0.0, 1.0));
  return normal;
}

vec3 terrainProjectSampleCoverageNormal(vec3 positionWS, vec3 normalWS) {
  vec3 weights = terrainProjectCoverageWeights(normalWS);
  vec3 normalSign = sign(normalWS);
  vec2 xRotation;
  vec2 yRotation;
  vec2 zRotation;
  vec3 xSample = terrainProjectUnpackCoverageNormal(terrainProjectSampleCoverageLinearProjection(
    material_CoverageNormalTexture,
    material_CoverageTiling * positionWS.zy * vec2(normalSign.x, 1.0),
    vec2(17.0, 3.0),
    xRotation
  ));
  vec3 ySample = terrainProjectUnpackCoverageNormal(terrainProjectSampleCoverageLinearProjection(
    material_CoverageNormalTexture,
    material_CoverageTiling * positionWS.xz * vec2(normalSign.y, 1.0),
    vec2(31.0, 11.0),
    yRotation
  ));
  vec3 zSample = terrainProjectUnpackCoverageNormal(terrainProjectSampleCoverageLinearProjection(
    material_CoverageNormalTexture,
    material_CoverageTiling * positionWS.xy * vec2(-normalSign.z, 1.0),
    vec2(47.0, 19.0),
    zRotation
  ));
#ifdef MATERIAL_ENABLE_COVERAGE_DETILING
  xSample.xy = terrainProjectRotateCoverageUv(xSample.xy, xRotation);
  ySample.xy = terrainProjectRotateCoverageUv(ySample.xy, yRotation);
  zSample.xy = terrainProjectRotateCoverageUv(zSample.xy, zRotation);
#endif
  vec3 xProjection = vec3(xSample.xy * vec2(normalSign.x, 1.0) + normalWS.zy, normalWS.x).zyx;
  vec3 yProjection = vec3(ySample.xy * vec2(normalSign.y, 1.0) + normalWS.xz, normalWS.y).xzy;
  vec3 zProjection = vec3(zSample.xy * vec2(-normalSign.z, 1.0) + normalWS.xy, normalWS.z);
  return normalize(xProjection * weights.x + yProjection * weights.y + zProjection * weights.z);
}

vec3 terrainProjectBlendCoverageNormals(vec3 baseNormal, vec3 coverageNormal) {
  return normalize(vec3(baseNormal.xy + coverageNormal.xy, baseNormal.z * coverageNormal.z));
}

TerrainProjectSurfaceCoverageResult terrainProjectApplySurfaceCoverage(
  Varyings varyings,
  vec3 geometryNormalWS,
  mat3 tangentToWorld,
  vec3 baseTangentNormal,
  vec3 baseNormalWS,
  vec3 albedoColor,
  float metallic,
  float smoothness
) {
  float coverageNormal = baseNormalWS.y;
  #ifdef MATERIAL_COVERAGE_USE_LOCAL_NORMAL
    coverageNormal = normalize(varyings.sourceNormalOS).y;
  #endif
  float overlayNormal = mix(
    coverageNormal,
    varyings.sourcePositionOS.y,
    material_CoverageOverlayMethod
  );
  float offsetNormal = overlayNormal + (1.0 - material_CoverageOffset);
  float slopeCoverage = mix(offsetNormal, 1.0 - offsetNormal, material_CoverageBalance);
  float maskSample = texture2D(
    material_CoverageMaskTexture,
    varyings.uv * material_CoverageMaskTiling
  ).g;
  float contrastMask = mix(1.0 - maskSample, maskSample, material_CoverageMaskContrast);
  float coverageMask = clamp(slopeCoverage * clamp(contrastMask, 0.0, 1.0), 0.0, 1.0);

  vec4 coverageColor = terrainProjectSampleCoverageColor(varyings.positionWS, geometryNormalWS);
  vec4 coverageMetallicSmoothness = terrainProjectSampleCoverageMetallicSmoothness(
    varyings.positionWS,
    geometryNormalWS
  );
  float coverageSmoothness = mix(
    coverageMetallicSmoothness.a,
    coverageColor.a,
    material_CoverageSmoothnessSource
  ) * material_CoverageSmoothness;

  vec3 coverageNormalWS = terrainProjectSampleCoverageNormal(varyings.positionWS, geometryNormalWS);
  vec3 coverageTangentNormal = vec3(
    dot(tangentToWorld[0], coverageNormalWS),
    dot(tangentToWorld[1], coverageNormalWS),
    dot(tangentToWorld[2], coverageNormalWS)
  );
  vec3 blendedCoverageNormal = mix(
    terrainProjectBlendCoverageNormals(baseTangentNormal, coverageTangentNormal),
    coverageTangentNormal,
    1.0 - material_CoverageNormalBlending
  );
  vec3 finalTangentNormal = normalize(mix(baseTangentNormal, blendedCoverageNormal, coverageMask));

  TerrainProjectSurfaceCoverageResult result;
  vec3 coverageAlbedo = material_CoverageColor.rgb * coverageColor.rgb;
  #ifdef MATERIAL_COVERAGE_SEASON_SPECIES
    coverageAlbedo = terrainProjectApplySeasonColor(coverageAlbedo, MATERIAL_COVERAGE_SEASON_SPECIES);
  #endif
  result.albedoColor = mix(
    albedoColor,
    coverageAlbedo,
    coverageMask
  );
  result.metallic = mix(
    metallic,
    material_CoverageMetallic * coverageMetallicSmoothness.r,
    coverageMask
  );
  result.smoothness = mix(smoothness, coverageSmoothness, coverageMask);
  result.normalWS = normalize(tangentToWorld * finalTangentNormal);
  return result;
}

#endif

#endif
