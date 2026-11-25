#ifndef VOLUMETRIC_LIGHT_INCLUDED
#define VOLUMETRIC_LIGHT_INCLUDED

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;
highp sampler2D material_VolumetricLightDepthTexture;
// x: sunU, y: sunV, z: density, w: decay
vec4 material_VolumetricLightParams0;
// x: skyThreshold, y: hasDepth, z: aspectRatio, w: postExposure
vec4 material_VolumetricLightParams1;
// rgb: linear tint, a: effectiveStrength
vec4 material_VolumetricLightTint;

float vlLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Interleaved Gradient Noise (Jimenez 2014): breaks radial stair-stepping into smooth rays.
float vlIgn(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Viewport-aware march span so rays never waste taps off-screen when the sun is overhead.
float vlMarchSpan(vec2 uv, vec2 toSun, float density) {
  vec2 safeDir = vec2(
    abs(toSun.x) < 1e-5 ? 1e-5 : toSun.x,
    abs(toSun.y) < 1e-5 ? 1e-5 : toSun.y
  );
  vec2 tMin = (vec2(-0.04) - uv) / safeDir;
  vec2 tMax = (vec2(1.04) - uv) / safeDir;
  vec2 tFar = max(tMin, tMax);
  float tBox = clamp(min(tFar.x, tFar.y), 0.18, 1.0);
  // Bound screen-space travel length to <= 0.72 so long diagonal rays stay finely sampled without banding.
  float rayLen = length(toSun);
  float maxByLen = 0.72 / max(rayLen, 1e-4);
  return min(tBox, maxByLen) * density;
}

vec3 sampleVolumetricSkyEmitter(vec2 uv, float skyThreshold, float hasDepth, float postExposure) {
  // Gentle viewport margin prevents abrupt pop when sky gaps slide past the frame border.
  float validX = smoothstep(-0.08, 0.015, uv.x) * (1.0 - smoothstep(0.985, 1.08, uv.x));
  float validY = smoothstep(-0.10, 0.015, uv.y) * (1.0 - smoothstep(0.985, 1.08, uv.y));
  float valid = validX * validY;
  vec2 clamped = clamp(uv, vec2(0.002), vec2(0.998));

  // Compress HDR linear radiance smoothly so ultra-bright solar disk pixels do not produce fireflies
  // in the low-res scatter buffer while preserving blue sky gaps and silver-lining cloud rims.
  vec3 rawCol = max(texture2D(renderer_BlitTexture, clamped).rgb * postExposure, vec3(0.0));
  vec3 col = rawCol / (vec3(1.0) + rawCol * 0.45);
  float luma = vlLuma(col);
  // Evaluate sky-gap emission threshold in perceptual (gamma-like) brightness because renderer_BlitTexture
  // is linear HDR inside PostProcessUberPass (clear daytime blue sky is ~0.22-0.30 linear, ~0.50 perceptual).
  float percepLuma = sqrt(max(luma, 0.0));

  float mask = 0.0;
  if (hasDepth > 0.5) {
    float d = texture2D(material_VolumetricLightDepthTexture, clamped).r;
    float isSky = smoothstep(skyThreshold, min(0.99998, skyThreshold + 0.00025), d);
    // Volumetric clouds do not write depth (d == 1.0). Attenuate thick low-saturation cloud cores
    // while preserving clear blue-sky gaps and bright sun/silver-lining cloud rims.
    float maxC = max(col.r, max(col.g, col.b));
    float minC = min(col.r, min(col.g, col.b));
    float sat = (maxC - minC) / max(maxC, 1e-4);
    float cloudCoreAtten = mix(0.28, 1.0, max(smoothstep(0.10, 0.30, sat), smoothstep(0.88, 1.25, percepLuma)));
    float skyEmit = isSky * cloudCoreAtten;
    float thinCanopy = smoothstep(0.76, 1.15, percepLuma) * 0.16;
    mask = max(skyEmit, thinCanopy) * smoothstep(0.14, 0.52, percepLuma);
  } else {
    mask = smoothstep(0.55, 0.95, percepLuma);
  }
  return mix(material_VolumetricLightTint.rgb, col * material_VolumetricLightTint.rgb * 1.18, 0.28) * mask * valid;
}

void fragVolumetricCoarse(Varyings v) {
  vec2 sunUv = material_VolumetricLightParams0.xy;
  float density = material_VolumetricLightParams0.z;
  float decay = material_VolumetricLightParams0.w;
  float skyThreshold = material_VolumetricLightParams1.x;
  float hasDepth = material_VolumetricLightParams1.y;
  float postExposure = max(material_VolumetricLightParams1.w, 1e-4);

  vec2 toSun = sunUv - v.v_uv;
  float span = vlMarchSpan(v.v_uv, toSun, density);
  vec2 delta = toSun * (span / 8.0);
  float jitter = vlIgn(gl_FragCoord.xy);
  vec2 sampleUv = v.v_uv + delta * jitter;
  vec3 accum = vec3(0.0);
  float weight = 1.0;
  float weightSum = 0.0;

  for (int i = 0; i < 8; i++) {
    accum += sampleVolumetricSkyEmitter(sampleUv, skyThreshold, hasDepth, postExposure) * weight;
    weightSum += weight;
    sampleUv += delta;
    weight *= decay;
  }
  gl_FragColor = vec4(accum / max(weightSum, 1e-4), 1.0);
}

void fragVolumetricFine(Varyings v) {
  vec2 sunUv = material_VolumetricLightParams0.xy;
  float density = material_VolumetricLightParams0.z;
  float decay = pow(material_VolumetricLightParams0.w, 0.18);

  vec2 toSun = sunUv - v.v_uv;
  float span = vlMarchSpan(v.v_uv, toSun, density);
  // Cascade stride = 1/64 of total ray span (fills gaps between the 8 jittered coarse taps cleanly).
  vec2 delta = toSun * (span / 64.0);
  vec2 dirNorm = normalize(toSun + vec2(1e-5, 0.0));
  vec2 perp = vec2(-dirNorm.y, dirNorm.x) * renderer_texelSize.xy * 0.65;
  float jitter = vlIgn(gl_FragCoord.xy + vec2(19.7, 37.3));
  vec2 sampleUv = v.v_uv + delta * jitter;
  vec3 accum = vec3(0.0);
  float weight = 1.0;
  float weightSum = 0.0;

  float perpSign = 1.0;
  for (int i = 0; i < 8; i++) {
    vec2 uvA = clamp(sampleUv + perp * perpSign, vec2(0.002), vec2(0.998));
    accum += texture2D(renderer_BlitTexture, uvA).rgb * weight;
    weightSum += weight;
    sampleUv += delta;
    weight *= decay;
    perpSign = -perpSign;
  }
  gl_FragColor = vec4(accum / max(weightSum, 1e-4), 1.0);
}

#endif
