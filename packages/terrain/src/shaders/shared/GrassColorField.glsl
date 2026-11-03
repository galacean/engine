#ifndef TERRAIN_PROJECT_GRASS_COLOR_FIELD_INCLUDED
#define TERRAIN_PROJECT_GRASS_COLOR_FIELD_INCLUDED

#include "shared/SceneSeason.glsl"

#ifdef GRASS_COLOR_FIELD_RENDERER_SOURCE
  sampler2D renderer_GrassColorFieldTexture;
  #ifdef RENDERER_GRASS_SHARED_VISTA
    vec4 renderer_GrassVistaParams;
    #define GRASS_VISTA_SHARED_SOFTNESS renderer_GrassVistaParams.x
    #define GRASS_VISTA_SHARED_CONTRAST renderer_GrassVistaParams.y
    #define GRASS_VISTA_SHARED_MEAN renderer_GrassVistaParams.z
    #define GRASS_VISTA_SHARED_SCALE renderer_GrassVistaParams.w
  #endif
  vec4 renderer_GrassColorFieldTransform;
  vec4 renderer_GrassColorFieldOffset;
  vec4 renderer_GrassColorFieldParams;
  vec4 renderer_GrassColorA;
  vec4 renderer_GrassColorB;
  vec4 renderer_RoadColorFieldA;
  vec4 renderer_RoadColorFieldB;
  vec4 renderer_RoadColorFieldRemap;
  #define ROAD_COLOR_FIELD_A renderer_RoadColorFieldA
  #define ROAD_COLOR_FIELD_B renderer_RoadColorFieldB
  #define ROAD_COLOR_FIELD_REMAP renderer_RoadColorFieldRemap
  vec2 renderer_GrassColorFieldVistaBlend;
  vec4 renderer_GrassColorOverrideA;
  vec4 renderer_GrassColorOverrideB;
  #define GRASS_COLOR_OVERRIDE_A renderer_GrassColorOverrideA.rgb
  #define GRASS_COLOR_OVERRIDE_B renderer_GrassColorOverrideB.rgb
  #define GRASS_COLOR_FIELD_VISTA_BLEND renderer_GrassColorFieldVistaBlend
  #define GRASS_COLOR_FIELD_TEXTURE renderer_GrassColorFieldTexture
  #define GRASS_COLOR_FIELD_ENABLED renderer_GrassColorFieldTransform.x
  #define GRASS_COLOR_FIELD_SCALE renderer_GrassColorFieldTransform.y
  #define GRASS_COLOR_FIELD_ANGLE renderer_GrassColorFieldTransform.z
  #define GRASS_COLOR_FIELD_VISTA_SCALE renderer_GrassColorFieldTransform.w
  #define GRASS_COLOR_FIELD_DETAIL_OFFSET renderer_GrassColorFieldOffset.xy
  #define GRASS_COLOR_FIELD_VISTA_OFFSET renderer_GrassColorFieldOffset.zw
  #define GRASS_COLOR_FIELD_PARAMS renderer_GrassColorFieldParams
  #define GRASS_COLOR_A renderer_GrassColorA
  #define GRASS_COLOR_B renderer_GrassColorB
