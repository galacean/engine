#ifndef TERRAIN_PROJECT_VEGETATION_NOISE_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_NOISE_INCLUDED

#include "ShaderLibrary/Noise/NoiseCommon.glsl"

float terrainProjectVegetationSimplexNoise3D(vec3 value) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 cell = floor(value + dot(value, C.yyy));
  vec3 x0 = value - cell + dot(cell, C.xxx);
  vec3 stepOrder = step(x0.yzx, x0.xyz);
  vec3 inverseOrder = 1.0 - stepOrder;
  vec3 i1 = min(stepOrder.xyz, inverseOrder.zxy);
  vec3 i2 = max(stepOrder.xyz, inverseOrder.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  cell = mod289(cell);
  vec4 p = permute(
    permute(
      permute(cell.z + vec4(0.0, i1.z, i2.z, 1.0)) +
      cell.y + vec4(0.0, i1.y, i2.y, 1.0)
    ) +
    cell.x + vec4(0.0, i1.x, i2.x, 1.0)
  );
  float gradientGridSize = 1.0 / 7.0;
  vec3 gradientScale = gradientGridSize * D.wyz - D.xzx;
  vec4 gradientIndex = p - 49.0 * floor(p * gradientScale.z * gradientScale.z);
  vec4 gradientXIndex = floor(gradientIndex * gradientScale.z);
  vec4 gradientYIndex = floor(gradientIndex - 7.0 * gradientXIndex);
  vec4 gradientX = gradientXIndex * gradientScale.x + gradientScale.yyyy;
  vec4 gradientY = gradientYIndex * gradientScale.x + gradientScale.yyyy;
  vec4 gradientZ = 1.0 - abs(gradientX) - abs(gradientY);
  vec4 gradients01 = vec4(gradientX.xy, gradientY.xy);
  vec4 gradients23 = vec4(gradientX.zw, gradientY.zw);
  vec4 gradientSigns01 = floor(gradients01) * 2.0 + 1.0;
  vec4 gradientSigns23 = floor(gradients23) * 2.0 + 1.0;
  vec4 gradientZStep = -step(gradientZ, vec4(0.0));
  vec4 adjustedGradients01 = gradients01.xzyw + gradientSigns01.xzyw * gradientZStep.xxyy;
  vec4 adjustedGradients23 = gradients23.xzyw + gradientSigns23.xzyw * gradientZStep.zzww;
  vec3 gradient0 = vec3(adjustedGradients01.xy, gradientZ.x);
  vec3 gradient1 = vec3(adjustedGradients01.zw, gradientZ.y);
  vec3 gradient2 = vec3(adjustedGradients23.xy, gradientZ.z);
  vec3 gradient3 = vec3(adjustedGradients23.zw, gradientZ.w);
  vec4 normalization = taylorInvSqrt(
    vec4(
      dot(gradient0, gradient0),
      dot(gradient1, gradient1),
      dot(gradient2, gradient2),
      dot(gradient3, gradient3)
    )
  );
  gradient0 *= normalization.x;
  gradient1 *= normalization.y;
  gradient2 *= normalization.z;
  gradient3 *= normalization.w;
  vec4 attenuation = max(
    0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)),
    0.0
  );
  attenuation *= attenuation;
  return 42.0 * dot(
    attenuation * attenuation,
    vec4(dot(x0, gradient0), dot(x1, gradient1), dot(x2, gradient2), dot(x3, gradient3))
  );
}

vec3 terrainProjectVegetationMod289(vec3 value) {
  return value - floor(value * (1.0 / 289.0)) * 289.0;
}

vec2 terrainProjectVegetationMod289(vec2 value) {
  return value - floor(value * (1.0 / 289.0)) * 289.0;
}

vec3 terrainProjectVegetationPermute(vec3 value) {
  return terrainProjectVegetationMod289(((value * 34.0) + 1.0) * value);
}

float terrainProjectVegetationSimplexNoise2D(vec2 value) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );
  vec2 cell = floor(value + dot(value, C.yy));
  vec2 x0 = value - cell + dot(cell, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  cell = terrainProjectVegetationMod289(cell);
  vec3 p = terrainProjectVegetationPermute(
    terrainProjectVegetationPermute(cell.y + vec3(0.0, i1.y, 1.0)) +
    cell.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 attenuation = max(
    0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    0.0
  );
  attenuation *= attenuation;
  attenuation *= attenuation;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  attenuation *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 gradient;
  gradient.x = a0.x * x0.x + h.x * x0.y;
  gradient.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(attenuation, gradient);
}

#endif
