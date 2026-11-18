#ifndef TERRAIN_PROJECT_VEGETATION_INPUT_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_INPUT_INCLUDED

vec4 material_BaseColor;
float material_Tiling;
float material_AlphaCutoff;
float material_Smoothness;
float material_NormalScale;
float material_LightingFlatness;
vec4 material_SecondColor;
float material_SecondColorOffset;
float material_SecondColorFade;
float material_SecondColorLevel;
float material_SecondColorGradient;
float material_SecondColorWorldNoiseScale;
float material_LeafAlbedoBrightness;
float material_LeafAlbedoDesaturation;
float material_LeafAlbedoTextureBlend;
float material_LeafBaseAOInfluence;
float material_LeafGlancingAngleCut;
float material_LeafFlipBackfaceNormals;
vec4 material_TranslucencyColor;
float material_TranslucencyIntensity;
float material_TranslucencyBacklightThreshold;
float material_TranslucencyNormalWrap;
float material_TranslucencyEnergyScale;
float material_TranslucencyAOInfluence;
float material_TranslucencyNormalDistortion;
float material_TranslucencyScattering;
float material_TranslucencyDirect;
float material_TranslucencyAmbient;
float material_TranslucencyShadowStrength;
float material_ProceduralTreeCanopyOcclusionDensity;
vec4 material_ProceduralTreeCanopyOcclusionColor;
float material_WindForce;
float material_WindWavesScale;
float material_WindFlowDensity;
vec4 material_WindGroundWaveParams;
vec4 material_WindGroundShapeParams;
vec4 material_WindHierarchyParams;
vec4 material_WindLeafMotionParams;
vec4 material_WindSpeciesParams;
vec4 material_WindTrunkModeParams;
/** Species frequency, damping ratio, maximum root angle, LOD2 aggregate crown-response gain. */
vec4 material_WindTreePrimaryParams;
/** Linear structural compliance applied to the retained GPU primary response. */
float material_WindTreeComplianceGain;
vec4 material_WindInputWeights;
vec4 material_WindStructureWeights;
vec4 material_WindAerodynamicWeights;
vec4 material_WindFoliageWeights;
vec4 material_WindFlutterTuning;
vec4 material_WindLeafBladeParams;
vec4 material_WindLockedDirectionWS;
vec4 material_WindMechanicalBoundsMin;
vec4 material_WindMechanicalBoundsExtent;
vec4 material_WindMechanicalTextureSize;
float material_UVBaseLock;
float material_GrassDistanceFadeEnable;
float material_GrassFadeDistance;
float material_GrassFalloff;

#ifdef MATERIAL_HAS_BASETEXTURE
sampler2D material_BaseTexture;
#endif
#ifdef RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY
sampler2D renderer_ProceduralTreeLeafMask0;
sampler2D renderer_ProceduralTreeLeafMask1;
sampler2D renderer_ProceduralTreeLeafMask2;
sampler2D renderer_ProceduralTreeLeafMask3;
sampler2D renderer_ProceduralTreeLeafMask4;
#endif
#ifdef MATERIAL_HAS_NORMALTEXTURE
sampler2D material_NormalTexture;
#endif
#ifdef MATERIAL_HAS_SMOOTHNESS_TEXTURE
sampler2D material_SmoothnessTexture;
#endif
#ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
sampler2D material_WindMechanicalTransforms;
sampler2D material_WindMechanicalDynamics;
#endif

vec4 sampleVegetationBaseTexture(vec2 materialUv) {
  vec4 baseTexture = vec4(1.0);
  #ifdef MATERIAL_HAS_BASETEXTURE
    baseTexture = texture2DSRGB(material_BaseTexture, materialUv);
  #endif
  return baseTexture;
}

vec4 sampleProceduralTreeLeafMask(vec2 materialUv, float shapeIndex) {
  #ifdef RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY
    if (shapeIndex < 0.5) return texture2DSRGB(renderer_ProceduralTreeLeafMask0, materialUv);
    if (shapeIndex < 1.5) return texture2DSRGB(renderer_ProceduralTreeLeafMask1, materialUv);
    if (shapeIndex < 2.5) return texture2DSRGB(renderer_ProceduralTreeLeafMask2, materialUv);
    if (shapeIndex < 3.5) return texture2DSRGB(renderer_ProceduralTreeLeafMask3, materialUv);
    return texture2DSRGB(renderer_ProceduralTreeLeafMask4, materialUv);
  #else
    return sampleVegetationBaseTexture(materialUv);
  #endif
}

float sampleVegetationAlpha(vec2 materialUv) {
  return sampleVegetationBaseTexture(materialUv).a;
}

void applyVegetationAlphaCutoff(float alpha) {
  if (alpha < material_AlphaCutoff) {
    discard;
  }
}

#endif
