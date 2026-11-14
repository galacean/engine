#ifndef TERRAIN_PROJECT_SURFACE_EVALUATION_INCLUDED
#define TERRAIN_PROJECT_SURFACE_EVALUATION_INCLUDED

#include "ShaderLibrary/Common/Normal.glsl"
#include "shared/Instancing.glsl"
#if defined(MATERIAL_SEASON_SPECIES) || defined(MATERIAL_COVERAGE_SEASON_SPECIES)
  #include "shared/SceneSeason.glsl"
#endif
#define TERRAIN_PROJECT_SURFACE_RAIN_NORMALS
#include "shared/SurfaceClimate.glsl"
#ifdef MATERIAL_ENABLE_COVERAGE
  #include "surface/SurfaceCoverage.glsl"
#endif

#if defined(MATERIAL_WORLD_BASE) || defined(MATERIAL_WORLD_NORMAL)
  #include "surface/SurfaceProjection.glsl"
#endif
#ifdef MATERIAL_TERRAIN_COLOR_COVERAGE
  #include "shared/TerrainLayerEvaluation.glsl"
  vec2 material_TerrainCoverageSlope;
  float material_TerrainCoverageInvert;
  float material_NormalTerrainRegionOnly;
  float material_NormalBaseRegionOnly;
  float material_SurfaceCoveragePreview;
#endif
vec4 material_BaseColor;
float material_Tiling;
#ifdef MATERIAL_HAS_UV_SCALE
vec2 material_UvScale;
#endif
float material_Metallic;
float material_Smoothness;
float material_SmoothnessSource;
float material_NormalScale;
float material_OcclusionStrength;
#ifdef MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT
vec4 material_TrunkVerticalGradientBottomColor;
float material_TrunkVerticalGradientBottomStrength;
vec4 material_TrunkVerticalGradientTopColor;
float material_TrunkVerticalGradientTopStrength;
vec4 material_TrunkVerticalGradientBounds;
#endif

#ifdef MATERIAL_HAS_BASETEXTURE
sampler2D material_BaseTexture;
#endif
#ifdef MATERIAL_HAS_NORMALTEXTURE
sampler2D material_NormalTexture;
#endif
#ifdef MATERIAL_HAS_METALLIC_SMOOTHNESS_TEXTURE
sampler2D material_MetallicSmoothnessTexture;
#endif
#ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
sampler2D material_OcclusionTexture;
#endif

