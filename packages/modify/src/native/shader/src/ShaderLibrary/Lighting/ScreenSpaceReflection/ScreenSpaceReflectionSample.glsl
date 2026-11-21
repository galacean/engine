#ifndef SCREEN_SPACE_REFLECTION_SAMPLE_INCLUDED
#define SCREEN_SPACE_REFLECTION_SAMPLE_INCLUDED

#ifdef CAMERA_ENABLE_SSR
  #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"

  highp sampler2D camera_SSRTexture;
  // x: global intensity, y: maxRoughness, z: traceScale, w: farClip
  vec4 camera_SSRParams;
  // x: 1/traceW, y: 1/traceH, z: traceW, w: traceH
  vec4 camera_SSRTraceTexelSize;
  float material_ScreenSpaceReflectionIntensity;

  #if defined(CAMERA_SSR_VERIFY_RECEIVER_DEPTH) || defined(CAMERA_SSR_BILATERAL_SAMPLE)
    highp sampler2D camera_SSRReceiverDepthTexture;
  #endif

  #ifdef CAMERA_SSR_BILATERAL_SAMPLE
    highp sampler2D camera_SSRReceiverNormalRoughnessTexture;
  #endif

  vec3 evaluateScreenSpaceReflectionWithDepth(
    vec4 positionCS,
    vec3 worldNormal,
    float roughness,
    vec3 envRadiance,
    float fragEyeDepth,
    float depthSlope
  ) {
    float ssrScale = max(camera_SSRParams.x, 0.0) * max(material_ScreenSpaceReflectionIntensity, 0.0);
    if (ssrScale <= 0.0 || roughness >= camera_SSRParams.y || positionCS.w <= EPSILON) {
      return envRadiance;
    }

    vec2 screenUV = clamp(positionCS.xy / positionCS.w * 0.5 + 0.5, vec2(0.0), vec2(1.0));
    float farClip = camera_ProjectionParams.z;

    #ifdef CAMERA_SSR_BILATERAL_SAMPLE
      vec2 traceSize = camera_SSRTraceTexelSize.zw;
      vec2 invTraceSize = camera_SSRTraceTexelSize.xy;
      vec2 tracePos = screenUV * traceSize - vec2(0.5);
      vec2 basePixel = floor(tracePos);
      vec2 frac = saturate(tracePos - basePixel);
      vec2 maxPixel = max(traceSize - vec2(1.0), vec2(0.0));
      float depthTolerance = max(0.02, fragEyeDepth * 0.008) + depthSlope * 2.0;
      float invTol = 1.0 / max(depthTolerance, 1e-4);

      vec4 ssrAccum = vec4(0.0);
      float weightSum = 0.0;
      for (int y = 0; y < 2; ++y) {
        float wy = y == 0 ? (1.0 - frac.y) : frac.y;
        for (int x = 0; x < 2; ++x) {
          float wx = x == 0 ? (1.0 - frac.x) : frac.x;
          vec2 samplePixel = clamp(basePixel + vec2(float(x), float(y)), vec2(0.0), maxPixel);
          vec2 sampleUV = (samplePixel + vec2(0.5)) * invTraceSize;
          float tapEyeDepth = decodeSSRDepth(texture2D(camera_SSRReceiverDepthTexture, sampleUV), farClip);
          if (tapEyeDepth <= 0.0) {
            continue;
          }
          float depthDiff = abs(fragEyeDepth - tapEyeDepth);
          if (depthDiff > depthTolerance * 2.0) {
            continue;
          }
          float depthRatio = depthDiff * invTol;
          float depthWeight = exp(-2.0 * depthRatio * depthRatio);

          vec3 tapNormal;
          float tapRoughness;
          if (!unpackSSRNormalRoughness(texture2D(camera_SSRReceiverNormalRoughnessTexture, sampleUV), tapNormal, tapRoughness)) {
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
        return envRadiance;
      }
      vec4 ssr = ssrAccum / weightSum;
      ssr *= smoothstep(0.01, 0.1, weightSum);
    #else
      #ifdef CAMERA_SSR_VERIFY_RECEIVER_DEPTH
        float receiverEyeDepth = decodeSSRDepth(texture2D(camera_SSRReceiverDepthTexture, screenUV), farClip);
        #ifdef SSR_PACKED_DEPTH_RG8
          float depthFloor = max(0.02, farClip * (2.5 / 65535.0));
        #else
          float depthFloor = 0.02;
        #endif
        float depthTolerance = max(depthFloor, receiverEyeDepth * 0.002) + depthSlope * 2.0;
        if (receiverEyeDepth <= 0.0 || abs(fragEyeDepth - receiverEyeDepth) > depthTolerance) {
          return envRadiance;
        }
      #endif
      vec4 ssr = texture2D(camera_SSRTexture, screenUV);
    #endif

    // Roughness fade near maxRoughness threshold.
    float maxR = max(camera_SSRParams.y, 1e-4);
    float roughFade = 1.0 - smoothstep(maxR * 0.85, maxR, roughness);
    float alpha = saturate(ssr.a * saturate(ssrScale) * roughFade);
    return envRadiance * (1.0 - alpha) + ssr.rgb * (ssrScale * roughFade);
  }

  vec3 evaluateScreenSpaceReflection(
    vec4 positionCS,
    vec3 worldNormal,
    float roughness,
    vec3 envRadiance
  ) {
    float fragEyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
    #if (defined(CAMERA_SSR_BILATERAL_SAMPLE) || defined(CAMERA_SSR_VERIFY_RECEIVER_DEPTH)) && defined(HAS_DERIVATIVES)
      float depthSlope = fwidth(fragEyeDepth);
    #else
      float depthSlope = 0.0;
    #endif
    return evaluateScreenSpaceReflectionWithDepth(positionCS, worldNormal, roughness, envRadiance, fragEyeDepth, depthSlope);
  }
#endif

#endif
