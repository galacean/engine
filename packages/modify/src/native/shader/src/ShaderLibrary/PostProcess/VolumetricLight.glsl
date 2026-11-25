#ifndef VOLUMETRIC_LIGHT_INCLUDED
#define VOLUMETRIC_LIGHT_INCLUDED

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

highp sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;
vec4 renderer_SourceScaleOffset;
highp sampler2D material_VolumetricLightDepthTexture;
// x: sunU, y: sunV, z: density, w: decay
vec4 material_VolumetricLightParams0;
// x: skyThreshold, y: hasDepth, z: aspectRatio, w: postExposure
vec4 material_VolumetricLightParams1;
// rgb: linear tint, a: effectiveStrength
vec4 material_VolumetricLightTint;

// 3D Shadow-Map Raymarch uniforms (Medium / High)
mat4 camera_ViewInvMat;
vec3 camera_Position;
#ifdef SCENE_SHADOW_TYPE
  mat4 scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT + 1];
  vec4 scene_ShadowSplitSpheres[4];
  mediump sampler2DShadow scene_ShadowMap;
#endif
// x: invProjX, y: invProjY, z: maxDistance, w: anisotropy
vec4 material_VolumetricLightRaymarchParams0;
// x: extinction, y: heightFalloff, z: baseHeight, w: unused
vec4 material_VolumetricLightRaymarchParams1;
// xyz: normalized dirToSun, w: unused
vec4 material_VolumetricLightSunDir;
float material_VolumetricLightBilateralSharpness;

#if defined(VOLUMETRIC_LIGHT_QUALITY) && VOLUMETRIC_LIGHT_QUALITY == 2
  #define VL_RAYMARCH_STEPS 32
#else
  #define VL_RAYMARCH_STEPS 16
#endif

float vlLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
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
  float rayLen = length(toSun);
  float maxByLen = 0.72 / max(rayLen, 1e-4);
  return min(tBox, maxByLen) * density;
}

// Cornette-Shanks phase function (Unity Core VolumeRendering.hlsl standard):
// Smoothly unifies Mie forward scatter and Rayleigh lobe with exact 1/(4*PI) sphere normalization.
float vlCornetteShanks(float cosTheta, float g) {
  float g2 = g * g;
  float num = 3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
  float denom = 8.0 * PI * (2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.04), 1.5);
  return num / denom;
}

// ============================================================================
// Low Quality (UE PostProcessMobile 3-Pass <=270p R11G11B10F):
// Pass 0: 1-tap sequential downsample + HDR sky luminance contrast extract -> RT A
// Pass 1: 8-tap coarse radial scatter strictly inside <=270p RT -> RT B
// Pass 2: 8-tap fine cascaded radial scatter (64-step equivalent) -> RT A
// ============================================================================
void fragVolumetricLowExtract(Varyings v) {
  float skyThreshold = material_VolumetricLightParams1.x;
  float hasDepth = material_VolumetricLightParams1.y;
  float postExposure = max(material_VolumetricLightParams1.w, 1e-4);

  vec3 rawCol = max(texture2D(renderer_BlitTexture, v.v_uv).rgb * postExposure, vec3(0.0));
  vec3 col = rawCol / (vec3(1.0) + rawCol * 0.25);
  float luma = vlLuma(col);

  vec3 emitter = vec3(0.0);
  if (hasDepth > 0.5) {
    float depth = texture2D(material_VolumetricLightDepthTexture, v.v_uv).r;
    float isSky = smoothstep(skyThreshold, min(0.99998, skyThreshold + 0.00025), depth);
    float skyRadiance = smoothstep(0.08, 0.28, luma) * min(luma * 2.2, 2.2);
    vec3 skyChroma = col / max(luma, 1e-4);
    emitter = mix(vec3(1.0), min(skyChroma, vec3(1.5)), 0.35) * (isSky * skyRadiance);
  } else {
    float excess = max(luma - 0.65, 0.0);
    emitter = col * (excess / max(luma, 1e-4));
  }

  gl_FragColor = vec4(emitter * material_VolumetricLightTint.rgb, 1.0);
}

