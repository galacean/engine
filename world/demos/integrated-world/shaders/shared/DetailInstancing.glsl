#ifndef TERRAIN_PROJECT_DETAIL_INSTANCING_INCLUDED
#define TERRAIN_PROJECT_DETAIL_INSTANCING_INCLUDED

#if defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
mat4 renderer_DetailLocalMatrix;
mat4 renderer_DetailLocalNormalMat;
#endif

vec3 terrainProjectRotateDetailY(vec3 value, float radians) {
  float sine = sin(radians);
  float cosine = cos(radians);
  return vec3(
    cosine * value.x + sine * value.z,
    value.y,
    -sine * value.x + cosine * value.z
  );
}

vec3 terrainProjectDetailPositionOS(
  vec3 sourcePositionOS,
  Attributes attributes
) {
  #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
    vec3 prefabPosition = (renderer_DetailLocalMatrix * vec4(sourcePositionOS, 1.0)).xyz;
    return terrainProjectRotateDetailY(
      prefabPosition * attributes.DETAIL_SCALE,
      attributes.DETAIL_POSITION_ROTATION.w
    ) + attributes.DETAIL_POSITION_ROTATION.xyz;
  #elif defined(RENDERER_DETAIL_INSTANCE)
    vec3 prefabPosition = (renderer_DetailLocalMatrix * vec4(sourcePositionOS, 1.0)).xyz;
    vec3 instanceScale = vec3(attributes.DETAIL_SCALE.x, attributes.DETAIL_SCALE.y, attributes.DETAIL_SCALE.x);
    return terrainProjectRotateDetailY(
      prefabPosition * instanceScale,
      attributes.DETAIL_POSITION_ROTATION.w
    ) + attributes.DETAIL_POSITION_ROTATION.xyz;
  #else
    return sourcePositionOS;
  #endif
}

vec3 terrainProjectDetailOriginOS(Attributes attributes) {
  #if defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
    return attributes.DETAIL_POSITION_ROTATION.xyz;
  #else
    return vec3(0.0);
  #endif
}

vec3 terrainProjectDetailNormalOS(
  vec3 sourceNormalOS,
  Attributes attributes
) {
  #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
    vec3 prefabNormal = mat3(renderer_DetailLocalNormalMat) * sourceNormalOS;
    vec3 reciprocalScale = 1.0 / max(attributes.DETAIL_SCALE, vec3(0.00001));
    return normalize(terrainProjectRotateDetailY(
      prefabNormal * reciprocalScale,
      attributes.DETAIL_POSITION_ROTATION.w
    ));
  #elif defined(RENDERER_DETAIL_INSTANCE)
    vec3 prefabNormal = mat3(renderer_DetailLocalNormalMat) * sourceNormalOS;
    vec3 reciprocalScale = 1.0 / vec3(
      attributes.DETAIL_SCALE.x,
      attributes.DETAIL_SCALE.y,
      attributes.DETAIL_SCALE.x
    );
    return normalize(terrainProjectRotateDetailY(
      prefabNormal * reciprocalScale,
      attributes.DETAIL_POSITION_ROTATION.w
    ));
  #else
    return sourceNormalOS;
  #endif
}

vec3 terrainProjectDetailTangentOS(
  vec3 sourceTangentOS,
  Attributes attributes
) {
  #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
    vec3 prefabTangent = mat3(renderer_DetailLocalMatrix) * sourceTangentOS;
    return normalize(terrainProjectRotateDetailY(
      prefabTangent * attributes.DETAIL_SCALE,
      attributes.DETAIL_POSITION_ROTATION.w
    ));
  #elif defined(RENDERER_DETAIL_INSTANCE)
    vec3 prefabTangent = mat3(renderer_DetailLocalMatrix) * sourceTangentOS;
    vec3 instanceScale = vec3(attributes.DETAIL_SCALE.x, attributes.DETAIL_SCALE.y, attributes.DETAIL_SCALE.x);
    return normalize(terrainProjectRotateDetailY(
      prefabTangent * instanceScale,
      attributes.DETAIL_POSITION_ROTATION.w
    ));
  #else
    return sourceTangentOS;
  #endif
}

#endif