SurfaceData evaluateSurfaceMaterial(Varyings varyings, bool isFrontFacing) {
  SurfaceData surfaceData;
  vec2 materialUv = varyings.uv * material_Tiling;
  #ifdef MATERIAL_HAS_UV_SCALE
    materialUv *= material_UvScale;
  #endif
  #if defined(RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE) && \
    !defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG)
    materialUv *= terrainProjectProceduralTreeBarkUvScale();
  #endif
  float faceSign = isFrontFacing ? 1.0 : -1.0;
  #ifdef RENDERER_HAS_NORMAL
    vec3 geometryNormal = normalize(varyings.normalWS) * faceSign;
  #else
    vec3 geometryNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS))) * faceSign;
  #endif
  vec4 baseTexture = vec4(1.0);
  #ifdef MATERIAL_HAS_BASETEXTURE
    #ifdef MATERIAL_WORLD_BASE
      baseTexture = surfaceWorldBase(material_BaseTexture, varyings.positionWS, geometryNormal);
    #else
      baseTexture = texture2DSRGB(material_BaseTexture, materialUv);
    #endif
  #endif
  #ifdef MATERIAL_SURFACE_ALPHA_CLIP
    if (baseTexture.a < 0.5) discard;
  #endif
  vec3 albedoColor = material_BaseColor.rgb * baseTexture.rgb;

  float metallic = material_Metallic;
  float smoothness = material_Smoothness;
  #ifdef MATERIAL_HAS_METALLIC_SMOOTHNESS_TEXTURE
    vec4 metallicSmoothness = texture2D(material_MetallicSmoothnessTexture, materialUv);
    metallic *= metallicSmoothness.r;
    smoothness *= material_SmoothnessSource > 0.5 ? baseTexture.a : metallicSmoothness.a;
  #endif

  float ambientOcclusion = 1.0;
  #ifdef MATERIAL_HAS_OCCLUSION_TEXTURE
    ambientOcclusion = mix(
      1.0,
      texture2D(material_OcclusionTexture, materialUv).g,
      material_OcclusionStrength
    );
  #endif

  vec3 shadingNormal = geometryNormal;
  vec3 baseTangentNormal = vec3(0.0, 0.0, 1.0);
  #if (defined(MATERIAL_HAS_NORMALTEXTURE) && !defined(MATERIAL_WORLD_NORMAL)) || defined(MATERIAL_ENABLE_COVERAGE)
    #ifdef NEED_VERTEX_TANGENT
      mat3 tangentToWorld = mat3(varyings.tangentWS, varyings.bitangentWS, geometryNormal);
    #else
      mat3 tangentToWorld = getTBNByDerivatives(
        materialUv,
        geometryNormal,
        varyings.positionWS,
        isFrontFacing
      );
    #endif
  #endif
  #if defined(MATERIAL_HAS_NORMALTEXTURE) && !defined(MATERIAL_WORLD_NORMAL)
    baseTangentNormal = texture2D(material_NormalTexture, materialUv).xyz * 2.0 - 1.0;
    baseTangentNormal.xy *= material_NormalScale;
    baseTangentNormal.z = mix(1.0, baseTangentNormal.z, clamp(material_NormalScale, 0.0, 1.0));
    shadingNormal = getNormalByNormalTexture(
      tangentToWorld,
      material_NormalTexture,
      material_NormalScale,
      materialUv,
      isFrontFacing
    );
  #endif
  #if defined(MATERIAL_HAS_NORMALTEXTURE) && defined(MATERIAL_WORLD_NORMAL)
    shadingNormal = surfaceWorldNormal(material_NormalTexture, varyings.positionWS, geometryNormal, material_NormalScale);
  #endif
  #ifdef MATERIAL_ENABLE_COVERAGE
    TerrainProjectSurfaceCoverageResult coverage = terrainProjectApplySurfaceCoverage(
      varyings,
      geometryNormal,
      tangentToWorld,
      baseTangentNormal,
      shadingNormal,
      albedoColor,
      metallic,
      smoothness
    );
    albedoColor = coverage.albedoColor;
    metallic = coverage.metallic;
    smoothness = coverage.smoothness;
    shadingNormal = coverage.normalWS;
  #endif
  #ifdef MATERIAL_TERRAIN_COLOR_COVERAGE
    float terrainCoverage = smoothstep(material_TerrainCoverageSlope.x,
      material_TerrainCoverageSlope.x + max(material_TerrainCoverageSlope.y, 0.001), geometryNormal.y);
    terrainCoverage = mix(terrainCoverage, 1.0 - terrainCoverage, material_TerrainCoverageInvert);
    shadingNormal = normalize(mix(geometryNormal, shadingNormal,
      mix(1.0, terrainCoverage, material_NormalTerrainRegionOnly) *
      mix(1.0, 1.0 - terrainCoverage, material_NormalBaseRegionOnly)));
    TerrainProjectLayerBlend ground = terrainProjectGroundSurface(varyings.positionWS);
    albedoColor = mix(albedoColor, terrainProjectGroundColor(ground, varyings.positionWS),
      terrainCoverage * clamp(ground.weight, 0.0, 1.0));
    albedoColor = mix(albedoColor, vec3(terrainCoverage), clamp(material_SurfaceCoveragePreview, 0.0, 1.0));
  #endif
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    albedoColor *= varyings.assetAssemblyColor;
  #endif
  #ifdef MATERIAL_PROCEDURAL_TREE_TRUNK_VERTICAL_GRADIENT
    float trunkNormalizedHeight = clamp(
      (varyings.sourcePositionOS.y - material_TrunkVerticalGradientBounds.x) *
        material_TrunkVerticalGradientBounds.y,
      0.0,
      1.0
    );
    vec3 trunkBottomTint = max(
      vec3(0.0),
      vec3(1.0) +
        (material_TrunkVerticalGradientBottomColor.rgb - vec3(1.0)) *
          max(material_TrunkVerticalGradientBottomStrength, 0.0)
    );
    vec3 trunkTopTint = max(
      vec3(0.0),
      vec3(1.0) +
        (material_TrunkVerticalGradientTopColor.rgb - vec3(1.0)) *
          max(material_TrunkVerticalGradientTopStrength, 0.0)
    );
    albedoColor *= mix(trunkBottomTint, trunkTopTint, trunkNormalizedHeight);
  #endif
  #ifdef MATERIAL_SEASON_SPECIES
    albedoColor = terrainProjectApplySeasonColor(albedoColor, MATERIAL_SEASON_SPECIES);
  #endif

  surfaceData.albedoColor = albedoColor;
  surfaceData.emissiveColor = vec3(0.0);
  surfaceData.metallic = clamp(metallic, 0.0, 1.0);
  surfaceData.roughness = 1.0 - clamp(smoothness, 0.0, 1.0);
  surfaceData.ambientOcclusion = clamp(ambientOcclusion, 0.0, 1.0);
  surfaceData.opacity = 1.0;
  surfaceData.IOR = 1.5;
  surfaceData.position = varyings.positionWS;
  surfaceData.positionCS = varyings.positionCS;
  surfaceData.normal = shadingNormal;
  #ifdef NEED_TANGENT_SPACE
    surfaceData.tangent = tangentToWorld[0];
    surfaceData.bitangent = tangentToWorld[1];
  #endif
  #ifdef CAMERA_ORTHOGRAPHIC
    surfaceData.viewDir = -camera_Forward;
  #else
    surfaceData.viewDir = normalize(camera_Position - varyings.positionWS);
  #endif
  surfaceData.dotNV = clamp(dot(surfaceData.normal, surfaceData.viewDir), 0.0, 1.0);
  surfaceData.specularIntensity = 1.0;
  surfaceData.specularColor = vec3(1.0);
  terrainProjectApplySurfaceClimate(surfaceData, geometryNormal, vec3(1.0, 0.35, 0.9));
  return surfaceData;
}

#endif
