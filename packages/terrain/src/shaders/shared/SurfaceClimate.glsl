#ifndef TERRAIN_PROJECT_SURFACE_CLIMATE_INCLUDED
#define TERRAIN_PROJECT_SURFACE_CLIMATE_INCLUDED

// x: persistent wetness, y: puddle storage, z: snow cover, w: current rain rate.
vec4 scene_SurfaceClimate;
vec4 scene_SurfaceSnowColor;

// Terrain rainwater presentation is Scene-owned so Forward and SSR read identical values.
// coverage: x multiplier, y storage bias, z reflection intensity, w SSR source mix.
vec4 scene_TerrainWaterCoverageParams;
// surface: x thin roughness, y standing roughness, z normal flattening, w ripple strength.
vec4 scene_TerrainWaterSurfaceParams;
// optics: x ripple roughness multiplier, y IOR, zw reserved.
vec4 scene_TerrainWaterOpticsParams;
// ripple: x whole-field UV tiling, y independent field count, z rain-surface visibility, w reserved.
vec4 scene_TerrainRippleParams;

#ifdef TERRAIN_PROJECT_WATER_LAYER
  float terrainProjectWaterIOR() {
    return clamp(scene_TerrainWaterOpticsParams.y, 1.001, 2.0);
  }

  float terrainProjectWaterF0() {
    float eta = (terrainProjectWaterIOR() - 1.0) / (terrainProjectWaterIOR() + 1.0);
    return eta * eta;
  }

  struct TerrainProjectWaterFilm {
    vec3 normal;
    float roughness;
    float coverage;
    float dotNV;
    float ambientOcclusion;
  };

  struct TerrainProjectWaterFilmAccumulator {
    vec3 weightedNormal;
    float weightedRoughness;
    float weightedCoverage;
    float weightedAmbientOcclusion;
  };
#endif
#ifdef TERRAIN_PROJECT_SURFACE_RAIN_NORMALS
  float scene_WeatherTime;
  sampler2D scene_SurfaceRippleNormalAtlas;
  sampler2D scene_SurfaceWaterNormal;
#endif
#ifdef TERRAIN_PROJECT_PUDDLE_HYDROLOGY
  sampler2D material_TerrainPuddleAtlas;
  vec2 material_TerrainPuddleAtlasInvSize;
  vec4 material_TerrainRegionPuddleRects[TERRAIN_PROJECT_MAX_ACTIVE_REGIONS];
#endif

float terrainProjectSurfaceClimateHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

float terrainProjectSurfaceClimateValueNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float lower = mix(
    terrainProjectSurfaceClimateHash(cell),
    terrainProjectSurfaceClimateHash(cell + vec2(1.0, 0.0)),
    blend.x
  );
  float upper = mix(
    terrainProjectSurfaceClimateHash(cell + vec2(0.0, 1.0)),
    terrainProjectSurfaceClimateHash(cell + vec2(1.0, 1.0)),
    blend.x
  );
  return mix(lower, upper, blend.y);
}

float terrainProjectSurfaceClimateNoise(vec2 worldXZ) {
  float broad = terrainProjectSurfaceClimateValueNoise(worldXZ * 0.055);
  float detail = terrainProjectSurfaceClimateValueNoise(worldXZ * 0.17 + vec2(19.7, 43.1));
  return mix(broad, detail, 0.28);
}

