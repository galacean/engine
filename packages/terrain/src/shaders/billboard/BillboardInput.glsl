#ifndef TERRAIN_PROJECT_BILLBOARD_INPUT_INCLUDED
#define TERRAIN_PROJECT_BILLBOARD_INPUT_INCLUDED

vec4 material_BaseColor;
float material_Tiling;
float material_AlphaCutoff;
float material_Smoothness;
float material_NormalScale;
float material_WindForce;
float material_WindWavesScale;
float material_WindFlowDensity;
float material_UVBaseLock;
float material_GrassDistanceFadeEnable;
float material_GrassFadeDistance;
float material_GrassFalloff;

#ifdef MATERIAL_HAS_BASETEXTURE
sampler2D material_BaseTexture;
#endif
#ifdef MATERIAL_HAS_NORMALTEXTURE
sampler2D material_NormalTexture;
#endif
#ifdef MATERIAL_HAS_SMOOTHNESS_TEXTURE
sampler2D material_SmoothnessTexture;
#endif

vec4 sampleBillboardBaseTexture(vec2 materialUv) {
  vec4 baseTexture = vec4(1.0);
  #ifdef MATERIAL_HAS_BASETEXTURE
    baseTexture = texture2DSRGB(material_BaseTexture, materialUv);
  #endif
  return baseTexture;
}

void applyBillboardAlphaCutoff(float alpha) {
  if (alpha < material_AlphaCutoff) {
    discard;
  }
}

#endif