#else
  sampler2D material_GrassColorFieldTexture;
  #ifdef MATERIAL_GRASS_SHARED_VISTA
    vec4 material_GrassVistaParams;
    #define GRASS_VISTA_SHARED_SOFTNESS material_GrassVistaParams.x
    #define GRASS_VISTA_SHARED_CONTRAST material_GrassVistaParams.y
    #define GRASS_VISTA_SHARED_MEAN material_GrassVistaParams.z
    #define GRASS_VISTA_SHARED_SCALE material_GrassVistaParams.w
  #endif
  vec4 material_GrassColorFieldTransform;
  vec4 material_GrassColorFieldOffset;
  vec4 material_GrassColorA;
  vec4 material_GrassColorB;
  vec4 material_RoadColorFieldA;
  vec4 material_RoadColorFieldB;
  vec4 material_RoadColorFieldRemap;
  #define ROAD_COLOR_FIELD_A material_RoadColorFieldA
  #define ROAD_COLOR_FIELD_B material_RoadColorFieldB
  #define ROAD_COLOR_FIELD_REMAP material_RoadColorFieldRemap
  vec4 material_GrassColorFieldParams;
  vec2 material_GrassColorFieldVistaBlend;
  vec4 material_GrassColorOverrideA;
  vec4 material_GrassColorOverrideB;
  #define GRASS_COLOR_OVERRIDE_A material_GrassColorOverrideA.rgb
  #define GRASS_COLOR_OVERRIDE_B material_GrassColorOverrideB.rgb
  #define GRASS_COLOR_FIELD_VISTA_BLEND material_GrassColorFieldVistaBlend
  #define GRASS_COLOR_FIELD_TEXTURE material_GrassColorFieldTexture
  #define GRASS_COLOR_FIELD_ENABLED material_GrassColorFieldTransform.x
  #define GRASS_COLOR_FIELD_SCALE material_GrassColorFieldTransform.y
  #define GRASS_COLOR_FIELD_ANGLE material_GrassColorFieldTransform.z
  #define GRASS_COLOR_FIELD_VISTA_SCALE material_GrassColorFieldTransform.w
  #define GRASS_COLOR_FIELD_DETAIL_OFFSET material_GrassColorFieldOffset.xy
  #define GRASS_COLOR_FIELD_VISTA_OFFSET material_GrassColorFieldOffset.zw
  #define GRASS_COLOR_FIELD_PARAMS material_GrassColorFieldParams
  #define GRASS_COLOR_A material_GrassColorA
  #define GRASS_COLOR_B material_GrassColorB
#endif

#if defined(GRASS_COLOR_FIELD_RENDERER_SOURCE) && defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
  #define GRASS_COLOR_FIELD_PREPARED
  vec4 renderer_GrassColorFieldPrepared;
  vec4 renderer_GrassColorPreparedA;
  vec4 renderer_GrassColorPreparedB;
  #define GRASS_FIELD_PREPARED renderer_GrassColorFieldPrepared
  #define GRASS_PREPARED_A renderer_GrassColorPreparedA
  #define GRASS_PREPARED_B renderer_GrassColorPreparedB
#elif defined(MATERIAL_TERRAIN_SEED_FIXED_LAYERS) || defined(MATERIAL_GRASS_SHARED_COLOR_FIELD)
  #define GRASS_COLOR_FIELD_PREPARED
  vec4 material_GrassColorFieldPrepared;
  vec4 material_GrassColorPreparedA;
  vec4 material_GrassColorPreparedB;
  #define GRASS_FIELD_PREPARED material_GrassColorFieldPrepared
  #define GRASS_PREPARED_A material_GrassColorPreparedA
  #define GRASS_PREPARED_B material_GrassColorPreparedB
#endif

vec2 grassColorFieldRotateUv(vec2 value, vec2 cosineSine) {
  return vec2(
    cosineSine.x * value.x + cosineSine.y * value.y,
    cosineSine.x * value.y - cosineSine.y * value.x
  );
}

float grassColorFieldMaximumLod() {
  ivec2 baseSize = textureSize(GRASS_COLOR_FIELD_TEXTURE, 0);
  return floor(log2(float(max(baseSize.x, baseSize.y))));
}

float grassColorFieldSoftnessLod() {
  float textureResolution = float(textureSize(GRASS_COLOR_FIELD_TEXTURE, 0).x);
  float softnessMetres = max(GRASS_COLOR_FIELD_PARAMS.x, 0.0);
  float softnessLod = max(log2(max(softnessMetres * GRASS_COLOR_FIELD_SCALE * textureResolution, 1.0)), 0.0);
  return min(softnessLod, grassColorFieldMaximumLod());
}

vec2 grassColorFieldMirrorUv(vec2 uv) {
  return vec2(1.0) - abs(mod(uv, vec2(2.0)) - vec2(1.0));
}

vec2 grassColorFieldDetailUv(vec2 worldXZ) {
  #ifdef GRASS_COLOR_FIELD_PREPARED
    vec2 cosineSine = GRASS_FIELD_PREPARED.xy;
  #else
    vec2 cosineSine = vec2(cos(GRASS_COLOR_FIELD_ANGLE), sin(GRASS_COLOR_FIELD_ANGLE));
  #endif
  return grassColorFieldMirrorUv(
    grassColorFieldRotateUv(
      worldXZ * GRASS_COLOR_FIELD_SCALE + GRASS_COLOR_FIELD_DETAIL_OFFSET,
      cosineSine
    )
  );
}