#ifdef TERRAIN_PROJECT_SURFACE_RAIN_NORMALS
  vec3 terrainProjectDecodeSurfaceNormal(vec3 encodedNormal) {
    vec3 normal = encodedNormal * 2.0 - 1.0;
    return normalize(vec3(normal.xy, max(normal.z, 0.08)));
  }

  vec3 terrainProjectSampleRippleFrame(vec2 localUv, float frame) {
    vec2 frameCell = vec2(mod(frame, 8.0), floor(frame * 0.125));
    // Keep bilinear filtering inside one frame because the atlas intentionally has no mip chain.
    vec2 frameUv = (frameCell + mix(vec2(0.04), vec2(0.96), clamp(localUv, 0.0, 1.0))) * 0.125;
    return terrainProjectDecodeSurfaceNormal(texture2D(scene_SurfaceRippleNormalAtlas, frameUv).xyz);
  }

  vec3 terrainProjectScaleTangentNormal(vec3 tangentNormal, float strength) {
    float clampedStrength = clamp(strength, 0.0, 1.0);
    float scaledZ = mix(1.0, max(tangentNormal.z, 0.08), clampedStrength);
    return normalize(vec3(tangentNormal.xy * clampedStrength, scaledZ));
  }

  // Unity's BlendNormal uses this whiteout form: XY slopes add while the two Z responses
  // multiply. Unlike a linear mix, it preserves the signed inner/outer slopes of both rings.
  vec3 terrainProjectBlendWhiteoutNormals(vec3 baseNormal, vec3 detailNormal) {
    return normalize(vec3(baseNormal.xy + detailNormal.xy, baseNormal.z * detailNormal.z));
  }

  vec3 terrainProjectRippleField(vec2 fieldUv, float frameOffset, float rainStrength) {
    float frameRate = mix(8.0, 24.0, clamp(rainStrength, 0.0, 1.0));
    float frame = floor(mod(scene_WeatherTime * frameRate + frameOffset, 64.0));
    return terrainProjectSampleRippleFrame(fract(fieldUv), frame);
  }

  void terrainProjectPuddleNormal(
    vec3 waterSurfaceNormal,
    vec2 worldXZ,
    float rainStrength,
    out vec3 puddleNormal,
    out float ringResponse
  ) {
    // Tiling owns the physical size of every ring field. Count only enables additional
    // independently rotated fields, so changing quantity never rescales existing rings.
    float rippleUvTiling = clamp(scene_TerrainRippleParams.x, 0.05, 8.0);
    float rippleCount = clamp(scene_TerrainRippleParams.y, 0.0, 4.0);
    vec2 rippleUv = worldXZ * (0.68 * rippleUvTiling);
    vec2 rotatedUvB = vec2(rippleUv.x * 0.8 - rippleUv.y * 0.6, rippleUv.x * 0.6 + rippleUv.y * 0.8);
    vec2 rotatedUvC = vec2(rippleUv.x * -0.28 - rippleUv.y * 0.96, rippleUv.x * 0.96 - rippleUv.y * 0.28);
    vec2 rotatedUvD = vec2(rippleUv.x * 0.54 - rippleUv.y * 0.84, rippleUv.x * 0.84 + rippleUv.y * 0.54);
    vec4 rippleWeights = clamp(rippleCount - vec4(0.0, 1.0, 2.0, 3.0), 0.0, 1.0);
    vec3 rippleA = terrainProjectRippleField(rippleUv, 0.0, rainStrength);
    vec3 rippleB = terrainProjectRippleField(
      rotatedUvB + vec2(0.37, 0.19),
      23.0,
      rainStrength
    );
    vec3 rippleC = terrainProjectRippleField(
      rotatedUvC + vec2(0.71, 0.43),
      41.0,
      rainStrength
    );
    vec3 rippleD = terrainProjectRippleField(
      rotatedUvD + vec2(0.13, 0.79),
      57.0,
      rainStrength
    );

    vec2 waterUv = worldXZ * 0.34;
    vec3 waterA = terrainProjectDecodeSurfaceNormal(texture2D(
      scene_SurfaceWaterNormal,
      waterUv + scene_WeatherTime * vec2(0.021, -0.014)
    ).xyz);
    vec3 waterB = terrainProjectDecodeSurfaceNormal(texture2D(
      scene_SurfaceWaterNormal,
      vec2(-waterUv.y, waterUv.x) * 1.37 + scene_WeatherTime * vec2(-0.017, 0.012)
    ).xyz);

    // Rain amount changes flipbook speed (event frequency). Once a drop exists, its ring keeps
    // a stable normal amplitude instead of fading into a flat surface in lighter rain.
    float rippleVisibility = smoothstep(0.015, 0.12, rainStrength);
    vec3 tangentNormal = vec3(0.0, 0.0, 1.0);
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(waterA, 0.025)
    );
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(waterB, 0.025)
    );
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(rippleA, 0.42 * rippleVisibility * rippleWeights.x)
    );
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(rippleB, 0.32 * rippleVisibility * rippleWeights.y)
    );
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(rippleC, 0.27 * rippleVisibility * rippleWeights.z)
    );
    tangentNormal = terrainProjectBlendWhiteoutNormals(
      tangentNormal,
      terrainProjectScaleTangentNormal(rippleD, 0.23 * rippleVisibility * rippleWeights.w)
    );
    float weightedRingResponse = max(
      max(length(rippleA.xy) * rippleWeights.x, length(rippleB.xy) * rippleWeights.y),
      max(length(rippleC.xy) * rippleWeights.z, length(rippleD.xy) * rippleWeights.w)
    );
    ringResponse = clamp(weightedRingResponse * 2.4, 0.0, 1.0) * rippleVisibility;

    vec3 basisNormal = normalize(waterSurfaceNormal);
    vec3 tangent = vec3(1.0, 0.0, 0.0) - basisNormal * basisNormal.x;
    if (dot(tangent, tangent) < 1e-5) {
      tangent = vec3(0.0, 0.0, 1.0) - basisNormal * basisNormal.z;
    }
    tangent = normalize(tangent);
    vec3 bitangent = normalize(cross(tangent, basisNormal));
    puddleNormal = normalize(
      tangent * tangentNormal.x + bitangent * tangentNormal.y + basisNormal * tangentNormal.z
    );
  }
