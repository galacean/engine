struct RiverSceneSample {
  vec3 color;
  float eyeDepth;
  float validity;
};

// Four matching depth/color samples emulate UE's depth-constrained gather on WebGL2.
RiverSceneSample riverSampleScene(vec2 uv, float waterEyeDepth, float slopeTolerance) {
  vec2 size = min(vec2(textureSize(camera_DepthTexture, 0)), vec2(textureSize(camera_OpaqueTexture, 0)));
  vec2 texel = 1.0 / max(size, vec2(1.0));
  vec2 safeUv = clamp(uv, texel * 0.5, vec2(1.0) - texel * 0.5);
  vec2 pixel = safeUv * size - 0.5;
  vec2 fraction = fract(pixel);
  vec2 base = (floor(pixel) + 0.5) * texel;
  RiverSceneSample result;
  result.color = vec3(0.0);
  result.eyeDepth = 0.0;
  result.validity = 0.0;
  for (int index = 0; index < 4; index++) {
    float x = mod(float(index), 2.0);
    float y = floor(float(index) * 0.5);
    vec2 coordinate = clamp(base + vec2(x, y) * texel, texel * 0.5, vec2(1.0) - texel * 0.5);
    float deviceDepth = texture2D(camera_DepthTexture, coordinate).r;
    float eyeDepth = remapDepthBufferEyeDepth(deviceDepth);
    float valid = step(0.0, deviceDepth) * (1.0 - step(0.999999, deviceDepth))
      * step(waterEyeDepth, eyeDepth + slopeTolerance);
    float weight = mix(1.0 - fraction.x, fraction.x, x) * mix(1.0 - fraction.y, fraction.y, y) * valid;
    result.color += texture2D(camera_OpaqueTexture, coordinate).rgb * weight;
    result.eyeDepth += eyeDepth * weight;
    result.validity += weight;
  }
  float inverseWeight = 1.0 / max(result.validity, 0.00001);
  result.color *= inverseWeight;
  result.eyeDepth *= inverseWeight;
  return result;
}
