// Compare every PCF tap against the geometric receiver plane. Cellular lighting
// normals are deliberately excluded: they do not describe the shadow caster.
#if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
mat4 rockShadowMatrix(vec3 positionWS) {
  #if SCENE_SHADOW_CASCADED_COUNT == 1
    return scene_ShadowMatrices[0];
  #else
    int cascadeIndex = computeCascadeIndex(positionWS);
    if (cascadeIndex == 0) return scene_ShadowMatrices[0];
    if (cascadeIndex == 1) return scene_ShadowMatrices[1];
    #if SCENE_SHADOW_CASCADED_COUNT == 4
      if (cascadeIndex == 2) return scene_ShadowMatrices[2];
      if (cascadeIndex == 3) return scene_ShadowMatrices[3];
    #endif
    return scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT];
  #endif
}

float sampleRockShadow(vec3 positionWS) {
  // Different pixels in a derivative quad may select different cascades. Take
  // derivatives BEFORE projection, then use one matrix for this receiver plane.
  vec3 dx = dFdx(positionWS);
  vec3 dy = dFdy(positionWS);
  mat4 shadowMatrix = rockShadowMatrix(positionWS);
  vec3 coord = (shadowMatrix * vec4(positionWS, 1.0)).xyz;
  vec3 plane = cross((shadowMatrix * vec4(dx, 0.0)).xyz, (shadowMatrix * vec4(dy, 0.0)).xyz);
  vec2 gradient = vec2(0.0);
  // Degenerate / light-edge-on faces cannot yield a stable depth gradient.
  if (abs(plane.z) > 0.0001 * length(plane)) gradient = -plane.xy / plane.z;
  // Hardware comparison filtering still covers a 2x2 footprint per tap. Bound
  // that residual and one Depth16 step; avoid unbounded offsets at grazing angles.
  float footprint = dot(abs(gradient), scene_ShadowMapSize.xy);
  gradient *= min(1.0, 0.01 / max(footprint, 0.000001));
  float residual = min(footprint, 0.01) + 1.0 / 65535.0;
  float attenuation = 1.0;
  if (coord.z > 0.0 && coord.z < 1.0) {
    #if SCENE_SHADOW_TYPE == 1
      attenuation = SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(coord.xy, coord.z - residual));
    #endif
    #if SCENE_SHADOW_TYPE == 2
      vec2 offset = scene_ShadowMapSize.xy * 0.5;
      vec2 a = -offset;
      vec2 b = vec2(offset.x, -offset.y);
      vec2 c = vec2(-offset.x, offset.y);
      vec2 d = offset;
      attenuation = 0.25 * (
        SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(coord.xy + a, coord.z + dot(gradient, a) - residual)) +
        SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(coord.xy + b, coord.z + dot(gradient, b) - residual)) +
        SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(coord.xy + c, coord.z + dot(gradient, c) - residual)) +
        SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(coord.xy + d, coord.z + dot(gradient, d) - residual)));
    #endif
    #if SCENE_SHADOW_TYPE == 3
      float weights[9];
      vec2 uv[9];
      sampleShadowComputeSamplesTent5x5(scene_ShadowMapSize, coord.xy, weights, uv);
      attenuation = 0.0;
      for (int i = 0; i < 9; i++) {
        float depth = coord.z + dot(gradient, uv[i] - coord.xy) - residual;
        attenuation += weights[i] * SAMPLE_TEXTURE2D_SHADOW(scene_ShadowMap, vec3(uv[i], depth));
      }
    #endif
    attenuation = mix(1.0, mix(attenuation, 1.0, getShadowFade(positionWS)), scene_ShadowInfo.x);
  }
  return attenuation;
}
#endif