#endif

float terrainProjectSurfacePuddleStorage(float response) {
  return clamp((scene_SurfaceClimate.y + scene_TerrainWaterCoverageParams.y) * response, 0.0, 1.0);
}

float terrainProjectSurfaceWetness(float response) {
  return clamp(max(scene_SurfaceClimate.x, scene_SurfaceClimate.w * 0.48) * response, 0.0, 1.0);
}

vec2 terrainProjectSurfaceHydrologyMasks(vec3 worldPosition, float response) {
  float storage = terrainProjectSurfacePuddleStorage(response);
  #ifdef TERRAIN_PROJECT_PUDDLE_HYDROLOGY
    int regionIndex = terrainProjectRegionIndex(worldPosition.xz);
    if (regionIndex < 0) return vec2(0.0);
    vec4 bounds = GROUND_TerrainRegionWorldBounds[regionIndex];
    vec4 rect = material_TerrainRegionPuddleRects[regionIndex];
    vec2 local = clamp((worldPosition.xz - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
    vec2 atlasTexel = rect.xy + local * (rect.zw - vec2(1.0));
    vec2 hydrology = texture2D(
      material_TerrainPuddleAtlas,
      (atlasTexel + vec2(0.5)) * material_TerrainPuddleAtlasInvSize
    ).rg;
    float fillDistance = storage - hydrology.r;
#ifdef MATERIAL_TERRAIN_FEATHERED_PUDDLES
    // The authored RG8 stores continuous fill thresholds and depth classes.
    // Let the water advance gradually across the baked contour as storage rises.
    float shorelineWidth = 0.09;
#else
    float shorelineWidth = 1.0 / 255.0;
#endif
    float classWidth = 0.02;
    #ifdef HAS_DERIVATIVES
      shorelineWidth = max(fwidth(fillDistance) * 1.25, shorelineWidth);
      classWidth = max(fwidth(hydrology.g) * 1.25, classWidth);
    #endif
#ifdef MATERIAL_TERRAIN_FEATHERED_PUDDLES
    // Reserve shallow-film coverage below 0.5 so a basin shoulder cannot
    // briefly become more opaque than the shallow film that surrounds it.
    float retainedSurface = 0.42 * smoothstep(0.0, 0.37 + classWidth, hydrology.g);
    float resolvedBasin = smoothstep(0.42 - classWidth, 0.97, hydrology.g);
#else
    float retainedSurface = smoothstep(0.25 - classWidth, 0.45 + classWidth, hydrology.g);
    float resolvedBasin = smoothstep(0.75 - classWidth, 0.95 + classWidth, hydrology.g);
#endif
    float filled = smoothstep(-shorelineWidth, shorelineWidth, fillDistance);
    float hydrologyCoverage = filled * smoothstep(0.06, 0.3, storage);
    return vec2(
      retainedSurface * (1.0 - resolvedBasin) * hydrologyCoverage,
      resolvedBasin * hydrologyCoverage
    );
  #else
    return vec2(0.0);
  #endif
}

#ifdef TERRAIN_PROJECT_WATER_LAYER
  float terrainProjectSurfaceThinFilmCoverage(
    vec3 geometryNormal,
    float rainWetness,
    float microRetention
  ) {
    float upward = clamp(normalize(geometryNormal).y, 0.0, 1.0);
    float filmSlopeAcceptance = smoothstep(0.42, 0.94, upward);
    float activeRain = smoothstep(0.03, 0.68, scene_SurfaceClimate.w);
    float filmCapacity = mix(0.22, 0.38, activeRain);
    float baseFilmCoverage = smoothstep(0.08, 0.82, rainWetness) * filmSlopeAcceptance * filmCapacity;
    // The hydrology mask already represents anti-aliased occupied surface area after applying
    // the current retained-water storage. Use that area directly instead of adding a separate
    // visibility gain for unresolved catchments.
    float retainedFilmCoverage = microRetention * filmSlopeAcceptance;
    return baseFilmCoverage + (1.0 - baseFilmCoverage) * retainedFilmCoverage;
  }

  float terrainProjectSurfaceWaterCoverage(float standingWaterCoverage, float thinFilmCoverage) {
    // Standing water occupies part of a surface that may already carry a thin film. Composite
    // their fractional coverage instead of taking max(), whose derivative creates a visible
    // contour where the two masks cross.
    return clamp(
      standingWaterCoverage + (1.0 - standingWaterCoverage) * thinFilmCoverage,
      0.0,
      1.0
    );
  }

  float terrainProjectSurfaceStandingWaterLobe(float standingWaterCoverage, float waterCoverage) {
    // The mobile path carries one water GGX lobe. Pick the lobe with the greater physical
    // coverage instead of rotating its normal through a direction that no water surface owns.
    float standingWaterShare = standingWaterCoverage / max(waterCoverage, 1e-4);
#ifdef MATERIAL_TERRAIN_FEATHERED_PUDDLES
    return clamp(standingWaterShare, 0.0, 1.0);
#else
    return step(0.5, standingWaterShare);
#endif
  }
#endif

void terrainProjectApplySurfaceMoisture(
  inout SurfaceData surfaceData,
  vec3 geometryNormal,
  vec2 response
) {
  float wetness = terrainProjectSurfaceWetness(response.x);

  // Porous wetting modifies the substrate itself. It is material dependent and spatially
  // continuous, so the procedural puddle boundary never appears as a dark albedo mask.
  float porousResponse =
    (1.0 - surfaceData.metallic) * mix(0.35, 1.0, smoothstep(0.18, 0.82, surfaceData.roughness));
  float wetSubstrate = wetness * porousResponse;
  float substrateLuminance = dot(surfaceData.albedoColor, vec3(0.2126, 0.7152, 0.0722));
  vec3 saturatedSubstrate = mix(vec3(substrateLuminance), surfaceData.albedoColor, 1.08);
  vec3 wetAlbedo = max(saturatedSubstrate * 0.78, vec3(0.0));
  surfaceData.albedoColor = mix(surfaceData.albedoColor, wetAlbedo, wetSubstrate);
  float wetRoughness = max(0.14, surfaceData.roughness * 0.62);
  surfaceData.roughness = mix(surfaceData.roughness, wetRoughness, wetSubstrate * 0.72);
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

float terrainProjectTopSnowMask(vec3 worldPosition, vec3 geometryNormal, float response) {
  float snowStorage = clamp(scene_SurfaceClimate.z * response, 0.0, 1.0);
  float distribution = terrainProjectSurfaceClimateNoise(worldPosition.xz);
  float snowDistribution = smoothstep(0.06, 0.64, snowStorage + (distribution - 0.5) * 0.22);
  float upward = clamp(normalize(geometryNormal).y, 0.0, 1.0);
  return snowDistribution * smoothstep(0.34, 0.82, upward) * snowStorage;
}

void terrainProjectApplyTopSnowLayer(
  inout SurfaceData surfaceData,
  vec3 geometryNormal,
  float snow,
  float targetRoughness,
  float normalFlattening
) {
  surfaceData.albedoColor = mix(surfaceData.albedoColor, scene_SurfaceSnowColor.rgb, snow);
  surfaceData.metallic = mix(surfaceData.metallic, 0.0, snow);
  surfaceData.roughness = mix(surfaceData.roughness, targetRoughness, snow);
  surfaceData.specularIntensity = mix(surfaceData.specularIntensity, 0.68, snow);
  surfaceData.normal = normalize(mix(surfaceData.normal, normalize(geometryNormal), snow * normalFlattening));
}

#ifdef TERRAIN_PROJECT_WATER_LAYER
  TerrainProjectWaterFilm terrainProjectEvaluateSurfaceWaterFilm(
    SurfaceData surfaceData,
    vec3 geometryNormal,
    float waterResponse,
    float snow
  ) {
    // Persistent wetness belongs to the porous substrate response. Only current rain seeds
    // the free-surface base film, while hydrology retains water independently.
    float rainWetness = clamp(scene_SurfaceClimate.w * 0.48 * waterResponse, 0.0, 1.0);
    vec2 hydrologyMasks = terrainProjectSurfaceHydrologyMasks(
      surfaceData.position,
      waterResponse
    );
    float microRetention = hydrologyMasks.x;
    float standingWaterCoverage = hydrologyMasks.y;
    float thinFilmCoverage = terrainProjectSurfaceThinFilmCoverage(
      geometryNormal,
      rainWetness,
      microRetention
    );
    float physicalWaterCoverage = terrainProjectSurfaceWaterCoverage(
      standingWaterCoverage,
      thinFilmCoverage
    );
    float standingWaterLobe = terrainProjectSurfaceStandingWaterLobe(
      standingWaterCoverage,
      physicalWaterCoverage
    );
    // Apply the reversible rain transition after hydrology classification. Multiplying storage
    // before the nonlinear basin thresholds would make fade-in perceptually slower than fade-out.
    float waterCoverage = clamp(
      physicalWaterCoverage * scene_TerrainRippleParams.z * scene_TerrainWaterCoverageParams.x,
      0.0,
      1.0
    );
    // Unresolved micro-catchments only increase the substrate-following film. A resolved basin
    // owns a gravity-level free surface; anti-aliased coverage changes energy, not its direction.
    vec3 thinFilmNormal = normalize(mix(
      surfaceData.normal,
      normalize(geometryNormal),
      scene_TerrainWaterSurfaceParams.z
    ));
    vec3 waterNormal = mix(thinFilmNormal, vec3(0.0, 1.0, 0.0), standingWaterLobe);
#ifdef MATERIAL_TERRAIN_FEATHERED_PUDDLES
    waterNormal = normalize(waterNormal);
#endif
    float rainStrength = smoothstep(0.04, 0.72, scene_SurfaceClimate.w);
    float thinFilmRoughness = clamp(
      scene_TerrainWaterSurfaceParams.x + rainStrength * 0.02,
      0.005,
      1.0
    );
    float standingWaterRoughness = clamp(
      scene_TerrainWaterSurfaceParams.y + rainStrength * 0.02,
      0.005,
      1.0
    );
    float waterRoughness = mix(
      thinFilmRoughness,
      standingWaterRoughness,
      standingWaterLobe
    );
    #ifdef TERRAIN_PROJECT_SURFACE_RAIN_NORMALS
      if (waterCoverage > 0.001) {
        vec3 animatedNormal;
        float ringResponse;
        terrainProjectPuddleNormal(
          waterNormal,
          surfaceData.position.xz,
          rainStrength,
          animatedNormal,
          ringResponse
        );
        float rippleVisibility = smoothstep(0.015, 0.12, rainStrength);
        // Scale the animated normal's tangent-plane slope so values above 1 continue
        // strengthening the rings instead of immediately saturating the blend weight.
        float animatedAlignment = max(dot(waterNormal, animatedNormal), 0.1);
        vec3 animatedSlope = animatedNormal / animatedAlignment - waterNormal;
        vec3 scaledAnimatedNormal = normalize(
          waterNormal + animatedSlope * scene_TerrainWaterSurfaceParams.w
        );
        float rippleWeight = waterCoverage * rippleVisibility * mix(0.58, 0.9, standingWaterLobe);
        waterNormal = normalize(mix(waterNormal, scaledAnimatedNormal, rippleWeight));
        float ringPolish = ringResponse * waterCoverage;
        waterRoughness = mix(
          waterRoughness,
          max(0.018, waterRoughness * scene_TerrainWaterOpticsParams.x),
          ringPolish
        );
      }
    #endif

    TerrainProjectWaterFilm waterFilm;
    waterFilm.normal = waterNormal;
    waterFilm.roughness = waterRoughness;
    waterFilm.coverage = waterCoverage * (1.0 - snow);
    waterFilm.dotNV = clamp(dot(waterNormal, surfaceData.viewDir), 0.0, 1.0);
    waterFilm.ambientOcclusion = surfaceData.ambientOcclusion;
    return waterFilm;
  }

  TerrainProjectWaterFilmAccumulator terrainProjectCreateWaterFilmAccumulator() {
    TerrainProjectWaterFilmAccumulator accumulator;
    accumulator.weightedNormal = vec3(0.0);
    accumulator.weightedRoughness = 0.0;
    accumulator.weightedCoverage = 0.0;
    accumulator.weightedAmbientOcclusion = 0.0;
    return accumulator;
  }

  void terrainProjectAccumulateWaterFilm(
    inout TerrainProjectWaterFilmAccumulator accumulator,
    TerrainProjectWaterFilm waterFilm,
    float weight
  ) {
    float weightedCoverage = waterFilm.coverage * max(weight, 0.0);
    accumulator.weightedNormal += waterFilm.normal * weightedCoverage;
    accumulator.weightedRoughness += waterFilm.roughness * weightedCoverage;
    accumulator.weightedCoverage += weightedCoverage;
    accumulator.weightedAmbientOcclusion += waterFilm.ambientOcclusion * weightedCoverage;
  }

  TerrainProjectWaterFilm terrainProjectResolveWaterFilm(
    TerrainProjectWaterFilmAccumulator accumulator,
    vec3 fallbackNormal,
    vec3 viewDirection,
    float fallbackAmbientOcclusion
  ) {
    TerrainProjectWaterFilm waterFilm;
    float weightedCoverage = accumulator.weightedCoverage;
    if (weightedCoverage > 1e-5) {
      waterFilm.normal = normalize(accumulator.weightedNormal);
      waterFilm.roughness = accumulator.weightedRoughness / weightedCoverage;
      waterFilm.ambientOcclusion = accumulator.weightedAmbientOcclusion / weightedCoverage;
    } else {
      waterFilm.normal = normalize(fallbackNormal);
      waterFilm.roughness = 0.1;
      waterFilm.ambientOcclusion = fallbackAmbientOcclusion;
    }
    waterFilm.coverage = clamp(weightedCoverage, 0.0, 1.0);
    waterFilm.dotNV = clamp(dot(waterFilm.normal, viewDirection), 0.0, 1.0);
    return waterFilm;
  }

  SurfaceData terrainProjectBuildWaterFilmSurface(
    SurfaceData substrate,
    TerrainProjectWaterFilm waterFilm
  ) {
    SurfaceData waterSurface = substrate;
    waterSurface.albedoColor = vec3(0.0);
    waterSurface.emissiveColor = vec3(0.0);
    waterSurface.metallic = 0.0;
    waterSurface.roughness = waterFilm.roughness;
    waterSurface.ambientOcclusion = waterFilm.ambientOcclusion;
    waterSurface.opacity = 1.0;
    waterSurface.IOR = terrainProjectWaterIOR();
    waterSurface.normal = waterFilm.normal;
    waterSurface.dotNV = waterFilm.dotNV;
    waterSurface.specularIntensity = 1.0;
    waterSurface.specularColor = vec3(1.0);
    return waterSurface;
  }

  void terrainProjectApplySurfaceClimateWithWaterFilm(
    inout SurfaceData surfaceData,
    vec3 geometryNormal,
    vec3 response,
    out TerrainProjectWaterFilm waterFilm
  ) {
    terrainProjectApplySurfaceMoisture(surfaceData, geometryNormal, response.xy);
    float snow = terrainProjectTopSnowMask(surfaceData.position, geometryNormal, response.z);
    waterFilm = terrainProjectEvaluateSurfaceWaterFilm(surfaceData, geometryNormal, response.y, snow);
    terrainProjectApplyTopSnowLayer(surfaceData, geometryNormal, snow, 0.82, 0.28);
    surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
  }
#endif

void terrainProjectApplySurfaceClimate(
  inout SurfaceData surfaceData,
  vec3 geometryNormal,
  vec3 response
) {
  terrainProjectApplySurfaceMoisture(surfaceData, geometryNormal, response.xy);
  float snow = terrainProjectTopSnowMask(surfaceData.position, geometryNormal, response.z);
  terrainProjectApplyTopSnowLayer(surfaceData, geometryNormal, snow, 0.82, 0.28);
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
}

#endif
