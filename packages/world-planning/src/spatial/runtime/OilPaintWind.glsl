#ifndef PLANNING_OIL_PAINT_WIND_INCLUDED
#define PLANNING_OIL_PAINT_WIND_INCLUDED

struct Attributes {
  vec3 POSITION;
  vec3 NORMAL;
  vec2 TEXCOORD_0;
  vec4 COLOR_0;
  // Native plant contract: rest hinge axis and normalized beam attachment.
  vec4 PLANT_WIND;
  vec3 PAINT_ROOT;
  vec3 PAINT_HINGE;
};

#ifdef MATERIAL_OIL_PAINT_TREE
  // Painted geometry is already in object space; the native instance batcher
  // supplies renderer_ModelMat. Adapt only its root/hinge topology to the
  // shared procedural-plant solver, including off-centre canonical roots.
  vec3 terrainProjectAssetAssemblyRotate(vec4 rotation, vec3 value) {
    return value + 2.0 * cross(rotation.xyz, cross(rotation.xyz, value) + rotation.w * value);
  }
  vec4 terrainProjectAssetAssemblyRotation(Attributes attributes) { return vec4(0.0, 0.0, 0.0, 1.0); }
  vec3 terrainProjectAssetAssemblyEmbeddedScale(Attributes attributes) { return vec3(1.0); }
  vec3 terrainProjectAssetAssemblyOriginOS(Attributes attributes) { return attributes.PAINT_ROOT; }
  #include "shared/ProceduralTreeWind.glsl"
#else
  vec3 scene_WindVelocity;
  float scene_WindAnimationEnabled;
  vec4 scene_GroundWindMotion;
  vec4 scene_GroundWindAdvection;
  vec4 scene_GroundWindWave;
  vec4 scene_GroundWindShape;
  sampler2D scene_WindSpectrumTexture;
  #include "shared/GroundWindField.glsl"
#endif

vec3 oilPaintWind(Attributes a, inout vec3 normalWS) {
  vec3 positionWS = (renderer_ModelMat * vec4(a.POSITION, 1.0)).xyz;
  if (a.PLANT_WIND.w <= 0.0 || scene_WindAnimationEnabled <= 0.5) return positionWS;
  vec3 rootWS = (renderer_ModelMat * vec4(a.PAINT_ROOT, 1.0)).xyz;
  #ifdef MATERIAL_OIL_PAINT_TREE
    vec3 originWS = rootWS;
    #ifdef MATERIAL_OIL_PAINT_LEAF
      originWS = (renderer_ModelMat * vec4(a.PAINT_HINGE, 1.0)).xyz;
    #endif
    vec3 tangentWS = vec3(0.0), diagnostics, carrierNormal;
    float response;
    return terrainProjectApplyProceduralTreeWind(positionWS, originWS, a, normalWS, tangentWS, response, diagnostics, carrierNormal);
  #else
    // Litter has zero weight. Living blades share the existing advected ground
    // wind field, with both vertices at each blade's base pinned to the soil.
    float speed = length(scene_WindVelocity.xz);
    if (speed <= 0.0001) return positionWS;
    vec2 direction = scene_WindVelocity.xz / speed;
    vec3 axis = vec3(direction.y, 0.0, -direction.x);
    float angle = terrainProjectGroundWindAngleAt(rootWS.xz) * terrainProjectGroundWindBodyWeight(a.PLANT_WIND.w);
    float c = cos(angle), s = sin(angle);
    vec3 offset = positionWS - rootWS;
    positionWS = rootWS + offset * c + cross(axis, offset) * s + axis * dot(axis, offset) * (1.0 - c);
    normalWS = normalize(normalWS * c + cross(axis, normalWS) * s + axis * dot(axis, normalWS) * (1.0 - c));
    return positionWS;
  #endif
}
#endif