vec2 grassColorFieldVistaUv(vec2 worldXZ) {
  #ifdef GRASS_VISTA_SHARED_SCALE
    return grassColorFieldMirrorUv(worldXZ * GRASS_VISTA_SHARED_SCALE + GRASS_COLOR_FIELD_VISTA_OFFSET);
  #else
  return clamp(
    worldXZ * GRASS_COLOR_FIELD_VISTA_SCALE + GRASS_COLOR_FIELD_VISTA_OFFSET,
    vec2(0.0),
    vec2(1.0)
  );
  #endif
}

float decodeGrassColorField(float field) {
  #ifdef GRASS_COLOR_FIELD_PREPARED
    return clamp((field - GRASS_COLOR_FIELD_PARAMS.y) * GRASS_FIELD_PREPARED.z, 0.0, 1.0);
  #else
  float remapRange = max(GRASS_COLOR_FIELD_PARAMS.z - GRASS_COLOR_FIELD_PARAMS.y, 0.00001);
  return clamp((field - GRASS_COLOR_FIELD_PARAMS.y) / remapRange, 0.0, 1.0);
  #endif
}

float sampleGrassColorFieldAtLod(vec2 worldXZ, float lod) {
  if (GRASS_COLOR_FIELD_ENABLED < 0.5) return 0.5;
  float field = textureLod(GRASS_COLOR_FIELD_TEXTURE, grassColorFieldDetailUv(worldXZ), lod).r;
  return decodeGrassColorField(field);
}

float sampleGrassColorField(vec2 worldXZ) {
  if (GRASS_COLOR_FIELD_ENABLED < 0.5) return 0.5;
  // Zero softness leaves minification filtering to the GPU's implicit mip selection.
  if (GRASS_COLOR_FIELD_PARAMS.x <= 0.0) {
    return decodeGrassColorField(texture2D(GRASS_COLOR_FIELD_TEXTURE, grassColorFieldDetailUv(worldXZ)).r);
  }
  return sampleGrassColorFieldAtLod(worldXZ, grassColorFieldSoftnessLod());
}

float sampleGrassVistaColorField(vec2 worldXZ) {
  if (GRASS_COLOR_FIELD_ENABLED < 0.5) return 0.5;
  #ifdef GRASS_VISTA_SHARED_SOFTNESS
    float field;
    if (GRASS_VISTA_SHARED_SOFTNESS <= 0.0) {
      field = texture2D(GRASS_COLOR_FIELD_TEXTURE, grassColorFieldVistaUv(worldXZ)).r;
    } else {
      float resolution = float(textureSize(GRASS_COLOR_FIELD_TEXTURE, 0).x);
      float footprint = max(GRASS_VISTA_SHARED_SOFTNESS * GRASS_VISTA_SHARED_SCALE * resolution, 1.0);
      float lod = min(log2(footprint), grassColorFieldMaximumLod());
      field = textureLod(GRASS_COLOR_FIELD_TEXTURE, grassColorFieldVistaUv(worldXZ), lod).r;
    }
    field = clamp((field - GRASS_VISTA_SHARED_MEAN) * max(GRASS_VISTA_SHARED_CONTRAST, 1.0) + GRASS_VISTA_SHARED_MEAN, 0.0, 1.0);
  #else
    float field = texture(GRASS_COLOR_FIELD_TEXTURE, grassColorFieldVistaUv(worldXZ)).g;
  #endif
  return decodeGrassColorField(field);
}

float grassColorFieldVistaBlendWeight(vec3 worldPosition) {
  return smoothstep(
    GRASS_COLOR_FIELD_VISTA_BLEND.x,
    GRASS_COLOR_FIELD_VISTA_BLEND.y,
    distance(camera_Position, worldPosition)
  );
}

vec3 grassRgbToHsv(vec3 color) {
  vec4 k = vec4(0.0, -0.3333333333, 0.6666666667, -1.0);
  vec4 p = mix(vec4(color.bg, k.wz), vec4(color.gb, k.xy), step(color.b, color.g));
  vec4 q = mix(vec4(p.xyw, color.r), vec4(color.r, p.yzx), step(p.x, color.r));
  float delta = q.x - min(q.w, q.y);
  float epsilon = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)), delta / (q.x + epsilon), q.x);
}

