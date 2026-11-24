#ifndef TERRAIN_PROJECT_PROCEDURAL_TREE_WIND_INCLUDED
#define TERRAIN_PROJECT_PROCEDURAL_TREE_WIND_INCLUDED

#include "shared/SceneWind.glsl"

/** x: whole-tree limit; y: whole-tree frequency Hz; z: leaf-local limit; w: leaf frequency Hz. */
vec4 material_ProceduralTreeWindParams;
/** Generated tree height in source-mesh metres; shared by every LOD and instance of one recipe. */
float material_ProceduralTreeHeight;

float terrainProjectProceduralTreeWindHash(vec3 value) {
  return fract(sin(dot(value, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 terrainProjectProceduralTreeWindRotate(vec3 value, vec3 axis, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
}

vec3 terrainProjectProceduralTreeWindOuterPointWS(vec3 sourcePositionOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
  vec3 positionOS = terrainProjectAssetAssemblyRotate(
    terrainProjectAssetAssemblyRotation(attributes),
    sourcePositionOS * terrainProjectAssetAssemblyEmbeddedScale(attributes)
  ) + terrainProjectAssetAssemblyOriginOS(attributes);
  #else
    vec3 positionOS = sourcePositionOS;
  #endif
  vec4 homogeneousPositionWS = renderer_ModelMat * vec4(positionOS, 1.0);
  return homogeneousPositionWS.xyz / homogeneousPositionWS.w;
}

float terrainProjectProceduralTreeWindRootWeight(Attributes attributes) {
  #ifdef MATERIAL_WIND_PROCEDURAL_PLANT
    // Compiled plant parts share a continuous beam field. Leaf vertices all sample
    // their attachment, so the entire leaf follows its supporting branch rigidly.
    float progress = attributes.PLANT_WIND.w;
  #else
  // Wind topology is an invariant of generated trees and must not activate the independent GPU
  // appearance-variation path merely to read it.
  float branchInfluence = clamp(floor(attributes.TREE_VARIATION_DATA.x * 0.5 + 0.00001), 0.0, 1.0);
  float trunkProgress = clamp(attributes.TREE_VARIATION_DATA.x - branchInfluence * 2.0, 0.0, 1.0);
  float branchAttachmentHeight = clamp(
    attributes.TREE_VARIATION_ROOT.xyz.y / max(material_ProceduralTreeHeight, 0.0001),
    0.0,
    1.0
  );
  // The trunk follows one inexpensive Euler-Bernoulli beam mode. Every vertex in one attached
  // subtree uses its common attachment progress, so branches inherit the trunk pose rigidly
  // instead of running an independent metronome-like oscillator.
  float progress = clamp(mix(trunkProgress, branchAttachmentHeight, branchInfluence), 0.0, 1.0);
  #endif
  return 0.5 * progress * progress * (3.0 - progress);
}

vec3 terrainProjectProceduralTreeWindRotatePoint(
  vec3 positionWS,
  vec3 pivotWS,
  vec3 axisWS,
  float angle
) {
  return pivotWS + terrainProjectProceduralTreeWindRotate(positionWS - pivotWS, axisWS, angle);
}

/**
 * Applies one topology-coherent procedural-tree wind pose.
 *
 * The generator stores one shared TREE_VARIATION_ROOT for every primary branch and all of its
 * twigs/leaves. That existing identity is the mechanical constraint: the complete subtree inherits
 * one gentle whole-tree beam pose, so child junctions cannot split. Leaf cards then add a small
 * stable local rotation around their supporting stem attachment. No per-instance state, texture
 * fetch, or CPU update is introduced; all instances consume the Scene-owned wind velocity and clock.
 */
vec3 terrainProjectApplyProceduralTreeWind(
  vec3 positionWS,
  vec3 originWS,
  Attributes attributes,
  inout vec3 normalWS,
  inout vec3 tangentWS,
  out float windShadingResponse,
  out vec3 groundWindDiagnostics,
  out vec3 groundWindCarrierNormalWS
) {
  windShadingResponse = 0.0;
  groundWindDiagnostics = vec3(0.0);
  groundWindCarrierNormalWS = vec3(0.0, 1.0, 0.0);
  if (scene_WindAnimationEnabled <= 0.5) return positionWS;

  // Vegetation passes the already-varied leaf hinge as originWS. Bark passes the tree root.
  // Reconstructing the tree root only for foliage keeps the existing GPU leaf-frame fetch as the
  // single hinge source and does not activate another vertex attribute or texture lookup.
  vec3 treeOriginWS = originWS;
  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    treeOriginWS = terrainProjectProceduralTreeWindOuterPointWS(vec3(0.0), attributes);
  #endif

  vec2 horizontalVelocity = scene_WindVelocity.xz;
  float speedSquared = dot(horizontalVelocity, horizontalVelocity);
  if (speedSquared <= 0.000001) return positionWS;
  float horizontalSpeed = sqrt(speedSquared);
  vec2 horizontalDirection = horizontalVelocity / horizontalSpeed;
  vec3 bendAxisWS = vec3(horizontalDirection.y, 0.0, -horizontalDirection.x);
  float load = speedSquared / (speedSquared + 16.0);
  float timeSeconds = scene_WindFieldParams.w;
  float treePhase = terrainProjectProceduralTreeWindHash(treeOriginWS);
  float wholeTreeTime = timeSeconds * max(material_ProceduralTreeWindParams.y, 0.01) * 6.2831853;
  float wholeTreePhase = treePhase * 6.2831853;
  float wholeTreeSway =
    sin(wholeTreeTime + wholeTreePhase) * 0.68 +
    sin(wholeTreeTime * 1.73 - wholeTreePhase * 0.61) * 0.32;
  // Retain a downwind mean lean while allowing a slow, non-periodic-looking silhouette drift.
  // The bounded envelope prevents the tree from crossing the wind or snapping at an end stop.
  float wholeTreeEnvelope = clamp(0.72 + wholeTreeSway * 0.18, 0.45, 0.95);
  float wholeTreeAngle = max(material_ProceduralTreeWindParams.x, 0.0) * load * wholeTreeEnvelope;
  float rootWeight = terrainProjectProceduralTreeWindRootWeight(attributes);
  float weightedWholeTreeAngle = wholeTreeAngle * rootWeight;

  positionWS = terrainProjectProceduralTreeWindRotatePoint(
    positionWS,
    treeOriginWS,
    bendAxisWS,
    weightedWholeTreeAngle
  );
  normalWS = normalize(terrainProjectProceduralTreeWindRotate(normalWS, bendAxisWS, weightedWholeTreeAngle));
  #ifdef NEED_VERTEX_TANGENT
    tangentWS = normalize(terrainProjectProceduralTreeWindRotate(tangentWS, bendAxisWS, weightedWholeTreeAngle));
  #endif

  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    // Phase must come from immutable rest topology. Hashing an already-deformed pivot feeds the
    // wind result back into its own oscillator and creates visible jitter.
    float leafIdentity;
    #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
      leafIdentity = attributes.TEXCOORD_2.x;
    #else
      leafIdentity = terrainProjectProceduralTreeWindHash(originWS + treeOriginWS);
    #endif
    float leafPhase = fract(treePhase * 0.37 + fract(leafIdentity * 0.61803398875) * 0.63);
    float leafTime = timeSeconds * max(material_ProceduralTreeWindParams.w, 0.01) * 6.2831853;
    float leafFlutter = sin(leafTime + leafPhase * 6.2831853);
    float leafLoad = clamp(horizontalSpeed / 6.0, 0.0, 1.0);
    float leafAngle = max(material_ProceduralTreeWindParams.z, 0.0) * leafLoad * leafFlutter;

    vec3 leafPivotWS = originWS;
    leafPivotWS = terrainProjectProceduralTreeWindRotatePoint(
      leafPivotWS,
      treeOriginWS,
      bendAxisWS,
      weightedWholeTreeAngle
    );
    #ifdef MATERIAL_WIND_PROCEDURAL_PLANT
      vec3 restAxisWS = terrainProjectProceduralTreeWindOuterPointWS(attributes.PLANT_WIND.xyz, attributes) - treeOriginWS;
      vec3 rawLeafAxisWS = terrainProjectProceduralTreeWindRotate(restAxisWS, bendAxisWS, weightedWholeTreeAngle);
    #elif defined(NEED_VERTEX_TANGENT)
      vec3 rawLeafAxisWS = tangentWS;
    #else
      vec3 rawLeafAxisWS = cross(normalWS, vec3(horizontalDirection.x, 0.0, horizontalDirection.y));
    #endif
    float leafAxisLength = length(rawLeafAxisWS);
    vec3 leafAxisWS = leafAxisLength > 0.0001 ? rawLeafAxisWS / leafAxisLength : bendAxisWS;
    positionWS = terrainProjectProceduralTreeWindRotatePoint(
      positionWS,
      leafPivotWS,
      leafAxisWS,
      leafAngle
    );
    normalWS = normalize(terrainProjectProceduralTreeWindRotate(normalWS, leafAxisWS, leafAngle));
    #ifdef NEED_VERTEX_TANGENT
      tangentWS = normalize(terrainProjectProceduralTreeWindRotate(tangentWS, leafAxisWS, leafAngle));
    #endif
  #endif

  windShadingResponse = 1.0;
  return positionWS;
}

#endif
