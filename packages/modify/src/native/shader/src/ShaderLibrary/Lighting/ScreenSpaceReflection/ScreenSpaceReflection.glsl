#ifndef SCREEN_SPACE_REFLECTION_INCLUDED
#define SCREEN_SPACE_REFLECTION_INCLUDED

vec2 encodeScreenSpaceReflectionNormal(vec3 normal) {
  normal /= max(abs(normal.x) + abs(normal.y) + abs(normal.z), EPSILON);
  vec2 encoded = normal.xy;
  if (normal.z < 0.0) {
    encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x >= 0.0 ? 1.0 : -1.0, encoded.y >= 0.0 ? 1.0 : -1.0);
  }
  return encoded * 0.5 + 0.5;
}

vec3 decodeScreenSpaceReflectionNormal(vec2 encoded) {
  vec2 f = encoded * 2.0 - 1.0;
  vec3 normal = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (normal.z < 0.0) {
    normal.xy = (1.0 - abs(normal.yx)) * vec2(normal.x >= 0.0 ? 1.0 : -1.0, normal.y >= 0.0 ? 1.0 : -1.0);
  }
  return normalize(normal);
}

// RG stores an oct8 world-space normal. Camera rotation must not move a static
// surface across quantization bins; B/A retain roughness and response weight.
vec4 packScreenSpaceReflectionSurface(vec3 worldNormal, float roughness, float responseWeight) {
  return vec4(encodeScreenSpaceReflectionNormal(normalize(worldNormal)), saturate(roughness), saturate(responseWeight));
}

vec3 decodeScreenSpaceReflectionViewNormal(vec2 encoded) {
  return normalize(mat3(camera_ViewMat) * decodeScreenSpaceReflectionNormal(encoded));
}

vec3 reconstructScreenSpaceReflectionViewPositionFromEyeDepth(vec2 uv, float eyeDepth) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(
    ndc.x * eyeDepth / camera_ProjMat[0][0],
    ndc.y * eyeDepth / camera_ProjMat[1][1],
    -eyeDepth
  );
}

vec3 reconstructScreenSpaceReflectionViewPosition(vec2 uv, float rawDepth) {
  return reconstructScreenSpaceReflectionViewPositionFromEyeDepth(uv, remapDepthBufferEyeDepth(rawDepth));
}

vec2 unpackScreenSpaceReflectionOrigin(vec4 packedOrigin) {
  vec4 bytes = floor(packedOrigin * 255.0 + 0.5);
  return vec2(bytes.x * 256.0 + bytes.y, bytes.z * 256.0 + bytes.w) / 65535.0;
}

float evaluateScreenSpaceReflectionBilateralWeight(
  vec3 currentViewPosition,
  vec3 currentNormal,
  float currentEyeDepth,
  float currentRoughness,
  vec4 packedOrigin,
  highp sampler2D surfaceTexture,
  highp sampler2D receiverDepthTexture,
  float thickness
) {
  if (dot(packedOrigin, packedOrigin) <= 0.0) return 0.0;
  vec2 originUV = unpackScreenSpaceReflectionOrigin(packedOrigin);
  vec4 originSurface = texture2D(surfaceTexture, originUV);
  float originDepth = texture2D(receiverDepthTexture, originUV).r;
  if (originSurface.a <= 0.0 || originDepth >= 0.999999) return 0.0;

  float originEyeDepth = remapDepthBufferEyeDepth(originDepth);
  vec3 originViewPosition = reconstructScreenSpaceReflectionViewPositionFromEyeDepth(originUV, originEyeDepth);
  vec3 originNormal = decodeScreenSpaceReflectionViewNormal(originSurface.rg);
  vec3 originOffset = originViewPosition - currentViewPosition;
  // Eye depth is not a surface-distance metric: on a grazing plane, two
  // adjacent screen rows can be metres apart along the plane while still
  // representing the same receiver. Measure the symmetric distance to
  // both local tangent planes so slope does not become a 2x2 row mask,
  // while parallel layers and real depth discontinuities remain rejected.
  float planeDistance = max(
    abs(dot(originOffset, currentNormal)),
    abs(dot(originOffset, originNormal))
  );
  float planeTolerance = max(
    thickness,
    max(currentEyeDepth, originEyeDepth) * 0.01
  );
  // Keep the compatibility kernel bounded. Its absolute magnitude is
  // also reconstruction confidence: an unrelated low-resolution origin
  // must fade to the Environment/IBL fallback instead of becoming valid
  // merely because the neighborhood weights were normalized.
  float planeRatio = planeDistance / max(planeTolerance, EPSILON);
  float planeWeight = (1.0 / (1.0 + planeRatio * planeRatio)) *
    (1.0 - smoothstep(1.0, 2.0, planeRatio));
  float normalAgreement = saturate(dot(currentNormal, originNormal));
  float normalWeight = pow(normalAgreement, 8.0);
  float roughnessRatio = abs(currentRoughness - originSurface.b) / 0.1;
  float roughnessWeight = 1.0 / (1.0 + roughnessRatio * roughnessRatio);
  return planeWeight * normalWeight * roughnessWeight;
}

vec4 sampleScreenSpaceReflectionBilateralTrace(
  vec2 uv,
  float currentRoughness,
  vec3 currentViewPosition,
  vec3 currentNormal,
  float currentEyeDepth,
  highp sampler2D surfaceTexture,
  highp sampler2D receiverDepthTexture,
  highp sampler2D traceTexture,
  highp sampler2D traceOriginTexture,
  vec4 traceTexelSize,
  float thickness
) {
  vec2 tracePosition = uv * traceTexelSize.zw - vec2(0.5);
  vec2 baseTracePixel = floor(tracePosition);
  vec2 fraction = fract(tracePosition);
  vec4 accumulatedTrace = vec4(0.0);
  float accumulatedWeight = 0.0;

  for (int y = 0; y < 2; ++y) {
    for (int x = 0; x < 2; ++x) {
      vec2 offset = vec2(float(x), float(y));
      vec2 tracePixel = clamp(
        baseTracePixel + offset,
        vec2(0.0),
        traceTexelSize.zw - vec2(1.0)
      );
      vec2 traceUV = (tracePixel + vec2(0.5)) * traceTexelSize.xy;
      vec2 axisWeight = mix(vec2(1.0) - fraction, fraction, offset);
      float spatialWeight = axisWeight.x * axisWeight.y;
      vec4 packedOrigin = texture2D(traceOriginTexture, traceUV);
      float bilateralWeight = evaluateScreenSpaceReflectionBilateralWeight(
        currentViewPosition,
        currentNormal,
        currentEyeDepth,
        currentRoughness,
        packedOrigin,
        surfaceTexture,
        receiverDepthTexture,
        thickness
      );
      float weight = spatialWeight * bilateralWeight;
      accumulatedTrace += texture2D(traceTexture, traceUV) * weight;
      accumulatedWeight += weight;
    }
  }

  // Normalize related neighbors so receiver phase does not become
  // visible brightness modulation. Preserve fail-closed behavior with a
  // support gate: a weak or isolated incompatible tap still resolves to
  // transparent and lets the receiver keep Environment/IBL.
  float reconstructionSupport = smoothstep(0.05, 0.2, accumulatedWeight);
  return accumulatedTrace / max(accumulatedWeight, EPSILON) * reconstructionSupport;
}

#endif