vec3 grassHsvToRgb(vec3 color) {
  vec3 p = abs(fract(color.xxx + vec3(0.0, 0.6666666667, 0.3333333333)) * 6.0 - 3.0);
  return color.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), color.y);
}

vec3 grassSaturatePaletteEndpoint(vec3 color) {
  vec3 hsv = grassRgbToHsv(color);
  hsv.y = clamp(hsv.y * GRASS_COLOR_FIELD_PARAMS.w, 0.0, 1.0);
  return grassHsvToRgb(hsv);
}

vec3 grassColorFromField(float field) {
  // Transform each endpoint first, then interpolate. This keeps colour affine in the scalar
  // field, so the prefiltered Vista channel is the actual average of the near palette.
  #ifdef GRASS_COLOR_FIELD_PREPARED
    vec3 colorA = GRASS_PREPARED_A.rgb;
    vec3 colorB = GRASS_PREPARED_B.rgb;
  #else
  vec3 colorA = grassSaturatePaletteEndpoint(GRASS_COLOR_A.rgb);
  vec3 colorB = grassSaturatePaletteEndpoint(GRASS_COLOR_B.rgb);
  #endif
  // Season is linear in RGB. Resolve each endpoint's inheritance before affine field interpolation.
  colorA = terrainProjectApplyAuthoredSeasonColor(colorA, TERRAIN_PROJECT_SEASON_SPECIES_GRASS, GRASS_COLOR_OVERRIDE_A);
  colorB = terrainProjectApplyAuthoredSeasonColor(colorB, TERRAIN_PROJECT_SEASON_SPECIES_GRASS, GRASS_COLOR_OVERRIDE_B);
  return mix(colorA, colorB, field);
}

vec3 evaluateGrassBaseColor(vec2 worldXZ) {
  return grassColorFromField(sampleGrassColorField(worldXZ));
}

vec3 evaluateGrassFarBaseColor(vec2 worldXZ) {
  return grassColorFromField(sampleGrassVistaColorField(worldXZ));
}

vec3 roadColorFromField(float field, vec3 nativeColor) {
  return mix(nativeColor, mix(ROAD_COLOR_FIELD_A.rgb, ROAD_COLOR_FIELD_B.rgb, field), ROAD_COLOR_FIELD_A.a);
}

vec3 roadDetailColorFromField(float field, vec3 nativeColor, float vistaWeight) {
  // Remap only the road palette. Fade to the existing low-frequency field at distance.
  float contrast = max(ROAD_COLOR_FIELD_REMAP.x, 1.0);
  float midpoint = ROAD_COLOR_FIELD_REMAP.x > 0.0 ? ROAD_COLOR_FIELD_REMAP.y : 0.5;
  float detail = clamp((field - midpoint) * contrast + 0.5, 0.0, 1.0);
  return roadColorFromField(mix(detail, field, vistaWeight), nativeColor);
}

vec3 evaluateRoadFarBaseColor(vec2 worldXZ, vec3 nativeColor) {
  return roadColorFromField(sampleGrassVistaColorField(worldXZ), nativeColor);
}

#undef ROAD_COLOR_FIELD_REMAP
#undef GRASS_COLOR_FIELD_PREPARED
#undef GRASS_COLOR_OVERRIDE_A
#undef GRASS_COLOR_OVERRIDE_B
#undef GRASS_FIELD_PREPARED
#undef GRASS_PREPARED_A
#undef GRASS_PREPARED_B
#undef GRASS_VISTA_SHARED_SOFTNESS
#undef GRASS_VISTA_SHARED_CONTRAST
#undef GRASS_VISTA_SHARED_MEAN
#undef GRASS_VISTA_SHARED_SCALE
#undef GRASS_COLOR_FIELD_TEXTURE
#undef GRASS_COLOR_FIELD_ENABLED
#undef GRASS_COLOR_FIELD_SCALE
#undef GRASS_COLOR_FIELD_ANGLE
#undef GRASS_COLOR_FIELD_VISTA_SCALE
#undef GRASS_COLOR_FIELD_DETAIL_OFFSET
#undef GRASS_COLOR_FIELD_VISTA_OFFSET
#undef GRASS_COLOR_FIELD_PARAMS
#undef GRASS_COLOR_A
#undef GRASS_COLOR_B
#undef GRASS_COLOR_FIELD_VISTA_BLEND
#undef ROAD_COLOR_FIELD_A
#undef ROAD_COLOR_FIELD_B

#endif