void fragVolumetricLowCoarse(Varyings v) {
  vec2 sunUv = material_VolumetricLightParams0.xy;
  float density = material_VolumetricLightParams0.z;
  float decay = material_VolumetricLightParams0.w;

  vec2 toSun = sunUv - v.v_uv;
  float span = vlMarchSpan(v.v_uv, toSun, density);
  vec2 delta = toSun * (span / 8.0);
  float jitter = interleavedGradientNoise(gl_FragCoord.xy);
  vec2 sampleUv = v.v_uv + delta * jitter;

  vec3 accum = vec3(0.0);
  float weight = 1.0;
  float weightSum = 0.0;

  for (int i = 0; i < 8; i++) {
    float validX = smoothstep(-0.06, 0.015, sampleUv.x) * (1.0 - smoothstep(0.985, 1.06, sampleUv.x));
    float validY = smoothstep(-0.08, 0.015, sampleUv.y) * (1.0 - smoothstep(0.985, 1.08, sampleUv.y));
    vec2 clampedUv = clamp(sampleUv, vec2(0.002), vec2(0.998));
    accum += texture2D(renderer_BlitTexture, clampedUv).rgb * (weight * validX * validY);
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
  vec2 delta = toSun * (span / 64.0);
  vec2 dirNorm = normalize(toSun + vec2(1e-5, 0.0));
  vec2 perp = vec2(-dirNorm.y, dirNorm.x) * renderer_texelSize.xy * 0.65;
  float jitter = interleavedGradientNoise(gl_FragCoord.xy + vec2(19.7, 37.3));
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

// ============================================================================
// Medium / High Quality (3D Shadow-Map Raymarching + Separable Bilateral Blur):
// Pass 3: 3D Shadow-Map Raymarching -> RG16F (r = scatter, g = linear01Depth)
// Pass 4: Separable Depth-Aware Gaussian Bilateral Blur (H & V)
// ============================================================================
#ifdef SCENE_SHADOW_TYPE
mediump int vlComputeCascadeIndex(vec3 positionWS) {
  vec3 fromCenter0 = positionWS - scene_ShadowSplitSpheres[0].xyz;
  vec3 fromCenter1 = positionWS - scene_ShadowSplitSpheres[1].xyz;
  vec3 fromCenter2 = positionWS - scene_ShadowSplitSpheres[2].xyz;
  vec3 fromCenter3 = positionWS - scene_ShadowSplitSpheres[3].xyz;

  mediump vec4 comparison = vec4(
    (dot(fromCenter0, fromCenter0) < scene_ShadowSplitSpheres[0].w),
    (dot(fromCenter1, fromCenter1) < scene_ShadowSplitSpheres[1].w),
    (dot(fromCenter2, fromCenter2) < scene_ShadowSplitSpheres[2].w),
    (dot(fromCenter3, fromCenter3) < scene_ShadowSplitSpheres[3].w)
  );
  comparison.yzw = clamp(comparison.yzw - comparison.xyz, 0.0, 1.0);
  mediump vec4 indexCoefficient = vec4(4.0, 3.0, 2.0, 1.0);
  return 4 - int(dot(comparison, indexCoefficient));
}
#endif

void fragVolumetricRaymarch(Varyings v) {
  float rawDepth = texture2D(material_VolumetricLightDepthTexture, v.v_uv).r;
  float linear01 = remapDepthBufferLinear01(rawDepth);
  float eyeDepth = remapDepthBufferEyeDepth(rawDepth);

  // Reconstruct world-space ray from UV (v_uv.y = 0 is top -> ndcY = +1)
  vec2 ndc = vec2(v.v_uv.x * 2.0 - 1.0, 1.0 - v.v_uv.y * 2.0);
  #ifdef CAMERA_ORTHOGRAPHIC
    vec3 viewStart = vec3(ndc.x * material_VolumetricLightRaymarchParams0.x, ndc.y * material_VolumetricLightRaymarchParams0.y, -camera_ProjectionParams.y);
    vec3 viewEnd = vec3(viewStart.xy, -eyeDepth);
    vec3 rayStart = (camera_ViewInvMat * vec4(viewStart, 1.0)).xyz;
    vec3 worldEnd = (camera_ViewInvMat * vec4(viewEnd, 1.0)).xyz;
  #else
    vec3 viewRay = vec3(ndc.x * material_VolumetricLightRaymarchParams0.x, ndc.y * material_VolumetricLightRaymarchParams0.y, -1.0);
    vec3 rayStart = camera_Position;
    vec3 worldEnd = (camera_ViewInvMat * vec4(viewRay * eyeDepth, 1.0)).xyz;
  #endif

  vec3 rayVec = worldEnd - rayStart;
  float sceneDist = length(rayVec);
  vec3 rayDir = rayVec / max(sceneDist, 1e-4);

  float maxDist = material_VolumetricLightRaymarchParams0.z;
  float marchDist = min(sceneDist, maxDist);

  float cosTheta = dot(rayDir, material_VolumetricLightSunDir.xyz);
  float g = material_VolumetricLightRaymarchParams0.w;
  // Physically normalized Cornette-Shanks phase function (exact 1/(4*PI) sphere integral, zero magic scale).
  float phase = vlCornetteShanks(cosTheta, g);

  float extinction = max(material_VolumetricLightRaymarchParams1.x, 0.001);
  #ifdef VOLUMETRIC_LIGHT_HEIGHT_FOG
    float heightFalloff = material_VolumetricLightRaymarchParams1.y;
    float baseHeight = material_VolumetricLightRaymarchParams1.z;
  #endif

  float stepLen = marchDist / float(VL_RAYMARCH_STEPS);
  float jitter = interleavedGradientNoise(gl_FragCoord.xy);
  float t = stepLen * jitter;
  vec3 stepVec = rayDir * stepLen;
  vec3 posWS = rayStart + rayDir * t;

  float accumScatter = 0.0;
  float transmittance = 1.0;

  #ifndef VOLUMETRIC_LIGHT_HEIGHT_FOG
    float constStepTrans = exp(-extinction * stepLen);
    float constStepScatter = 1.0 - constStepTrans;
  #endif

  #ifdef SCENE_SHADOW_TYPE
    #if SCENE_SHADOW_CASCADED_COUNT == 1
      vec3 shadowCoord = (scene_ShadowMatrices[0] * vec4(posWS, 1.0)).xyz;
      vec3 shadowStep = (scene_ShadowMatrices[0] * vec4(stepVec, 0.0)).xyz;
    #else
      int lastCascade = -1;
      vec3 shadowCoord = vec3(0.0);
      vec3 shadowStep = vec3(0.0);
    #endif

    for (int i = 0; i < VL_RAYMARCH_STEPS; i++) {
      float visibility = 0.0;
      #if SCENE_SHADOW_CASCADED_COUNT == 1
        if (shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
          visibility = textureLod(scene_ShadowMap, shadowCoord, 0.0);
        }
        shadowCoord += shadowStep;
      #else
        int cIdx = vlComputeCascadeIndex(posWS);
        if (cIdx < SCENE_SHADOW_CASCADED_COUNT) {
          if (cIdx != lastCascade) {
            lastCascade = cIdx;
            shadowCoord = (scene_ShadowMatrices[cIdx] * vec4(posWS, 1.0)).xyz;
            shadowStep = (scene_ShadowMatrices[cIdx] * vec4(stepVec, 0.0)).xyz;
          }
          if (shadowCoord.z > 0.0 && shadowCoord.z < 1.0) {
            visibility = textureLod(scene_ShadowMap, shadowCoord, 0.0);
          }
          shadowCoord += shadowStep;
        }
      #endif

      float distFade = 1.0 - smoothstep(maxDist * 0.8, maxDist, t);
      #ifdef VOLUMETRIC_LIGHT_HEIGHT_FOG
        float hDensity = exp(-max(posWS.y - baseHeight, 0.0) * heightFalloff);
        float stepTrans = exp(-extinction * hDensity * stepLen);
        float stepScatter = 1.0 - stepTrans;
      #else
        float stepTrans = constStepTrans;
        float stepScatter = constStepScatter;
      #endif

      accumScatter += (visibility * distFade) * stepScatter * transmittance;
      transmittance *= stepTrans;

      posWS += stepVec;
      t += stepLen;
    }
  #endif

  gl_FragColor = vec4(accumScatter * phase, linear01, 0.0, 1.0);
}

void fragVolumetricBilateralBlur(Varyings v) {
  vec2 center = texture2D(renderer_BlitTexture, v.v_uv).rg;
  float invCenterDepth = 1.0 / max(center.g, 1e-4);
  vec2 stepUv = renderer_SourceScaleOffset.zw;
  float sharpness = material_VolumetricLightBilateralSharpness;

  #if defined(VOLUMETRIC_LIGHT_QUALITY) && VOLUMETRIC_LIGHT_QUALITY == 2
    const float w0 = 0.2270;
    const float w1 = 0.1946;
    const float w2 = 0.1216;
    const float w3 = 0.0541;
  #else
    const float w0 = 0.2941;
    const float w1 = 0.2353;
    const float w2 = 0.1176;
  #endif

  float sum = center.r * w0;
  float weightSum = w0;

  // Tap +-1
  vec2 off1 = stepUv;
  vec2 p1 = texture2D(renderer_BlitTexture, clamp(v.v_uv + off1, vec2(0.001), vec2(0.999))).rg;
  float dp1 = abs(p1.g - center.g) * invCenterDepth * sharpness;
  float wp1 = w1 / (1.0 + dp1 * dp1);
  sum += p1.r * wp1;
  weightSum += wp1;

  vec2 n1 = texture2D(renderer_BlitTexture, clamp(v.v_uv - off1, vec2(0.001), vec2(0.999))).rg;
  float dn1 = abs(n1.g - center.g) * invCenterDepth * sharpness;
  float wn1 = w1 / (1.0 + dn1 * dn1);
  sum += n1.r * wn1;
  weightSum += wn1;

  // Tap +-2
  vec2 off2 = stepUv * 2.0;
  vec2 p2 = texture2D(renderer_BlitTexture, clamp(v.v_uv + off2, vec2(0.001), vec2(0.999))).rg;
  float dp2 = abs(p2.g - center.g) * invCenterDepth * sharpness;
  float wp2 = w2 / (1.0 + dp2 * dp2);
  sum += p2.r * wp2;
  weightSum += wp2;

  vec2 n2 = texture2D(renderer_BlitTexture, clamp(v.v_uv - off2, vec2(0.001), vec2(0.999))).rg;
  float dn2 = abs(n2.g - center.g) * invCenterDepth * sharpness;
  float wn2 = w2 / (1.0 + dn2 * dn2);
  sum += n2.r * wn2;
  weightSum += wn2;

  #if defined(VOLUMETRIC_LIGHT_QUALITY) && VOLUMETRIC_LIGHT_QUALITY == 2
    // Tap +-3 (High quality 7-tap kernel)
    vec2 off3 = stepUv * 3.0;
    vec2 p3 = texture2D(renderer_BlitTexture, clamp(v.v_uv + off3, vec2(0.001), vec2(0.999))).rg;
    float dp3 = abs(p3.g - center.g) * invCenterDepth * sharpness;
    float wp3 = w3 / (1.0 + dp3 * dp3);
    sum += p3.r * wp3;
    weightSum += wp3;

    vec2 n3 = texture2D(renderer_BlitTexture, clamp(v.v_uv - off3, vec2(0.001), vec2(0.999))).rg;
    float dn3 = abs(n3.g - center.g) * invCenterDepth * sharpness;
    float wn3 = w3 / (1.0 + dn3 * dn3);
    sum += n3.r * wn3;
    weightSum += wn3;
  #endif

  gl_FragColor = vec4(sum / max(weightSum, 1e-5), center.g, 0.0, 1.0);
}

#endif
