#ifndef SCREEN_SPACE_REFLECTION_SAMPLE_INCLUDED
#define SCREEN_SPACE_REFLECTION_SAMPLE_INCLUDED

#ifdef CAMERA_ENABLE_SSR
  #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

  highp sampler2D camera_SSRTexture;
  // x: global intensity, y: maxRoughness
  vec2 camera_SSRParams;
  // x: 1/traceW, y: 1/traceH, z: traceW, w: traceH
  vec4 camera_SSRTraceTexelSize;
  float material_ScreenSpaceReflectionIntensity;

  #ifdef CAMERA_SSR_BILATERAL_SAMPLE
    highp sampler2D camera_DepthTexture;
    highp sampler2D camera_DepthNormalsTexture;
  #endif

  vec4 sampleScreenSpaceReflectionRawWithDepth(
    vec4 positionCS,
    vec3 worldNormal,
    float roughness,
    float fragEyeDepth,
    float depthSlope
  ) {
    float ssrScale = camera_SSRParams.x * material_ScreenSpaceReflectionIntensity;
    float maxR = camera_SSRParams.y;
    if (!(ssrScale > 0.0) || roughness >= maxR || positionCS.w <= EPSILON) {
      return vec4(0.0);
    }

    vec2 screenUV = clamp(positionCS.xy / positionCS.w * 0.5 + 0.5, vec2(0.0), vec2(1.0));

    #ifdef CAMERA_SSR_BILATERAL_SAMPLE
      vec2 traceSize = camera_SSRTraceTexelSize.zw;
      vec2 invTraceSize = camera_SSRTraceTexelSize.xy;
      vec2 tracePos = screenUV * traceSize - vec2(0.5);
      vec2 basePixel = floor(tracePos);
      vec2 frac = tracePos - basePixel;
      vec2 maxPixel = traceSize - vec2(1.0);
      float depthTolerance = max(0.02, fragEyeDepth * 0.008) + depthSlope * 2.0;
      float invTol = 1.0 / depthTolerance;

      vec4 ssrAccum = vec4(0.0);
      float weightSum = 0.0;
      for (int y = 0; y < 2; ++y) {
        float wy = y == 0 ? (1.0 - frac.y) : frac.y;
        for (int x = 0; x < 2; ++x) {
          float wx = x == 0 ? (1.0 - frac.x) : frac.x;
          vec2 samplePixel = clamp(basePixel + vec2(float(x), float(y)), vec2(0.0), maxPixel);
          vec2 sampleUV = (samplePixel + vec2(0.5)) * invTraceSize;
          float rawTapDepth = texture2D(camera_DepthTexture, sampleUV).r;
          if (rawTapDepth >= 1.0) {
            continue;
          }
          float tapEyeDepth = remapDepthBufferEyeDepth(rawTapDepth);
          float depthDiff = abs(fragEyeDepth - tapEyeDepth);
          if (depthDiff > depthTolerance * 2.0) {
            continue;
          }
          float depthRatio = depthDiff * invTol;
          float depthWeight = exp(-2.0 * depthRatio * depthRatio);

          vec3 tapNormal;
          float tapRoughness;
          if (!unpackDepthNormals(texture2D(camera_DepthNormalsTexture, sampleUV), tapNormal, tapRoughness) || tapRoughness >= maxR) {
            continue;
          }
          float normalWeight = pow(saturate(dot(worldNormal, tapNormal)), 8.0);
          float w = (wx * wy) * depthWeight * normalWeight;
          if (w > 1e-4) {
            ssrAccum += texture2D(camera_SSRTexture, sampleUV) * w;
            weightSum += w;
          }
        }
      }
      if (weightSum <= 1e-4) {
        return vec4(0.0);
      }
      vec4 ssr = ssrAccum / weightSum;
      ssr *= smoothstep(0.01, 0.1, weightSum);
    #else
      vec4 ssr = texture2D(camera_SSRTexture, screenUV);
    #endif

    #ifdef SSR_PACKED_HDR_REINHARD
      vec3 encRgb = min(ssr.rgb, vec3(253.0 / 255.0));
      ssr.rgb = encRgb / max(vec3(1.0) - encRgb, vec3(2.0 / 255.0));
    #endif

    // Roughness fade near maxRoughness threshold.
    float roughFade = 1.0 - smoothstep(maxR * 0.85, maxR, roughness);
    float alpha = saturate(ssr.a * saturate(ssrScale) * roughFade);
    return vec4(ssr.rgb * (ssrScale * roughFade), alpha);
  }

  void getSSRFragmentDepth(out float eyeDepth, out float depthSlope) {
    eyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
    #ifdef CAMERA_SSR_BILATERAL_SAMPLE
      depthSlope = fwidth(eyeDepth);
    #else
      depthSlope = 0.0;
    #endif
  }

  vec3 evaluateScreenSpaceReflectionWithDepth(
    vec4 positionCS,
    vec3 worldNormal,
    float roughness,
    vec3 envRadiance,
    float fragEyeDepth,
    float depthSlope
  ) {
    vec4 raw = sampleScreenSpaceReflectionRawWithDepth(positionCS, worldNormal, roughness, fragEyeDepth, depthSlope);
    return envRadiance * (1.0 - raw.a) + raw.rgb;
  }
#endif

#endif
