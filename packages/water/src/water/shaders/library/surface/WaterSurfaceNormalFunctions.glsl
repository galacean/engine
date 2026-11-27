#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif
