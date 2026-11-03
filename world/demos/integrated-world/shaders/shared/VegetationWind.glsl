#ifndef TERRAIN_PROJECT_VEGETATION_WIND_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_WIND_INCLUDED

#include "shared/DetailInstancing.glsl"

vec3 scene_WindVelocity;
vec3 scene_WindSpectrumAdvectionOffset;
float scene_WindAnimationEnabled;
vec4 scene_WindFieldParams;
vec3 scene_WindLayerMultipliers;
sampler2D scene_WindSpectrumTexture;
vec4 scene_WindSpectrumParams;
#if defined(MATERIAL_WIND_GROUND_VEGETATION) && (defined(MATERIAL_VEGETATION_CLIMATE_GRASS) || defined(MATERIAL_VEGETATION_CLIMATE_FLOWER))
  #define MATERIAL_WIND_GRASS_FLOWER_FIELD
  vec4 scene_GroundWindWave;
  vec4 scene_GroundWindShape;
  vec4 scene_GroundWindMotion;
  vec4 scene_GroundWindAdvection;
  #include "shared/GroundWindField.glsl"
#endif
sampler2D scene_WindLocalFieldTexture;
sampler2D scene_WindLocalFieldPreviousTexture;
sampler2D scene_WindLocalFieldExposureTexture;
sampler2D scene_WindLocalFieldPreviousExposureTexture;
sampler2D scene_WindGroundResponseTexture;
sampler2D scene_WindFlowerResponseTexture;
sampler2D scene_WindTreeResponseSlowTexture;
sampler2D scene_WindTreeResponseFastTexture;
vec4 scene_WindLocalFieldTransform;
vec4 scene_WindLocalFieldTemporalParams;
vec4 scene_WindGroundResponseParams;
vec4 scene_WindFlowerResponseParams;
vec4 scene_WindGroundReferenceGustHistory;
vec4 scene_WindTreeResponseParams;
float scene_WindGroundResponseRampDuration;
vec4 scene_WindGrassProfile0;
vec4 scene_WindGrassProfile1;
vec4 scene_WindGrassProfile2;
vec4 scene_WindFlowerProfile0;
vec4 scene_WindFlowerProfile1;
vec4 scene_WindFlowerProfile2;
vec4 scene_WindLeafProfile0;
vec4 scene_WindLeafProfile1;
vec4 scene_WindLeafProfile2;
vec4 scene_WindShrubProfile0;
vec4 scene_WindShrubProfile1;
vec4 scene_WindShrubProfile2;
vec4 scene_WindBranchProfile0;
vec4 scene_WindBranchProfile1;
vec4 scene_WindBranchProfile2;
vec4 scene_WindBillboardProfile0;
vec4 scene_WindBillboardProfile1;
vec4 scene_WindBillboardProfile2;

struct TerrainProjectWindSample {
  vec3 velocityWS;
  float steadyHorizontalSpeed;
  float macro;
  float meso;
  float micro;
  float groundWave;
  float groundDetail;
  float turbulence;
  float exposure;
  float localFieldWeight;
  float elasticMemory;
  float groundResponseVelocity;
};

struct TerrainProjectWindReceiverProfile {
  float bendGain;
  float dynamicGain;
  float macroGain;
  float mesoGain;
  float microGain;
  float responseLagSeconds;
  float maximumBendRadians;
  float flutterWeight;
  float flutterFrequencyMinHz;
  float flutterFrequencyMaxHz;
  float highSpeedMicroScale;
  float naturalFrequencyHz;
};

vec2 terrainProjectMixHorizontalDirection(vec2 fromDirection, vec2 toDirection, float weight) {
  float fromLength = length(fromDirection);
  float toLength = length(toDirection);
  if (fromLength <= 0.0001) return toLength > 0.0001 ? toDirection / toLength : vec2(1.0, 0.0);
  if (toLength <= 0.0001) return fromDirection / fromLength;
  vec2 fromUnit = fromDirection / fromLength;
  vec2 toUnit = toDirection / toLength;
  float crossAngle = fromUnit.x * toUnit.y - fromUnit.y * toUnit.x;
  float dotAngle = clamp(dot(fromUnit, toUnit), -1.0, 1.0);
  float angle = atan(crossAngle, dotAngle) * clamp(weight, 0.0, 1.0);
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec2(
    fromUnit.x * cosine - fromUnit.y * sine,
    fromUnit.x * sine + fromUnit.y * cosine
  );
}

vec2 terrainProjectAdvanceDampedResponse(
  vec2 state,
  float target,
  float frequencyHz,
  float dampingRatio,
  float elapsedSeconds
) {
  float deltaTime = clamp(elapsedSeconds, 0.0, 8.0);
  float omega = max(frequencyHz, 0.001) * 6.2831853;
  float error = state.x - target;
  if (dampingRatio >= 0.9999) {
    float coefficient = state.y + omega * error;
    float decay = exp(-omega * deltaTime);
    return vec2(
      target + (error + coefficient * deltaTime) * decay,
      (state.y - omega * coefficient * deltaTime) * decay
    );
  }
  float boundedDamping = clamp(dampingRatio, 0.001, 0.9999);
  float dampedOmega = omega * sqrt(max(1.0 - boundedDamping * boundedDamping, 0.000001));
  float decay = exp(-boundedDamping * omega * deltaTime);
  float cosine = cos(dampedOmega * deltaTime);
  float sine = sin(dampedOmega * deltaTime);
  float sineCoefficient = (state.y + boundedDamping * omega * error) / dampedOmega;
  float oscillation = error * cosine + sineCoefficient * sine;
  return vec2(
    target + decay * oscillation,
    decay * (
      -boundedDamping * omega * oscillation -
      error * dampedOmega * sine +
      sineCoefficient * dampedOmega * cosine
    )
  );
}

vec2 terrainProjectAdvanceDampedRampResponse(
  vec2 state,
  float startTarget,
  float endTarget,
  float frequencyHz,
  float dampingRatio,
  float rampDurationSeconds,
  float elapsedSeconds
) {
  float deltaTime = clamp(elapsedSeconds, 0.0, 8.0);
  if (deltaTime <= 0.0) return state;
  float rampDuration = max(rampDurationSeconds, 0.0001);
  float rampTime = min(deltaTime, rampDuration);
  float omega = max(frequencyHz, 0.001) * 6.2831853;
  float boundedDamping = clamp(dampingRatio, 0.001, 1.0);
  float slope = (endTarget - startTarget) / rampDuration;
  float steadyVelocityOffset = 2.0 * boundedDamping * slope / omega;
  vec2 homogeneousState = vec2(
    state.x - startTarget + steadyVelocityOffset,
    state.y - slope
  );
  vec2 homogeneous = terrainProjectAdvanceDampedResponse(
    homogeneousState,
    0.0,
    frequencyHz,
    boundedDamping,
    rampTime
  );
  vec2 response = vec2(
    startTarget + slope * rampTime - steadyVelocityOffset + homogeneous.x,
    slope + homogeneous.y
  );
  if (deltaTime > rampDuration) {
    response = terrainProjectAdvanceDampedResponse(
      response,
      endTarget,
      frequencyHz,
      boundedDamping,
      deltaTime - rampDuration
    );
  }
  return response;
}

#if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)
vec3 terrainProjectHeroVectorToWorld(vec3 vectorOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    vectorOS = terrainProjectAssetAssemblyRotate(
      terrainProjectAssetAssemblyRotation(attributes),
      vectorOS * terrainProjectAssetAssemblyEmbeddedScale(attributes)
    );
  #endif
  return mat3(renderer_ModelMat) * vectorOS;
}
#endif

#ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
struct TerrainProjectHeroHierarchyData {
  vec3 structurePositionWS;
  vec3 stage0PivotWS;
  vec3 stage1PivotWS;
  vec3 stage2PivotWS;
  vec3 stageWeights;
  vec3 stageParentProgress;
  float mechanicalDepth;
  float localProgress;
  float leafSpanProgress;
  float tipWeight;
  float stiffnessWeight;
  float phaseCoordinate;
  float leafSpanLengthWS;
  float leafHingeOffsetWS;
  vec3 leafHingeAxisWS;
  vec3 leafRestNormalWS;
};

vec3 terrainProjectHeroPointToWorld(vec3 positionOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    // Seed World keeps the per-tree transform in the Assembly vertex stream instead of
    // renderer_ModelMat. Mechanical pivots are authored in exactly the same source-mesh space
    // as POSITION, so they must cross that instance transform as well. Leaving them behind in
    // batch-local space makes every rotated/translated tree bend around the shared batch origin.
    positionOS = terrainProjectAssetAssemblyPositionOS(positionOS, attributes);
  #endif
  vec4 homogeneous = renderer_ModelMat * vec4(positionOS, 1.0);
  return homogeneous.xyz / homogeneous.w;
}

vec3 terrainProjectHeroNormalToWorld(vec3 normalOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    normalOS = terrainProjectAssetAssemblyNormalOS(normalOS, attributes);
  #endif
  return normalize(mat3(renderer_NormalMat) * normalOS);
}

vec2 terrainProjectMechanicalTexelUv(float linearIndex, vec2 size) {
  float x = mod(linearIndex, size.x);
  float y = floor(linearIndex / size.x);
  return (vec2(x, y) + 0.5) / size;
}

vec4 terrainProjectDecodeMechanicalTransform(float elementIndex, float pivotIndex) {
  vec2 transformSize = material_WindMechanicalTextureSize.xy;
  return texture2D(
    material_WindMechanicalTransforms,
    terrainProjectMechanicalTexelUv(elementIndex * 4.0 + pivotIndex, transformSize)
  );
}

vec3 terrainProjectDecodeMechanicalPivot(vec3 relative) {
  return material_WindMechanicalBoundsMin.xyz + relative * material_WindMechanicalBoundsExtent.xyz;
}

vec3 terrainProjectDecodeOctahedralDirection(vec2 encoded) {
  vec2 octahedral = encoded * 2.0 - 1.0;
  vec3 direction = vec3(octahedral, 1.0 - abs(octahedral.x) - abs(octahedral.y));
  if (direction.z < 0.0) {
    direction.xy = (1.0 - abs(direction.yx)) * sign(direction.xy + vec2(0.000001));
  }
  return normalize(direction);
}

vec3 terrainProjectMechanicalFrameReference(vec3 axis) {
  vec3 helper = abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  return normalize(cross(helper, axis));
}

void terrainProjectDecodeMechanicalLeafFrame(
  vec4 packedLeafFrame,
  out vec3 hingeAxisOS,
  out vec3 spanAxisOS,
  out vec3 restNormalOS
) {
  hingeAxisOS = terrainProjectDecodeOctahedralDirection(packedLeafFrame.xy);
  vec3 referenceSpan = terrainProjectMechanicalFrameReference(hingeAxisOS);
  float spanTwist = (packedLeafFrame.z * 2.0 - 1.0) * PI;
  float cosine = cos(spanTwist);
  float sine = sin(spanTwist);
  spanAxisOS = referenceSpan * cosine + cross(hingeAxisOS, referenceSpan) * sine;
  restNormalOS = normalize(cross(hingeAxisOS, spanAxisOS));
}

TerrainProjectHeroHierarchyData terrainProjectHeroHierarchyData(
  vec3 positionWS,
  vec3 originWS,
  Attributes attributes
) {
  TerrainProjectHeroHierarchyData hierarchy;
  float elementIndex = floor(attributes.TEXCOORD_3.x * 65535.0 + 0.5);
  vec4 stage0Transform = terrainProjectDecodeMechanicalTransform(elementIndex, 0.0);
  vec4 stage1Transform = stage0Transform;
  vec4 stage2Transform = stage0Transform;
  vec3 stage0PivotOS = terrainProjectDecodeMechanicalPivot(stage0Transform.xyz);
  vec3 stage1PivotOS = stage0PivotOS;
  vec3 stage2PivotOS = stage0PivotOS;
  #if defined(MATERIAL_WIND_MECHANICAL_DEPTH_2) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)
    stage1Transform = terrainProjectDecodeMechanicalTransform(elementIndex, 1.0);
    stage1PivotOS = terrainProjectDecodeMechanicalPivot(stage1Transform.xyz);
    stage2Transform = stage1Transform;
    stage2PivotOS = stage1PivotOS;
  #endif
  #if defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)
    stage2Transform = terrainProjectDecodeMechanicalTransform(elementIndex, 2.0);
    stage2PivotOS = terrainProjectDecodeMechanicalPivot(stage2Transform.xyz);
  #endif
  vec2 dynamicsSize = material_WindMechanicalTextureSize.zw;
  vec4 dynamics = texture2D(
    material_WindMechanicalDynamics,
    terrainProjectMechanicalTexelUv(elementIndex * 2.0, dynamicsSize)
  );
  float mechanicalMetadata = floor(dynamics.w * 255.0 + 0.5);
  float normalizedLeafSpan = floor(mechanicalMetadata * 0.25) / 63.0;
  hierarchy.leafHingeAxisWS = vec3(1.0, 0.0, 0.0);
  hierarchy.leafRestNormalWS = vec3(0.0, 1.0, 0.0);
  hierarchy.leafSpanLengthWS = 0.0;
  hierarchy.leafHingeOffsetWS = 0.0;
  hierarchy.structurePositionWS = positionWS;
  hierarchy.localProgress = clamp(attributes.TEXCOORD_3.y, 0.0, 1.0);
  hierarchy.leafSpanProgress = clamp(attributes.TEXCOORD_3.y, 0.0, 1.0);
  #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    vec4 terminalTransform = terrainProjectDecodeMechanicalTransform(elementIndex, 3.0);
    vec3 terminalPivotOS = material_WindMechanicalBoundsMin.xyz +
      terminalTransform.xyz * material_WindMechanicalBoundsExtent.xyz;
    hierarchy.structurePositionWS = terrainProjectHeroPointToWorld(terminalPivotOS, attributes);
    vec4 packedLeafFrame = texture2D(
      material_WindMechanicalDynamics,
      terrainProjectMechanicalTexelUv(elementIndex * 2.0 + 1.0, dynamicsSize)
    );
    vec3 leafHingeAxisOS;
    vec3 leafSpanAxisOS;
    vec3 leafRestNormalOS;
    terrainProjectDecodeMechanicalLeafFrame(
      packedLeafFrame,
      leafHingeAxisOS,
      leafSpanAxisOS,
      leafRestNormalOS
    );
    float leafSpanReferenceOS = max(
      max(material_WindMechanicalBoundsExtent.x, material_WindMechanicalBoundsExtent.y),
      material_WindMechanicalBoundsExtent.z
    ) * 0.25;
    hierarchy.leafHingeAxisWS = normalize(terrainProjectHeroVectorToWorld(leafHingeAxisOS, attributes));
    vec3 leafSpanVectorWS = terrainProjectHeroVectorToWorld(
      leafSpanAxisOS * normalizedLeafSpan * leafSpanReferenceOS,
      attributes
    );
    float leafSpanAlongHingeWS = dot(leafSpanVectorWS, hierarchy.leafHingeAxisWS);
    vec3 leafSpanPerpendicularWS = leafSpanVectorWS -
      dot(leafSpanVectorWS, hierarchy.leafHingeAxisWS) * hierarchy.leafHingeAxisWS;
    float leafSpanLengthWS = length(leafSpanPerpendicularWS);
    vec3 leafSpanAxisWS = leafSpanLengthWS > 0.0001
      ? leafSpanPerpendicularWS / leafSpanLengthWS
      : normalize(cross(
          terrainProjectHeroNormalToWorld(leafRestNormalOS, attributes),
          hierarchy.leafHingeAxisWS
        ));
    hierarchy.leafRestNormalWS = normalize(cross(
      hierarchy.leafHingeAxisWS,
      leafSpanAxisWS
    ));
    float leafHingeOffsetOS = (terminalTransform.w * 2.0 - 1.0) * leafSpanReferenceOS;
    vec3 leafHingeOffsetVectorWS = terrainProjectHeroVectorToWorld(
      leafHingeAxisOS * leafHingeOffsetOS,
      attributes
    );
    hierarchy.leafSpanLengthWS = leafSpanLengthWS;
    hierarchy.leafHingeOffsetWS =
      dot(leafHingeOffsetVectorWS, hierarchy.leafHingeAxisWS) + leafSpanAlongHingeWS;
    // Structural inheritance is card-coherent: all four leaf vertices use the same baked
    // attachment coordinate on their parent branch. TEXCOORD_3.y remains exclusively the
    // differential root-to-tip blade coordinate and must never drive a parent transform.
    hierarchy.localProgress = clamp(packedLeafFrame.w, 0.0, 1.0);
  #endif
  hierarchy.stage0PivotWS = terrainProjectHeroPointToWorld(stage0PivotOS, attributes);
  hierarchy.stage1PivotWS = terrainProjectHeroPointToWorld(stage1PivotOS, attributes);
  hierarchy.stage2PivotWS = terrainProjectHeroPointToWorld(stage2PivotOS, attributes);
  hierarchy.stageWeights = dynamics.xyz;
  hierarchy.stageParentProgress = vec3(
    stage0Transform.w,
    stage1Transform.w,
    stage2Transform.w
  );
  hierarchy.mechanicalDepth = mod(mechanicalMetadata, 4.0);
  hierarchy.tipWeight = smoothstep(0.52, 1.0, hierarchy.localProgress);
  hierarchy.stiffnessWeight = 1.0 - max(max(dynamics.x, dynamics.y), dynamics.z);
  hierarchy.phaseCoordinate = fract(elementIndex * 0.61803398875);
  return hierarchy;
}
#endif

TerrainProjectWindReceiverProfile terrainProjectWindReceiverProfile() {
  TerrainProjectWindReceiverProfile profile;
  #if defined(TERRAIN_PROJECT_WIND_BILLBOARD)
    vec4 response0 = scene_WindBillboardProfile0;
    vec4 response1 = scene_WindBillboardProfile1;
    vec4 response2 = scene_WindBillboardProfile2;
  #elif defined(MATERIAL_VEGETATION_CLIMATE_FLOWER)
    vec4 response0 = scene_WindFlowerProfile0;
    vec4 response1 = scene_WindFlowerProfile1;
    vec4 response2 = scene_WindFlowerProfile2;
  #elif defined(MATERIAL_VEGETATION_CLIMATE_SHRUB)
    vec4 response0 = scene_WindShrubProfile0;
    vec4 response1 = scene_WindShrubProfile1;
    vec4 response2 = scene_WindShrubProfile2;
  #elif defined(MATERIAL_VEGETATION_CLIMATE_GRASS)
    vec4 response0 = scene_WindGrassProfile0;
    vec4 response1 = scene_WindGrassProfile1;
    vec4 response2 = scene_WindGrassProfile2;
  #elif defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    vec4 response0 = scene_WindLeafProfile0;
    vec4 response1 = scene_WindLeafProfile1;
    vec4 response2 = scene_WindLeafProfile2;
  #elif defined(MATERIAL_VEGETATION_CLIMATE_BRANCH)
    vec4 response0 = scene_WindBranchProfile0;
    vec4 response1 = scene_WindBranchProfile1;
    vec4 response2 = scene_WindBranchProfile2;
  #else
    vec4 response0 = scene_WindGrassProfile0;
    vec4 response1 = scene_WindGrassProfile1;
    vec4 response2 = scene_WindGrassProfile2;
  #endif
  profile.bendGain = response0.x;
  profile.dynamicGain = response0.y;
  profile.macroGain = response0.z;
  profile.mesoGain = response0.w;
  profile.microGain = response1.x;
  profile.responseLagSeconds = response1.y;
  profile.maximumBendRadians = response1.z;
  profile.flutterWeight = response1.w;
  profile.flutterFrequencyMinHz = response2.x;
  profile.flutterFrequencyMaxHz = response2.y;
  profile.highSpeedMicroScale = response2.z;
  profile.naturalFrequencyHz = response2.w;
  return profile;
}

#ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
TerrainProjectWindReceiverProfile terrainProjectBranchWindReceiverProfile() {
  TerrainProjectWindReceiverProfile profile;
  profile.bendGain = scene_WindBranchProfile0.x;
  profile.dynamicGain = scene_WindBranchProfile0.y;
  profile.macroGain = scene_WindBranchProfile0.z;
  profile.mesoGain = scene_WindBranchProfile0.w;
  profile.microGain = scene_WindBranchProfile1.x;
  profile.responseLagSeconds = scene_WindBranchProfile1.y;
  profile.maximumBendRadians = scene_WindBranchProfile1.z;
  profile.flutterWeight = scene_WindBranchProfile1.w;
  profile.flutterFrequencyMinHz = scene_WindBranchProfile2.x;
  profile.flutterFrequencyMaxHz = scene_WindBranchProfile2.y;
  profile.highSpeedMicroScale = scene_WindBranchProfile2.z;
  profile.naturalFrequencyHz = scene_WindBranchProfile2.w;
  return profile;
}
#endif

float terrainProjectWindAnimationLod(float distanceToCamera) {
  #ifdef TERRAIN_PROJECT_WIND_BILLBOARD
    return 3.0;
  #else
    return smoothstep(36.0, 72.0, distanceToCamera) +
      smoothstep(120.0, 220.0, distanceToCamera);
  #endif
}

#if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)
vec2 terrainProjectExtrapolateTreeResponse(vec4 packedState, float elapsedSeconds) {
  return packedState.xy + packedState.zw * elapsedSeconds;
}

vec2 terrainProjectTreePrimaryResponse(vec3 originWS) {
  vec2 localUv = (originWS.xz - scene_WindLocalFieldTransform.xy) *
    scene_WindLocalFieldTransform.z + 0.5;
  vec2 clampedUv = clamp(localUv, 0.0, 1.0);
  // The fragment-compute pass owns the second-order solve. Vertices only linearly predict over
  // the remainder of the capped 12 Hz interval, eliminating per-vertex field/exposure fetches
  // without introducing a visible staircase between response revisions.
  float elapsedSeconds = min(
    max(scene_WindLocalFieldTemporalParams.w, 0.0),
    max(scene_WindGroundResponseRampDuration, 0.0001)
  );
  vec2 slow = terrainProjectExtrapolateTreeResponse(
    texture2D(scene_WindTreeResponseSlowTexture, clampedUv),
    elapsedSeconds
  );
  vec2 fast = terrainProjectExtrapolateTreeResponse(
    texture2D(scene_WindTreeResponseFastTexture, clampedUv),
    elapsedSeconds
  );
  float frequencyWeight = clamp(
    (material_WindTreePrimaryParams.x - scene_WindTreeResponseParams.x) /
      max(scene_WindTreeResponseParams.z - scene_WindTreeResponseParams.x, 0.001),
    0.0,
    1.0
  );
  // The response pass blends its outer texels to the global physical load, so clamping the UV
  // extends a coherent retained state beyond the high-detail local field instead of freezing or
  // switching distant trees to an instantaneous pose.
  return mix(slow, fast, frequencyWeight);
}

void terrainProjectHeroPrimaryRootModeFromResponse(
  vec2 response,
  vec3 originWS,
  vec3 fallbackBendAxis,
  out vec3 bendAxis,
  out float bendAngle
) {
  // The response textures store one normalized environmental load history shared by every tree.
  // Species softness belongs in the consumer: scaling the retained vector here is equivalent to
  // linear structural compliance while preserving its direction, phase, damping and recoil.
  float responseMagnitude = length(response) * max(material_WindTreeComplianceGain, 0.0);
  bendAxis = responseMagnitude > 0.0001
    ? normalize(vec3(response.y, 0.0, -response.x))
    : fallbackBendAxis;
  float maximumAngle = max(material_WindTreePrimaryParams.z, 0.0001);
  bendAngle = maximumAngle * (1.0 - exp(-responseMagnitude)) *
    clamp(material_WindStructureWeights.x, 0.0, 1.0);
}
#endif

float terrainProjectVegetationVertexColorWeight(Attributes attributes) {
  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    return attributes.COLOR_0.r;
  #else
    return 1.0;
  #endif
}

float terrainProjectVegetationBaseLockWeight(Attributes attributes) {
  // A disabled lock must not evaluate pow on tiled texture coordinates: mixing
  // an undefined result with zero does not remove it on every GPU.
  if (material_UVBaseLock <= 0.0) return 1.0;
  #ifdef RENDERER_HAS_UV
    // glTF V is opposite the source-authored V used by the base-lock parameter.
    float baseHeight = clamp(1.0 - attributes.TEXCOORD_0.y, 0.0, 1.0);
  #else
    float baseHeight = 0.0;
  #endif
  return mix(1.0, pow(baseHeight, 1.5), material_UVBaseLock);
}

float terrainProjectVegetationStructuralWeight(
  vec3 positionWS,
  vec3 originWS,
  Attributes attributes
) {
  #if defined(MATERIAL_WIND_PROCEDURAL_FLOWER)
    // One coherent air load drives the beam. Its section coordinate owns root pinning.
    return 1.0;
  #elif defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && !defined(MATERIAL_WIND_SLOD_REDUCED) && (defined(MATERIAL_VEGETATION_CLIMATE_BRANCH) || defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
    return clamp(attributes.TEXCOORD_3.y, 0.0, 1.0);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_SHRUB) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    // Shrub COLOR_0.a stores one constant implicit-branch compliance per leaf card. The
    // collapsed hierarchy consumes it at the rigid-card transform below, so structural load
    // must remain card-coherent here rather than reusing the per-vertex leaf gradient.
    return 1.0;
  #else
    float authoredWeight = terrainProjectVegetationVertexColorWeight(attributes);
    #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
      #ifdef MATERIAL_VEGETATION_CLIMATE_FLOWER
        authoredWeight = step(0.5, clamp(authoredWeight, 0.0, 1.0));
      #else
        authoredWeight = pow(
          clamp(authoredWeight, 0.0, 1.0),
          max(material_WindGroundShapeParams.y * scene_GroundWindShape.x, 0.05)
        );
      #endif
    #endif
    return authoredWeight * terrainProjectVegetationBaseLockWeight(attributes);
  #endif
}

float terrainProjectTreePhase(vec3 originWS) {
  return fract(sin(dot(originWS.xz, vec2(12.9898, 78.233))) * 43758.5453);
}

float terrainProjectWindReceiverPhase(vec3 originWS, Attributes attributes) {
  float phase = terrainProjectTreePhase(originWS);
  #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    float elementIndex = floor(attributes.TEXCOORD_3.x * 65535.0 + 0.5);
    phase = fract(phase * 0.82 + fract(elementIndex * 0.61803398875) * 0.18);
  #elif defined(MATERIAL_WIND_GROUND_VEGETATION) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    // COLOR_0.b is constant over one connected blade/stem and different between neighbors.
    // Blending it with the instance phase preserves a coherent plant while preventing a dense
    // patch from moving as one rigid sheet while retaining packed multi-component vegetation.
    phase = fract(phase * 0.62 + attributes.COLOR_0.b * 0.38);
  #elif defined(MATERIAL_VEGETATION_CLIMATE_LEAF) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    phase = fract(phase + attributes.COLOR_0.b);
  #endif
  return phase;
}

float terrainProjectVegetationFlutterWeight(
  Attributes attributes,
  TerrainProjectWindReceiverProfile profile
) {
  #ifdef MATERIAL_VEGETATION_CLIMATE_FLOWER
    return 0.0;
  #elif defined(RENDERER_ENABLE_VERTEXCOLOR) && (defined(MATERIAL_VEGETATION_CLIMATE_LEAF) || defined(MATERIAL_WIND_GROUND_VEGETATION))
    // Ground assets bake an independent root-tip differential-motion coordinate in COLOR_0.g.
    // Consuming only the profile weight makes every vertex receive the same secondary mode and
    // discards the baked mechanical data.
    return attributes.COLOR_0.g * profile.flutterWeight;
  #else
    return profile.flutterWeight;
  #endif
}

float terrainProjectShrubBranchCompliance(Attributes attributes) {
  #if defined(MATERIAL_VEGETATION_CLIMATE_SHRUB) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    return clamp(attributes.COLOR_0.a, 0.0, 1.0);
  #else
    return 1.0;
  #endif
}

float terrainProjectHeroLeafSpanWeight(Attributes attributes) {
  #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
    return clamp(attributes.TEXCOORD_3.y, 0.0, 1.0);
  #else
    return 1.0;
  #endif
}

float terrainProjectWindFlutterFrequencyHz(
  float decorrelation,
  TerrainProjectWindReceiverProfile profile
) {
  float variation = clamp(abs(decorrelation), 0.0, 1.0);
  return mix(profile.flutterFrequencyMinHz, profile.flutterFrequencyMaxHz, variation);
}

float terrainProjectWindMicroEnvelope(
  float relativeHorizontalSpeed,
  TerrainProjectWindReceiverProfile profile
) {
  // Foliage reconfiguration suppresses high-frequency projected area in a gale. Other
  // receiver profiles author 1.0 and keep their full response through the same branch-free path.
  return mix(1.0, profile.highSpeedMicroScale, smoothstep(3.0, 8.0, relativeHorizontalSpeed));
}

#ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
float terrainProjectHeroLeafPressureLoadFromSpeed(
  float physicalSpeed,
  float pressureReferenceSpeedScale
) {
  // Leaf translation and rotation are aerodynamic responses, so they must converge to zero
  // with dynamic pressure instead of switching on at the first non-zero wind sample. The
  // smooth onset suppresses sub-threshold card chatter while the rational response remains
  // continuous and asymptotically bounded through a gale without adding a transcendental per vertex.
  // Broad leaves begin reorienting under light air flow. A 6 m/s reference keeps the
  // quadratic pressure law while matching the lower stiffness of a petiole versus wood.
  // The previous 7 m/s / 1.6 calibration stacked with parent-frame gating and left a
  // 4 m/s breeze below the visible angular range of a dense broadleaf crown.
  float normalizedSpeed = physicalSpeed / (6.0 * max(pressureReferenceSpeedScale, 0.5));
  float scaledDynamicPressure = normalizedSpeed * normalizedSpeed * 1.8;
  float dynamicPressureLoad = scaledDynamicPressure / (1.0 + scaledDynamicPressure);
  float flutterOnset = smoothstep(0.35, 2.0, physicalSpeed);
  return clamp(dynamicPressureLoad * flutterOnset, 0.0, 1.0);
}

#endif

vec3 terrainProjectRotateAroundAxisSinCos(
  vec3 value,
  vec3 axis,
  float cosine,
  float sine
) {
  return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
}

vec3 terrainProjectRotateAroundAxis(vec3 value, vec3 axis, float angle) {
  return terrainProjectRotateAroundAxisSinCos(value, axis, cos(angle), sin(angle));
}

float terrainProjectSmoothSignedLimit(float value, float maximumMagnitude) {
  // Keep the transfer linear through ordinary motion, then bring its velocity to zero
  // continuously before the mechanical limit. A hard clamp creates a visible stop/start
  // exactly when gale motion reaches the end of its travel.
  float magnitude = abs(value);
  float safeMaximum = max(maximumMagnitude, 0.0001);
  float saturation = smoothstep(safeMaximum * 0.6, safeMaximum, magnitude);
  float limitedMagnitude = min(mix(magnitude, safeMaximum, saturation), safeMaximum);
  return value < 0.0 ? -limitedMagnitude : limitedMagnitude;
}

float terrainProjectCompliantSignedTravel(float value, float maximumMagnitude) {
  // A differential elastic mode must approach its remaining angular travel without entering
  // and leaving a shared end-stop. This C-infinity rational response is linear at the origin,
  // monotonic everywhere, and asymptotic at the limit, so it cannot manufacture angular jerk.
  float safeMaximum = max(maximumMagnitude, 0.0);
  return value * safeMaximum * inversesqrt(
    safeMaximum * safeMaximum + value * value + 0.00000001
  );
}

#ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
vec3 terrainProjectApplyHeroLeafTumble(
  vec3 positionWS,
  vec3 attachmentWS,
  vec3 hingeAxisWS,
  vec3 restNormalWS,
  vec3 windDirectionWS,
  float pressureLoad,
  float adherenceWeight,
  float tumbleWeight,
  float twistWeight,
  float twitchWeight,
  float phaseCoordinate,
  float primaryOscillation,
  float secondaryOscillation,
  float microOscillation,
  float maximumAdherenceAngle,
  float tumbleAmplitude,
  float twistAmplitude,
  float twitchAmplitude,
  float spanWeight,
  float bladeFlexion,
  float normalResponse,
  inout vec3 normalWS,
  inout vec3 tangentWS
) {
  // UE SpeedTree LeafTumble is the local foliage baseline: move into the local pivot frame,
  // twist around the baked growth direction, then combine directional adherence, flip and
  // twitch around one wind-relative tumble axis. Position and lighting direction receive the
  // same rotations. P3 evaluates the equivalent conjugated transform after its parent hierarchy,
  // using the already-deformed parent frame and its structural leaf hinge. The aerodynamic center
  // owns force/torque magnitude only; using it as the transform pivot breaks the parent constraint.
  vec3 normalizedHingeAxisWS = normalize(hingeAxisWS);
  vec3 leafGrowthDirectionWS = normalize(cross(
    restNormalWS,
    normalizedHingeAxisWS
  ));
  vec3 localPositionWS = positionWS - attachmentWS;
  float leafPhase = phaseCoordinate * 6.2831853;
  float leafTime = scene_WindFieldParams.w *
    max(material_WindSpeciesParams.x * 1.35, 0.1) * 6.2831853;
  float oscillationA = sin(leafTime + leafPhase);
  float oscillationB = sin(leafTime * 0.75 - leafPhase);
  float twistOscillation = oscillationA + oscillationB * oscillationB;
  float twistAngle = twistOscillation * twistAmplitude * twistWeight * pressureLoad * normalResponse;
  float twistCosine = cos(twistAngle);
  float twistSine = sin(twistAngle);
  localPositionWS = terrainProjectRotateAroundAxisSinCos(
    localPositionWS,
    leafGrowthDirectionWS,
    twistCosine,
    twistSine
  );
  normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
    normalWS,
    leafGrowthDirectionWS,
    twistCosine,
    twistSine
  ));
  #ifdef NEED_VERTEX_TANGENT
    tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
      tangentWS,
      leafGrowthDirectionWS,
      twistCosine,
      twistSine
    ));
  #endif

  float leafWindAlignment = clamp(dot(windDirectionWS, leafGrowthDirectionWS), -1.0, 1.0);
  vec3 leafAdherenceAxisWS = cross(leafGrowthDirectionWS, windDirectionWS);
  float leafAdherenceAxisLength = length(leafAdherenceAxisWS);
  leafAdherenceAxisWS = leafAdherenceAxisLength > 0.0001
    ? leafAdherenceAxisWS / leafAdherenceAxisLength
    : normalizedHingeAxisWS;
  float leafWindAngle = acos(leafWindAlignment);
  // The petiole/card travel limit and the aerodynamic load are different physical terms.
  // Clamp the rest-pose alignment error first, then scale that bounded target by pressure.
  // Limiting the pressure-scaled error instead lets a back-facing proxy card reach its full
  // gale angle in a breeze, which can swing the visible alpha island outside the crown even
  // though its invisible root edge remains mathematically pinned.
  float adherenceTargetAngle = min(
    leafWindAngle,
    max(maximumAdherenceAngle, 0.0001)
  );
  float adherenceAngle =
    adherenceTargetAngle * clamp(pressureLoad * adherenceWeight, 0.0, 1.0);
  // Match UE's non-sinusoidal flip construction, while the P3 advected micro band supplies the
  // intermittent twitch term. Both are local rotations and therefore cannot move the crown frame.
  float flipOscillation = secondaryOscillation - primaryOscillation * primaryOscillation;
  float flipAngle = flipOscillation * tumbleAmplitude * tumbleWeight * pressureLoad;
  float twitchAngle = microOscillation * twitchAmplitude * twitchWeight * pressureLoad;
  float commonTumbleAngle = adherenceAngle + flipAngle;
  float positionTumbleAngle = terrainProjectSmoothSignedLimit(
    commonTumbleAngle + twitchAngle * clamp(material_WindFlutterTuning.y, 0.0, 1.0),
    max(maximumAdherenceAngle + tumbleAmplitude + twitchAmplitude, 0.0001)
  ) * normalResponse;
  float normalTumbleAngle = terrainProjectSmoothSignedLimit(
    commonTumbleAngle + twitchAngle,
    max(maximumAdherenceAngle + tumbleAmplitude + twitchAmplitude, 0.0001)
  ) * normalResponse;
  float positionTumbleCosine = cos(positionTumbleAngle);
  float positionTumbleSine = sin(positionTumbleAngle);
  localPositionWS = terrainProjectRotateAroundAxisSinCos(
    localPositionWS,
    leafAdherenceAxisWS,
    positionTumbleCosine,
    positionTumbleSine
  );
  float normalTumbleCosine = normalTumbleAngle == positionTumbleAngle
    ? positionTumbleCosine
    : cos(normalTumbleAngle);
  float normalTumbleSine = normalTumbleAngle == positionTumbleAngle
    ? positionTumbleSine
    : sin(normalTumbleAngle);
  normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
    normalWS,
    leafAdherenceAxisWS,
    normalTumbleCosine,
    normalTumbleSine
  ));
  #ifdef NEED_VERTEX_TANGENT
    tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
      tangentWS,
      leafAdherenceAxisWS,
      normalTumbleCosine,
      normalTumbleSine
    ));
  #endif

  // The UE rigid-leaf result remains the base pose. P3's optional blade compliance adds only a
  // root-to-tip differential around the same anchor, retaining exact connection at spanWeight=0.
  float bladeFlexAngle = positionTumbleAngle * clamp(spanWeight, 0.0, 1.0) *
    clamp(bladeFlexion, 0.0, 1.0) * 0.22;
  float bladeFlexCosine = cos(bladeFlexAngle);
  float bladeFlexSine = sin(bladeFlexAngle);
  localPositionWS = terrainProjectRotateAroundAxisSinCos(
    localPositionWS,
    leafAdherenceAxisWS,
    bladeFlexCosine,
    bladeFlexSine
  );
  normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
    normalWS,
    leafAdherenceAxisWS,
    bladeFlexCosine,
    bladeFlexSine
  ));
  #ifdef NEED_VERTEX_TANGENT
    tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
      tangentWS,
      leafAdherenceAxisWS,
      bladeFlexCosine,
      bladeFlexSine
    ));
  #endif
  positionWS = attachmentWS + localPositionWS;
  return positionWS;
}

vec3 terrainProjectApplyHeroLeafRipple(
  vec3 positionWS,
  vec3 attachmentWS,
  vec3 leafNormalWS,
  float spanWeight,
  float rippleSignal,
  float rippleWeight,
  float pressureLoad
) {
  // SpeedTree ripple is a separate positional mode. The P3 root-edge asset contract multiplies
  // it by the baked span coordinate, so the visible blade ripples without opening its attachment.
  float leverLength = length(positionWS - attachmentWS);
  float pinnedSpanWeight = pow(clamp(spanWeight, 0.0, 1.0), 1.35);
  float rippleDistance = leverLength * 0.045 * rippleSignal * rippleWeight *
    pressureLoad * pinnedSpanWeight;
  return positionWS + leafNormalWS * rippleDistance;
}
#endif

TerrainProjectWindSample terrainProjectSampleWind(
  vec3 positionWS,
  vec3 originWS,
  Attributes attributes,
  float windLod,
  TerrainProjectWindReceiverProfile loadProfile,
  TerrainProjectWindReceiverProfile microProfile
) {
  TerrainProjectWindSample result;
  float phase = terrainProjectWindReceiverPhase(originWS, attributes);
  float macroInverseScale = scene_WindSpectrumParams.x;
  vec2 horizontalDirection = scene_WindFieldParams.x > 0.0001
    ? normalize(scene_WindVelocity.xz)
    : vec2(1.0, 0.0);
  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    horizontalDirection = scene_GroundWindMotion.xy;
  #endif
  // A stateless vertex receiver cannot integrate a full oscillator. Bound the authored phase lag
  // by half of its dominant response period so it cannot jump into an unrelated wind packet.
  float naturalFrequencyScale = 1.0;
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    naturalFrequencyScale = max(material_WindSpeciesParams.x, 0.1);
  #endif
  float boundedResponseLag = min(
    loadProfile.responseLagSeconds,
    0.5 / max(loadProfile.naturalFrequencyHz * naturalFrequencyScale, 0.001)
  );
  vec2 spectrumPosition = positionWS.xz;
  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    spectrumPosition = originWS.xz;
  #elif defined(MATERIAL_WIND_GROUND_VEGETATION)
    spectrumPosition = mix(
      originWS.xz,
      positionWS.xz,
      clamp(material_WindGroundShapeParams.x, 0.0, 1.0)
    );
  #endif
  #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && (defined(MATERIAL_VEGETATION_CLIMATE_BRANCH) || defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
    // A tree crown is one mechanical structure. Keep its load coherent while retaining
    // a small spatial term so a travelling gust can still cross the crown instead of
    // every vertex sampling an unrelated part of the macro spectrum.
    spectrumPosition = mix(originWS.xz, positionWS.xz, 0.12);
  #endif
  // A frozen spectrum travels by the integral of wind velocity. Using absolute time multiplied
  // by the current velocity adds a non-physical t * dv/dt phase velocity whenever weather changes,
  // making every consumer jump in synchrony. The scene-owned integrated offset remains continuous.
  vec2 currentSpectrumUv = spectrumPosition * macroInverseScale -
    scene_WindSpectrumAdvectionOffset.xz * macroInverseScale * 0.12;
  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    currentSpectrumUv = terrainProjectGroundWindBroadUv(spectrumPosition);
  #endif
  #if defined(MATERIAL_WIND_SLOD_REDUCED) || defined(MATERIAL_WIND_SLOD_FAR)
    // Medium/far trees already sample the shared GPU primary response. Keep the LOD1 coherent
    // branch band below, but do not pay one advected-spectrum lookup per vertex for sub-pixel detail.
    vec4 currentPackedSpectrum = vec4(0.5);
  #else
    vec4 currentPackedSpectrum = texture2D(scene_WindSpectrumTexture, currentSpectrumUv);
  #endif
  vec4 packedSpectrum = currentPackedSpectrum;
  result.elasticMemory = 0.0;
  result.groundResponseVelocity = 0.0;
  #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && !defined(MATERIAL_WIND_SLOD_REDUCED) && (defined(MATERIAL_VEGETATION_CLIMATE_BRANCH) || defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
    // The spectrum is a frozen spatial field advected in time, so a second lookup is a
    // deterministic delayed load rather than synthetic noise. The residual models energy
    // retained by the branch after a gust without adding per-vertex CPU or texture state.
    vec2 laggedAdvectionOffset = scene_WindSpectrumAdvectionOffset.xz -
      scene_WindVelocity.xz * boundedResponseLag;
    vec2 laggedSpectrumUv = spectrumPosition * macroInverseScale -
      laggedAdvectionOffset * macroInverseScale * 0.12;
    vec4 laggedPackedSpectrum = texture2D(scene_WindSpectrumTexture, laggedSpectrumUv);
    float responseRetention = exp(
      -max(loadProfile.naturalFrequencyHz * naturalFrequencyScale, 0.001) * boundedResponseLag * 3.14159265
    );
    packedSpectrum = mix(currentPackedSpectrum, laggedPackedSpectrum, 0.42 + responseRetention * 0.36);
    float currentMacroMagnitude = abs(currentPackedSpectrum.r * 2.0 - 1.0);
    float laggedMacroMagnitude = abs(laggedPackedSpectrum.r * 2.0 - 1.0);
    result.elasticMemory = clamp(
      max(laggedMacroMagnitude - currentMacroMagnitude, 0.0) * material_WindHierarchyParams.w *
        material_WindInputWeights.z,
      0.0,
      1.0
    );
  #endif
  // The packed periodic spectrum is symmetric around the midpoint between bytes 127 and 128.
  // Decode around 0.5 so a perfectly balanced field has no persistent directional load.
  vec4 spectrum = packedSpectrum * 2.0 - 1.0;
  result.macro = clamp(spectrum.r, -1.0, 1.0);
  result.groundWave = result.macro;
  result.groundDetail = 0.0;
  #if defined(MATERIAL_WIND_GRASS_FLOWER_FIELD) && !defined(MATERIAL_WIND_SLOD_REDUCED) && !defined(MATERIAL_WIND_SLOD_FAR)
    vec2 groundDetailSpectrumUv = terrainProjectGroundWindDetailUv(spectrumPosition);
    float groundBroadNoise = currentPackedSpectrum.r;
    float groundDetailNoise = texture2D(scene_WindSpectrumTexture, groundDetailSpectrumUv).r;
    result.groundWave = terrainProjectGroundWindAngle(groundBroadNoise, groundDetailNoise);
    result.groundDetail = groundDetailNoise * 2.0 - 1.0;
  #endif
  vec2 localVelocity = vec2(0.0);
  vec2 spatialGustVelocity = vec2(0.0);
  float localTurbulence = 0.0;
  float microSpectrumSignal = 0.0;
  float periodicFlutterSignal = 0.0;
  float microLodWeight = 0.0;
  result.exposure = 1.0;
  result.turbulence = scene_WindFieldParams.z;
  result.localFieldWeight = 0.0;
  float presentedReferenceGust = scene_WindFieldParams.y;
  #ifdef TERRAIN_PROJECT_WIND_BILLBOARD
    result.meso = 0.0;
    result.micro = 0.0;
  #else
    float mesoWeight = 1.0 - smoothstep(1.45, 2.0, windLod);
    #ifdef MATERIAL_WIND_FULL_FIDELITY_LOD
      // Full-fidelity comparison mode keeps receiver bandwidth independent of geometry LOD and
      // camera distance. Otherwise an LOD2 mesh can select the complete shader variant while the
      // generic distance gate silently removes the same micro band again at sampling time.
      microLodWeight = 1.0;
    #else
      microLodWeight = 1.0 - smoothstep(0.45, 1.0, windLod);
    #endif
    result.meso = clamp(spectrum.g, -1.0, 1.0) * mesoWeight;
    result.micro = 0.0;
    #ifndef MATERIAL_WIND_GRASS_FLOWER_FIELD
    #if !defined(MATERIAL_WIND_SLOD_REDUCED) && !defined(MATERIAL_WIND_SLOD_FAR)
    if (microLodWeight > 0.0) {
      // Natural cadence belongs to the receiver, not to the advected air sample. Deriving
      // frequency from spectrum.a makes it f(t); multiplying that by absolute runtime creates
      // the non-physical t * df/dt phase velocity and eventually aliases even a smooth weather
      // transition. The stable receiver phase keeps the same per-instance decorrelation without
      // adding state, another lookup, or a second wind field.
      float flutterFrequencyDecorrelator = phase * 2.0 - 1.0;
      float flutterFrequencyHz = terrainProjectWindFlutterFrequencyHz(
        flutterFrequencyDecorrelator,
        microProfile
      );
      #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
        flutterFrequencyHz *= max(material_WindFlutterTuning.x, 0.01);
      #endif
      #ifdef MATERIAL_WIND_GROUND_VEGETATION
        flutterFrequencyHz *= max(material_WindGroundWaveParams.w, 0.05);
        float groundVerticalPhase = terrainProjectVegetationVertexColorWeight(attributes) *
          material_WindGroundShapeParams.z * 6.2831853;
      #else
        float groundVerticalPhase = 0.0;
      #endif
      #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
        float receiverClockSeconds = scene_GroundWindMotion.w;
      #else
        float receiverClockSeconds = scene_WindFieldParams.w;
      #endif
      periodicFlutterSignal = sin(
        receiverClockSeconds * flutterFrequencyHz * 6.2831853 +
          phase * 6.2831853 + groundVerticalPhase
      );
      microSpectrumSignal = spectrum.b;
      #ifdef MATERIAL_WIND_GROUND_VEGETATION
        // The packed B band contains fourteen cycles in sixty-four R8 texels. Bilinear sampling
        // keeps its value continuous, but only ~4.6 texels describe one cycle, so its derivative
        // changes at the 5 Hz texel-crossing cadence of a 12 m/s gale. Feeding that piecewise-linear
        // signal directly into the blade angle is visible as silhouette chatter. Ground receivers
        // already own a smooth, species-frequency oscillator with stable per-component phase;
        // macro/meso retain the shared spatial wheat wave, while turbulence controls this bounded
        // differential mode's energy. Tree and leaf consumers keep the packed micro band below.
        result.micro = periodicFlutterSignal * microLodWeight;
      #else
        result.micro = clamp(microSpectrumSignal * 0.65 + periodicFlutterSignal * 0.35, -1.0, 1.0) *
          microLodWeight;
      #endif
    }
    #endif

    #ifdef MATERIAL_WIND_FULL_FIDELITY_LOD
      float localWeight = 1.0;
    #else
      float localWeight = 1.0 - smoothstep(0.62, 1.0, windLod);
    #endif
    vec2 localUv = (positionWS.xz - scene_WindLocalFieldTransform.xy) *
      scene_WindLocalFieldTransform.z + 0.5;
    vec2 clampedLocalUv = clamp(localUv, 0.0, 1.0);
    #if defined(MATERIAL_WIND_GROUND_VEGETATION) && (defined(MATERIAL_VEGETATION_CLIMATE_GRASS) || defined(MATERIAL_VEGETATION_CLIMATE_FLOWER) || defined(MATERIAL_VEGETATION_CLIMATE_SHRUB))
      #if defined(MATERIAL_VEGETATION_CLIMATE_FLOWER)
        vec2 retainedGroundState = texture2D(scene_WindFlowerResponseTexture, clampedLocalUv).xy;
        vec2 retainedGroundParams = scene_WindFlowerResponseParams.xy;
      #elif defined(MATERIAL_VEGETATION_CLIMATE_GRASS)
        vec2 retainedGroundState = texture2D(scene_WindGroundResponseTexture, clampedLocalUv).zw;
        vec2 retainedGroundParams = scene_WindGroundResponseParams.zw;
      #else
        vec2 retainedGroundState = texture2D(scene_WindGroundResponseTexture, clampedLocalUv).xy;
        vec2 retainedGroundParams = scene_WindGroundResponseParams.xy;
      #endif
      // The response texture stores the state at the last completed 12 Hz interval. Outside the
      // detailed local-field branch, predict only over the bounded remainder of the current
      // interval. Its outer texels are solved against the shared reference gust, so clamped UVs
      // preserve one retained response for distant vegetation instead of reverting to raw gust.
      float retainedGroundElapsed = min(
        max(scene_WindLocalFieldTemporalParams.w, 0.0),
        max(scene_WindGroundResponseRampDuration, 0.0001)
      );
      vec2 presentedGroundResponse = vec2(
        retainedGroundState.x + retainedGroundState.y * retainedGroundElapsed,
        retainedGroundState.y
      );
      presentedReferenceGust = presentedGroundResponse.x;
      result.groundResponseVelocity = presentedGroundResponse.y;
    #endif
    #if !defined(MATERIAL_WIND_SLOD_REDUCED) && !defined(MATERIAL_WIND_SLOD_FAR)
    if (localWeight > 0.0) {
      float inside = step(0.0, localUv.x) * step(0.0, localUv.y) *
        step(localUv.x, 1.0) * step(localUv.y, 1.0);
      vec2 edgeDistance = min(clampedLocalUv, vec2(1.0) - clampedLocalUv);
      float localFieldEdgeWeight = smoothstep(0.0, 0.04, min(edgeDistance.x, edgeDistance.y));
      vec4 currentPackedLocal = texture2D(scene_WindLocalFieldTexture, clampedLocalUv);
      vec4 previousPackedLocal = texture2D(scene_WindLocalFieldPreviousTexture, clampedLocalUv);
      // The raster field is revised at a capped cadence. Interpolating the two retained slices
      // makes the sampled air load value-continuous when current becomes previous on a refresh.
      // Every ground receiver integrates the gust envelope through the two canonical response
      // modes below. The state belongs to the shared world-space field rather than to individual
      // instances: dense grass gains finite mechanical acceleration while retaining one batched
      // draw and no per-blade state.
      vec4 packedLocal = mix(
        previousPackedLocal,
        currentPackedLocal,
        clamp(scene_WindLocalFieldTemporalParams.x, 0.0, 1.0)
      );
      float responseFieldWeight = inside * localFieldEdgeWeight;
      float weightedInside = responseFieldWeight * localWeight;
      result.localFieldWeight = weightedInside;
      float previousSampledExposure = texture2D(
        scene_WindLocalFieldPreviousExposureTexture,
        clampedLocalUv
      ).r;
      float currentSampledExposure = texture2D(scene_WindLocalFieldExposureTexture, clampedLocalUv).r;
      float sampledExposure = mix(
        previousSampledExposure,
        currentSampledExposure,
        clamp(scene_WindLocalFieldTemporalParams.y, 0.0, 1.0)
      );
      vec2 previousEmitterVelocity = previousPackedLocal.rg;
      vec2 currentEmitterVelocity = currentPackedLocal.rg;
      vec2 presentedEmitterVelocity = packedLocal.rg;
      float presentedGust = packedLocal.a;
      #if defined(MATERIAL_WIND_GROUND_VEGETATION) && (defined(MATERIAL_VEGETATION_CLIMATE_GRASS) || defined(MATERIAL_VEGETATION_CLIMATE_FLOWER) || defined(MATERIAL_VEGETATION_CLIMATE_SHRUB))
        float responseElapsed = max(scene_WindLocalFieldTemporalParams.w, 0.0);
        float previousResponseTarget = mix(
          scene_WindGroundReferenceGustHistory.y,
          previousPackedLocal.a,
          responseFieldWeight
        );
        float currentResponseTarget = mix(
          scene_WindGroundReferenceGustHistory.z,
          currentPackedLocal.a,
          responseFieldWeight
        );
        presentedGroundResponse = terrainProjectAdvanceDampedRampResponse(
          retainedGroundState,
          previousResponseTarget,
          currentResponseTarget,
          retainedGroundParams.x,
          retainedGroundParams.y,
          scene_WindGroundResponseRampDuration,
          responseElapsed
        );
        presentedGust = presentedGroundResponse.x;
        presentedReferenceGust = presentedGroundResponse.x;
        result.groundResponseVelocity = presentedGroundResponse.y;
      #endif
      vec2 previousGustVelocity = scene_WindVelocity.xz * previousPackedLocal.a;
      vec2 currentGustVelocity = scene_WindVelocity.xz * currentPackedLocal.a;
      spatialGustVelocity = scene_WindVelocity.xz * presentedGust * weightedInside;
      localVelocity = (presentedEmitterVelocity + scene_WindVelocity.xz * presentedGust) * weightedInside;
      result.elasticMemory = clamp(
        result.elasticMemory +
          (
            max(length(previousEmitterVelocity) - length(currentEmitterVelocity), 0.0) *
              material_WindInputWeights.w +
            max(length(previousGustVelocity) - length(currentGustVelocity), 0.0) *
              material_WindInputWeights.y
          ) * 0.08 * weightedInside * material_WindHierarchyParams.w,
        0.0,
        1.0
      );
      result.exposure = mix(1.0, sampledExposure, weightedInside);
      localTurbulence = packedLocal.b * weightedInside;
      result.turbulence = max(
        scene_WindFieldParams.z * result.exposure,
        localTurbulence
      );
    }
    #endif
    #endif
  #endif

  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    localVelocity = vec2(0.0);
    spatialGustVelocity = vec2(0.0);
    result.elasticMemory = 0.0;
    result.groundResponseVelocity = 0.0;
    result.exposure = 1.0;
    result.localFieldWeight = 0.0;
    result.turbulence = scene_GroundWindShape.z;
    presentedReferenceGust = 0.0;
  #endif

  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    // Macro contrast creates broad wheat-wave bands. Meso gain is the bounded, per-species
    // turbulence response; neither control adds a lookup or invents a second wind field.
    result.meso *= max(material_WindGroundWaveParams.y, 0.0);
  #endif

  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    result.macro *= material_WindInputWeights.z;
    result.meso *= material_WindInputWeights.z;
    result.micro *= material_WindInputWeights.z;
    result.elasticMemory *= material_WindAerodynamicWeights.x;
  #endif

  float heightAboveRoot = max(positionWS.y - originWS.y, 0.0);
  float layer = mix(
    scene_WindLayerMultipliers.x,
    scene_WindLayerMultipliers.y,
    smoothstep(0.8, 4.0, heightAboveRoot)
  );
  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    vec3 baseVelocity = vec3(
      scene_GroundWindMotion.x * scene_GroundWindMotion.z,
      0.0,
      scene_GroundWindMotion.y * scene_GroundWindMotion.z
    );
  #else
    vec3 baseVelocity = scene_WindVelocity * layer;
  #endif
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    float meanHorizontalSpeed = length(baseVelocity.xz);
    float lockedDirectionLength = length(material_WindLockedDirectionWS.xz);
    if (meanHorizontalSpeed > 0.0001 && lockedDirectionLength > 0.0001) {
      vec2 currentMeanDirection = baseVelocity.xz / meanHorizontalSpeed;
      vec2 lockedMeanDirection = material_WindLockedDirectionWS.xz / lockedDirectionLength;
      vec2 trackedMeanDirection = terrainProjectMixHorizontalDirection(
        lockedMeanDirection,
        currentMeanDirection,
        material_WindAerodynamicWeights.w
      );
      baseVelocity.xz = trackedMeanDirection * meanHorizontalSpeed;
    }
  #endif
  vec3 velocity = baseVelocity;
  vec3 steadyVelocity = baseVelocity;
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    velocity *= material_WindInputWeights.x;
    steadyVelocity *= material_WindInputWeights.x;
  #endif
  // Near-field RG already contains the spatial travelling-gust delta. Fade the cheaper
  // reference-position scalar out by the same SLOD/field weight so it is never counted twice.
  float referenceGustWeight = 1.0 - result.localFieldWeight;
  float gustWeight = 1.0;
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    gustWeight = material_WindInputWeights.y;
  #endif
  velocity += baseVelocity * (
    presentedReferenceGust * referenceGustWeight * gustWeight +
    result.macro * (0.08 + result.turbulence * 0.12)
  );
  float horizontalSpeed = length(velocity.xz);
  if (horizontalSpeed > 0.0001) {
    vec2 direction = velocity.xz / horizontalSpeed;
    velocity.xz += vec2(-direction.y, direction.x) *
      horizontalSpeed * result.meso * result.turbulence * scene_WindSpectrumParams.w;
  }
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    // RG contains emitter velocity only; A owns the aligned travelling packet. Apply the two
    // independent panel controls after reconstructing both physical components.
    localVelocity =
      (localVelocity - spatialGustVelocity) * material_WindInputWeights.w +
      spatialGustVelocity * material_WindInputWeights.y;
    result.exposure = mix(1.0, result.exposure, material_WindInputWeights.w);
    result.turbulence = max(
      scene_WindFieldParams.z * result.exposure * material_WindInputWeights.z,
      localTurbulence * material_WindInputWeights.w
    );
    result.localFieldWeight *= material_WindInputWeights.w;
  #endif
  velocity *= result.exposure;
  velocity.xz += localVelocity;
  steadyVelocity *= result.exposure;
  result.velocityWS = velocity;
  result.steadyHorizontalSpeed = length(steadyVelocity.xz);
  #if defined(MATERIAL_WIND_GROUND_VEGETATION) && !defined(MATERIAL_VEGETATION_CLIMATE_GRASS)
    // Flower heads and woody shrub cards retain their authored high-speed area reduction here.
    // Grass applies one receiver/material envelope at the final differential-angle stage below;
    // applying both envelopes made its gale tip mode collapse to about five percent.
    float groundGaleMicroWeight = mix(
      1.0,
      clamp(material_WindGroundShapeParams.w, 0.0, 1.0),
      smoothstep(5.0, 11.0, length(result.velocityWS.xz))
    );
    result.micro *= groundGaleMicroWeight *
      mix(0.55, 1.0, clamp(material_WindGroundWaveParams.y, 0.0, 1.0));
  #endif
  #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF) && !defined(MATERIAL_WIND_SLOD_REDUCED)
    // Card flutter is an aerodynamic instability, not an oscillator that should run at full
    // cadence in every non-zero wind. Keep breeze motion on the advected micro spectrum, then
    // introduce the 4.8-7.2 Hz shedding band continuously only as both speed and turbulence
    // cross their onset ranges. This removes sub-pixel alpha-card chatter without hiding the
    // high-frequency leaf response that a strong, disordered flow should produce.
    float flutterRelativeSpeed = length(result.velocityWS.xz);
    float flutterSpeedInstability = smoothstep(4.0, 8.0, flutterRelativeSpeed);
    float flutterTurbulenceInstability = smoothstep(0.16, 0.42, result.turbulence);
    float periodicFlutterActivity = flutterSpeedInstability * flutterTurbulenceInstability;
    result.micro = clamp(
      microSpectrumSignal * 0.78 + periodicFlutterSignal * 0.22 * periodicFlutterActivity,
      -1.0,
      1.0
    ) * microLodWeight;
    result.micro *= material_WindInputWeights.z;
  #endif
  return result;
}

float terrainProjectCompliantBend(float requestedAngle, float maximumAngle) {
  // A reconfiguring crown yields progressively less projected area. This continuous
  // asymptote preserves resistance and recovery without the derivative jump of a hard clamp.
  float safeMaximum = max(maximumAngle, 0.0001);
  return safeMaximum * (1.0 - exp(-max(requestedAngle, 0.0) / safeMaximum));
}

float terrainProjectWindReceiverSpeed(
  TerrainProjectWindSample wind,
  TerrainProjectWindReceiverProfile profile
) {
  return max(
    0.0,
    mix(wind.steadyHorizontalSpeed, length(wind.velocityWS.xz), profile.dynamicGain)
  ) * profile.bendGain;
}

float terrainProjectWindBendAngle(
  TerrainProjectWindSample wind,
  TerrainProjectWindReceiverProfile profile,
  float flow,
  float structuralWeight
) {
  float physicalSpeed = max(
    0.0,
    mix(wind.steadyHorizontalSpeed, length(wind.velocityWS.xz), profile.dynamicGain)
  );
  float receiverSpeed = terrainProjectWindReceiverSpeed(wind, profile);
  // Dynamic pressure is a property of the air velocity, not of the receiver's bend-gain.
  // Normalizing after bend-gain postponed v² loading until implausibly high wind speeds and
  // made a 12 m/s gale look only marginally stronger than a breeze.
  float normalizedSpeed = physicalSpeed / 8.0;
  // Dynamic pressure grows with v². A yielding crown simultaneously reduces projected
  // area, so the rational reconfiguration term prevents an unbounded gale response while
  // retaining visibly stronger loading than the old linear approximation.
  float quadraticEquivalentSpeed = receiverSpeed * max(normalizedSpeed, 0.0);
  #ifdef MATERIAL_VEGETATION_CLIMATE_FLOWER
    // A flower keeps one base hinge and a rigid stem/head silhouette while its wind load saturates.
    float nonlinearBlend = smoothstep(0.4, 1.0, normalizedSpeed);
    float reconfigurationCoefficient = 0.72;
    float grassLodgingGain = mix(1.0, 1.9, smoothstep(0.68, 1.3, normalizedSpeed));
  #elif defined(MATERIAL_VEGETATION_CLIMATE_GRASS)
    // Flexible blades enter the dynamic-pressure regime well before woody structures. The
    // smooth onset preserves a restrained breeze while allowing a gale to create real lodging;
    // projected-area reduction keeps the response bounded after the blade aligns with the flow.
    float nonlinearBlend = smoothstep(0.35, 1.05, normalizedSpeed);
    float reconfigurationCoefficient = 0.55;
    // Once flexible stems enter the gale regime their low-frequency equilibrium travels much
    // farther toward the airflow. This is lodging rather than flutter: it changes only the
    // quasi-static load and therefore does not amplify the high-frequency oscillators.
    float grassLodgingGain = mix(1.0, 2.4, smoothstep(0.70, 1.35, normalizedSpeed));
  #else
    float nonlinearBlend = 0.0;
    float reconfigurationCoefficient = 1.0;
    float grassLodgingGain = 1.0;
  #endif
  float retainedEnergyAngle = 0.0;
  #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
    nonlinearBlend = smoothstep(0.62, 1.45, normalizedSpeed) *
      material_WindHierarchyParams.z * material_WindAerodynamicWeights.y;
    reconfigurationCoefficient = max(material_WindSpeciesParams.z, 0.01);
    retainedEnergyAngle = profile.maximumBendRadians * wind.elasticMemory *
      material_WindSpeciesParams.w * mix(0.45, 1.0, nonlinearBlend);
  #endif
  // A Vogel-style projected-area reduction turns pure v^2 pressure into a bounded
  // sub-quadratic crown load after the foliage begins to streamline in a gale.
  float reconfiguration = pow(
    1.0 + max(normalizedSpeed - 0.65, 0.0) * reconfigurationCoefficient,
    -0.67 * nonlinearBlend
  );
  float aerodynamicSpeed = mix(receiverSpeed, quadraticEquivalentSpeed, nonlinearBlend) *
    reconfiguration * grassLodgingGain;
  return terrainProjectCompliantBend(
    aerodynamicSpeed * material_WindForce * 0.045 * flow * structuralWeight + retainedEnergyAngle * structuralWeight,
    profile.maximumBendRadians
  );
}

#if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)
vec3 terrainProjectHeroTreeOscillation(
  vec3 structurePositionWS,
  vec3 originWS,
  TerrainProjectWindReceiverProfile profile,
  float flexibility,
  float stiffnessWeight,
  float phaseCoordinate,
  float windLod,
  float turbulence,
  float elasticMemory,
  out vec2 leafHierarchyOscillation
) {
  vec3 stem = structurePositionWS - originWS;
  float instanceTimeOffset = terrainProjectTreePhase(originWS);
  // Phase travels from the lower/stiffer structure towards flexible tips. The first
  // oscillator is the parent branch, while the incommensurate second oscillator is
  // the relative child-branch recovery. Both remain analytical and allocation-free.
  float propagationPhase = dot(stem, vec3(0.095, 0.055, 0.081));
  float phasePropagationScale = max(material_WindSpeciesParams.y, 0.0);
  // The feature weight and its calibration scale own the complete spatial phase offset.
  // When either reaches zero, connected levels may still have different natural frequencies
  // from their stiffness, but they start from one coherent parent phase instead of retaining
  // hidden per-branch offsets in the secondary and tip bands.
  float phaseTravel = clamp(material_WindStructureWeights.w, 0.0, 1.0) * phasePropagationScale;
  float delayedPhase = (
    propagationPhase -
    flexibility +
    (1.0 - stiffnessWeight) * 0.65 +
    phaseCoordinate * 0.47
  ) * phaseTravel;
  float angularFrequency = max(
    profile.naturalFrequencyHz * max(material_WindSpeciesParams.x, 0.1) *
      mix(0.82, 1.28, stiffnessWeight),
    0.001
  ) * 6.2831853;
  float responseTime = (scene_WindFieldParams.w + instanceTimeOffset) * angularFrequency;
  // A tree never receives a perfectly periodic load. Blend a dominant slow sway
  // with two progressively smaller bands governed by the physical wind sample.
  #ifdef MATERIAL_WIND_SLOD_REDUCED
    // Medium-distance receivers preserve two parent-correlated low bands. This is enough to
    // retain the non-rigid leaf silhouette through an LOD handoff while spectrum/local-field
    // texture reads and the high-frequency shedding band remain compiled out.
    float primary =
      sin(responseTime * 0.27 + delayedPhase * 0.73) * 0.72 +
      sin(responseTime * 0.61 - delayedPhase * 0.49) * 0.28;
    #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
      float secondary = sin(
        responseTime * 0.93 + delayedPhase * 1.21 + phaseCoordinate * 6.2831853
      ) * 0.82;
    #else
      float secondary = 0.0;
    #endif
    float tip = 0.0;
  #else
    float primary =
      sin(responseTime * 0.18) * 0.52 +
      sin(responseTime * 0.55 + delayedPhase * 1.17) * 0.30 +
      sin(responseTime * 0.92 + delayedPhase * 1.43) * 0.18;
    float secondary =
      sin(
        responseTime * 1.83 +
        delayedPhase * 1.71 + (propagationPhase * 1.43 - flexibility * 1.24) * phaseTravel
      ) * 0.68 +
      sin(
        responseTime * 2.47 +
        delayedPhase * 2.13 + (propagationPhase * 1.91 - flexibility * 1.57) * phaseTravel
      ) * 0.32;
    float tip =
      sin(responseTime * 3.17 + (phaseCoordinate * 6.2831853 + propagationPhase * 2.13) * phaseTravel) *
        0.62 +
      sin(responseTime * 4.73 + (phaseCoordinate * 9.173 + propagationPhase * 2.87) * phaseTravel) *
        0.38;
  #endif
  #ifdef MATERIAL_WIND_FULL_FIDELITY_LOD
    float secondaryLod = 1.0;
    float tipLod = 1.0;
  #else
    float secondaryLod = 1.0 - smoothstep(0.45, 1.15, windLod);
    float tipLod = 1.0 - smoothstep(0.22, 0.82, windLod);
  #endif
  float primaryEnergy = mix(0.32, 1.0, clamp(turbulence, 0.0, 1.0));
  float turbulentEnergy = clamp(turbulence, 0.0, 1.0);
  float releasedEnergy = clamp(elasticMemory, 0.0, 1.0);
  // Child foliage inherits the parent's phase and frequency, not its already-scaled
  // structural amplitude. Its local angular amplitude is governed once, later, by leaf
  // dynamic pressure and compliance. Returning the normalized bands avoids multiplying
  // breeze energy by primaryEnergy/turbulentEnergy a second time.
  leafHierarchyOscillation = vec2(primary, secondary * secondaryLod);
  return vec3(
    primary * (primaryEnergy + releasedEnergy * 0.18),
    secondary * secondaryLod * (turbulentEnergy + releasedEnergy * 0.55),
    tip * tipLod * (turbulentEnergy + releasedEnergy * 0.72)
  );
}

float terrainProjectHeroTrunkResponseHeightWS(Attributes attributes) {
  // The Euler-Bernoulli mode intentionally retains a non-zero free-tip slope. Its normalized
  // coordinate therefore must reach one at (or above) the actual authored top: clamping it at a
  // shorter calibration height changes the slope to zero in the middle of the trunk and creates
  // a mathematical hinge. Transform the source-mesh top as a vector so every Asset Assembly
  // instance carries its own scale without adding an instance uniform.
  float authoredTopOS = max(
    material_WindMechanicalBoundsMin.y + material_WindMechanicalBoundsExtent.y,
    0.001
  );
  float responseHeightOS = max(material_WindTrunkModeParams.x, authoredTopOS);
  return max(
    length(terrainProjectHeroVectorToWorld(vec3(0.0, responseHeightOS, 0.0), attributes)),
    0.001
  );
}

float terrainProjectHeroContinuousTrunkWeight(
  vec3 pointWS,
  vec3 originWS,
  float responseHeightWS
) {
  float normalizedHeight = clamp(
    (pointWS.y - originWS.y) / max(responseHeightWS, 0.001),
    0.0,
    1.0
  );
  // Normalized Euler-Bernoulli displacement under a crown-dominant load. Unlike smoothstep,
  // y = x^2(3L-x)/2 preserves the non-zero free-tip slope while keeping both displacement and
  // slope pinned at the root. The previous h^2(3-2h) imposed zero slope at the crown as well,
  // making the upper trunk move as one visually rigid block.
  float beamWeight = 0.5 * normalizedHeight * normalizedHeight * (3.0 - normalizedHeight);
  // A contrast of zero is the analytical beam. Positive contrast preserves the exact root/tip
  // endpoints while making the lower trunk progressively harder. The square is deliberately
  // used instead of another texture or branch: one multiply plus one mix keeps this mobile-safe.
  float rootRigidityContrast = clamp(material_WindTrunkModeParams.w, 0.0, 1.0);
  return mix(beamWeight, beamWeight * beamWeight, rootRigidityContrast);
}

float terrainProjectHeroMechanicalTrunkWeight(
  vec3 pointWS,
  vec3 originWS,
  float responseHeightWS,
  float localComplianceProgress,
  float mechanicalDepth
) {
  // The primary whole-tree mode is a continuous beam field. TEXCOORD_3.y is a geodesic
  // coordinate inside one authored component, not a cross-section coordinate: UV seams and
  // welded forks can give vertices on the same trunk ring different path lengths. Mixing it
  // into the primary mode shears a woody cross-section and concentrates curvature into a hard
  // fold. Thickness/distance compliance still drives the explicit child pivots below; the
  // shared trunk pose must depend only on the continuous spatial beam coordinate.
  return terrainProjectHeroContinuousTrunkWeight(pointWS, originWS, responseHeightWS);
}

vec3 terrainProjectApplyHeroContinuousTrunkMode(
  vec3 pointWS,
  vec3 originWS,
  float responseHeightWS,
  vec3 bendAxis,
  float bendAngle
) {
  float modeWeight = terrainProjectHeroContinuousTrunkWeight(pointWS, originWS, responseHeightWS);
  return originWS + terrainProjectRotateAroundAxis(pointWS - originWS, bendAxis, bendAngle * modeWeight);
}

vec3 terrainProjectApplyHeroMechanicalTrunkMode(
  vec3 pointWS,
  vec3 originWS,
  float responseHeightWS,
  vec3 bendAxis,
  float bendAngle,
  float localComplianceProgress,
  float mechanicalDepth
) {
  float modeWeight = terrainProjectHeroMechanicalTrunkWeight(
    pointWS,
    originWS,
    responseHeightWS,
    localComplianceProgress,
    mechanicalDepth
  );
  return originWS + terrainProjectRotateAroundAxis(pointWS - originWS, bendAxis, bendAngle * modeWeight);
}

vec3 terrainProjectApplyHeroTreeHierarchy(
  vec3 positionWS,
  vec3 originWS,
  float responseHeightWS,
  vec2 primaryResponse,
  vec3 structurePositionWS,
  vec3 stage0PivotWS,
  vec3 stage1PivotWS,
  vec3 stage2PivotWS,
  vec3 windDirection,
  vec3 bendAxis,
  float bendAngle,
  vec3 stageWeights,
  vec3 stageParentProgress,
  float mechanicalDepth,
  float localProgress,
  vec3 hierarchyOscillation,
  float normalResponse,
  vec3 leafHingeAxisWS,
  vec3 leafRestNormalWS,
  out vec3 deformedStructureWS,
  out vec3 deformedParentTangentWS,
  out vec3 deformedLeafHingeAxisWS,
  out vec3 deformedLeafRestNormalWS,
  inout vec3 normalWS,
  inout vec3 tangentWS
) {
  // The shared GPU vector-response basis owns the first whole-tree mode. Every stage below is a
  // fixed-depth, pre-expanded child element; mesh LOD only changes this spatial basis, never the
  // retained displacement/velocity history.
  vec3 continuousTrunkAxis = bendAxis;
  float primaryRootAngle = 0.0;
  terrainProjectHeroPrimaryRootModeFromResponse(
    primaryResponse,
    originWS,
    bendAxis,
    continuousTrunkAxis,
    primaryRootAngle
  );
  float continuousTrunkAngle = terrainProjectSmoothSignedLimit(
    primaryRootAngle * max(material_WindTrunkModeParams.y, 0.0),
    max(material_WindTrunkModeParams.z, 0.0001)
  );
  vec3 restPosition = positionWS;
  vec3 restStructure = structurePositionWS;
  vec3 restStage0Pivot = stage0PivotWS;
  vec3 restStage1Pivot = stage1PivotWS;
  vec3 restStage2Pivot = stage2PivotWS;
  vec3 restLeafHingeAxisWS = leafHingeAxisWS;
  vec3 restLeafNormalWS = leafRestNormalWS;
  vec3 rootPosition = restPosition;
  vec3 rootStructure = restStructure;
  vec3 rootStage0Pivot = restStage0Pivot;
  vec3 rootStage1Pivot = restStage1Pivot;
  vec3 rootStage2Pivot = restStage2Pivot;
  // A child subtree must inherit one rigid transform at the exact point where its first
  // component attaches to the continuous root mode. Applying the root mode separately by world
  // height to the child vertices and pivots would give one rigid child several parent poses and
  // violate C0 continuity at its authored attachment.
  float descendantSubtree = step(0.5, mechanicalDepth);
  vec3 rootModeAttachment = mix(restStructure, restStage0Pivot, descendantSubtree);
  float rootModeProgress = mix(localProgress, stageParentProgress.x, descendantSubtree);
  float continuousNormalWeight = terrainProjectHeroMechanicalTrunkWeight(
    rootModeAttachment,
    originWS,
    responseHeightWS,
    rootModeProgress,
    0.0
  );
  float attachmentTrunkAngle = continuousTrunkAngle * continuousNormalWeight;
  float attachmentTrunkCosine = cos(attachmentTrunkAngle);
  float attachmentTrunkSine = sin(attachmentTrunkAngle);
  vec3 continuousAttachment = originWS + terrainProjectRotateAroundAxisSinCos(
    rootModeAttachment - originWS,
    continuousTrunkAxis,
    attachmentTrunkCosine,
    attachmentTrunkSine
  );
  vec3 continuousStructure = continuousAttachment;
  if (descendantSubtree > 0.5) {
    // Transport the complete descendant frame with the parent's attachment rotation. This
    // preserves every rest-space distance to stage0 before any child-local bend is evaluated.
    rootPosition = continuousAttachment + terrainProjectRotateAroundAxisSinCos(
      rootPosition - rootModeAttachment,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    continuousStructure = continuousAttachment + terrainProjectRotateAroundAxisSinCos(
      rootStructure - rootModeAttachment,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    rootStage0Pivot = continuousAttachment;
    rootStage1Pivot = continuousAttachment + terrainProjectRotateAroundAxisSinCos(
      rootStage1Pivot - rootModeAttachment,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    rootStage2Pivot = continuousAttachment + terrainProjectRotateAroundAxisSinCos(
      rootStage2Pivot - rootModeAttachment,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    deformedLeafHingeAxisWS = terrainProjectRotateAroundAxisSinCos(
      restLeafHingeAxisWS,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    deformedLeafRestNormalWS = terrainProjectRotateAroundAxisSinCos(
      restLeafNormalWS,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
  } else {
  #ifdef MATERIAL_VEGETATION_CLIMATE_LEAF
    // A leaf is a rigid child of its woody attachment. Transport both the attachment and the
    // card's relative vector through the same solved trunk rotation. Translation-only transport
    // leaves the card in its rest orientation while the trunk tilts, which makes the foliage
    // appear more upright than its parent. Evaluating one attachment angle for the whole card
    // preserves its shape without applying the height curve independently to each vertex.
    rootPosition = continuousStructure + terrainProjectRotateAroundAxis(
      rootPosition - rootStructure,
      continuousTrunkAxis,
      attachmentTrunkAngle
    );
    deformedLeafHingeAxisWS = terrainProjectRotateAroundAxisSinCos(
      restLeafHingeAxisWS,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
    deformedLeafRestNormalWS = terrainProjectRotateAroundAxisSinCos(
      restLeafNormalWS,
      continuousTrunkAxis,
      attachmentTrunkCosine,
      attachmentTrunkSine
    );
  #else
    rootPosition = terrainProjectApplyHeroMechanicalTrunkMode(
      rootPosition,
      originWS,
      responseHeightWS,
      continuousTrunkAxis,
      continuousTrunkAngle,
      localProgress,
      mechanicalDepth
    );
    deformedLeafHingeAxisWS = restLeafHingeAxisWS;
    deformedLeafRestNormalWS = restLeafNormalWS;
  #endif
    rootStage0Pivot = terrainProjectApplyHeroMechanicalTrunkMode(
      rootStage0Pivot,
      originWS,
      responseHeightWS,
      continuousTrunkAxis,
      continuousTrunkAngle,
      localProgress,
      0.0
    );
    rootStage1Pivot = rootStage0Pivot;
    rootStage2Pivot = rootStage0Pivot;
  }
  rootStructure = continuousStructure;

  float stage0Motion = hierarchyOscillation.x;
  // Each ancestor stage is evaluated at the coordinate where its downstream child attaches.
  // The terminal stage alone uses the current vertex/card coordinate. This is the discrete
  // counterpart of sharing one parent pose at a welded joint.
  float stage0Local = mix(localProgress, stageParentProgress.y, step(1.5, mechanicalDepth));
  float stage0Compliance = stageWeights.x * stage0Local * material_WindHierarchyParams.x *
    material_WindStructureWeights.y;
  #ifdef MATERIAL_WIND_SLOD_REDUCED
    // LOD1 removes the two downstream pivots, but it must not remove their physical compliance.
    // Collapse their angular travel onto the retained parent pivot using representative remaining
    // lever-arm ratios. This preserves crown-tip displacement with one sin/cos pair and without
    // fetching either omitted transform. Some authored LOD1 meshes contain no child component at
    // all; in that case the retained stage is the only measurable proxy for the simplified-away
    // subtree. A self-similar lower bound prevents asset topology from silently deleting crown
    // travel, while max() preserves any stronger mechanically authored downstream compliance.
    float authoredCollapsedCompliance =
      stageWeights.y * 0.62 + stageWeights.z * 0.34;
    float selfSimilarCollapsedCompliance = stageWeights.x * (0.62 + 0.34);
    stage0Compliance += max(authoredCollapsedCompliance, selfSimilarCollapsedCompliance) *
      localProgress * material_WindHierarchyParams.y * material_WindStructureWeights.z;
  #endif
  float stage0Angle = bendAngle * stage0Compliance * (0.52 + stage0Motion * 0.24);
  vec3 stage0Axis = normalize(bendAxis + windDirection * stage0Motion * 0.09);
  vec3 resolvedPosition = rootPosition;
  deformedStructureWS = rootStructure;
  vec3 deformedStage1Pivot = rootStage1Pivot;
  vec3 deformedStage2Pivot = rootStage2Pivot;
  #if defined(MATERIAL_WIND_MECHANICAL_DEPTH_1) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_2) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)
    float stage0Cosine = cos(stage0Angle);
    float stage0Sine = sin(stage0Angle);
    resolvedPosition = rootStage0Pivot + terrainProjectRotateAroundAxisSinCos(
      resolvedPosition - rootStage0Pivot, stage0Axis, stage0Cosine, stage0Sine
    );
    deformedStructureWS = rootStage0Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStructureWS - rootStage0Pivot, stage0Axis, stage0Cosine, stage0Sine
    );
    deformedStage1Pivot = rootStage0Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStage1Pivot - rootStage0Pivot, stage0Axis, stage0Cosine, stage0Sine
    );
    deformedStage2Pivot = rootStage0Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStage2Pivot - rootStage0Pivot, stage0Axis, stage0Cosine, stage0Sine
    );
    deformedLeafHingeAxisWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafHingeAxisWS,
      stage0Axis,
      stage0Cosine,
      stage0Sine
    );
    deformedLeafRestNormalWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafRestNormalWS,
      stage0Axis,
      stage0Cosine,
      stage0Sine
    );
  #endif

  float stage1Angle = 0.0;
  vec3 stage1Axis = stage0Axis;
  #if defined(MATERIAL_WIND_MECHANICAL_DEPTH_2) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)
    float stage1Local = mix(localProgress, stageParentProgress.z, step(2.5, mechanicalDepth));
    float stage1Motion = hierarchyOscillation.y;
    stage1Axis = normalize(bendAxis + windDirection * stage1Motion * 0.13);
    stage1Angle = bendAngle * stageWeights.y * stage1Local * material_WindHierarchyParams.y *
      material_WindStructureWeights.z * (0.48 + stage1Motion * 0.28);
    float stage1Cosine = cos(stage1Angle);
    float stage1Sine = sin(stage1Angle);
    resolvedPosition = deformedStage1Pivot + terrainProjectRotateAroundAxisSinCos(
      resolvedPosition - deformedStage1Pivot, stage1Axis, stage1Cosine, stage1Sine
    );
    deformedStructureWS = deformedStage1Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStructureWS - deformedStage1Pivot, stage1Axis, stage1Cosine, stage1Sine
    );
    deformedStage2Pivot = deformedStage1Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStage2Pivot - deformedStage1Pivot, stage1Axis, stage1Cosine, stage1Sine
    );
    deformedLeafHingeAxisWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafHingeAxisWS,
      stage1Axis,
      stage1Cosine,
      stage1Sine
    );
    deformedLeafRestNormalWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafRestNormalWS,
      stage1Axis,
      stage1Cosine,
      stage1Sine
    );
  #endif

  float stage2Angle = 0.0;
  vec3 stage2Axis = stage1Axis;
  #if defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)
    float stage2Motion = hierarchyOscillation.z;
    stage2Axis = normalize(bendAxis + windDirection * stage2Motion * 0.17);
    stage2Angle = bendAngle * stageWeights.z * localProgress * material_WindHierarchyParams.y *
      material_WindStructureWeights.z * (0.44 + stage2Motion * 0.24);
    float stage2Cosine = cos(stage2Angle);
    float stage2Sine = sin(stage2Angle);
    resolvedPosition = deformedStage2Pivot + terrainProjectRotateAroundAxisSinCos(
      resolvedPosition - deformedStage2Pivot, stage2Axis, stage2Cosine, stage2Sine
    );
    deformedStructureWS = deformedStage2Pivot + terrainProjectRotateAroundAxisSinCos(
      deformedStructureWS - deformedStage2Pivot, stage2Axis, stage2Cosine, stage2Sine
    );
    deformedLeafHingeAxisWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafHingeAxisWS,
      stage2Axis,
      stage2Cosine,
      stage2Sine
    );
    deformedLeafRestNormalWS = terrainProjectRotateAroundAxisSinCos(
      deformedLeafRestNormalWS,
      stage2Axis,
      stage2Cosine,
      stage2Sine
    );
  #endif

  vec3 parentTangentVector = deformedStructureWS - deformedStage2Pivot;
  if (length(parentTangentVector) <= 0.0001) {
    parentTangentVector = deformedStage2Pivot - deformedStage1Pivot;
  }
  if (length(parentTangentVector) <= 0.0001) {
    vec3 attachmentUp = terrainProjectRotateAroundAxis(
      vec3(0.0, 1.0, 0.0),
      continuousTrunkAxis,
      attachmentTrunkAngle
    );
    attachmentUp = terrainProjectRotateAroundAxis(attachmentUp, stage0Axis, stage0Angle);
    attachmentUp = terrainProjectRotateAroundAxis(attachmentUp, stage1Axis, stage1Angle);
    parentTangentVector = terrainProjectRotateAroundAxis(attachmentUp, stage2Axis, stage2Angle);
  }
  deformedParentTangentWS = normalize(parentTangentVector);
  deformedLeafHingeAxisWS = normalize(deformedLeafHingeAxisWS);
  deformedLeafRestNormalWS = normalize(deformedLeafRestNormalWS);
  #if !defined(MATERIAL_WIND_NORMAL_NONE)
    float continuousNormalAngle = continuousTrunkAngle * continuousNormalWeight * normalResponse;
    float continuousNormalCosine = cos(continuousNormalAngle);
    float continuousNormalSine = sin(continuousNormalAngle);
    normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
      normalWS,
      continuousTrunkAxis,
      continuousNormalCosine,
      continuousNormalSine
    ));
    #ifdef NEED_VERTEX_TANGENT
      tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
        tangentWS,
        continuousTrunkAxis,
        continuousNormalCosine,
        continuousNormalSine
      ));
    #endif
  #endif
  #if (defined(MATERIAL_WIND_MECHANICAL_DEPTH_1) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_2) || defined(MATERIAL_WIND_MECHANICAL_DEPTH_3)) && (defined(MATERIAL_WIND_NORMAL_TRUNK) || defined(MATERIAL_WIND_NORMAL_PARENT) || defined(MATERIAL_WIND_NORMAL_HIERARCHICAL))
    float stage0NormalAngle = stage0Angle * normalResponse;
    float stage0NormalCosine = cos(stage0NormalAngle);
    float stage0NormalSine = sin(stage0NormalAngle);
    normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
      normalWS, stage0Axis, stage0NormalCosine, stage0NormalSine
    ));
    #ifdef NEED_VERTEX_TANGENT
      tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
        tangentWS, stage0Axis, stage0NormalCosine, stage0NormalSine
      ));
    #endif
  #endif
  #if defined(MATERIAL_WIND_NORMAL_PARENT) || defined(MATERIAL_WIND_NORMAL_HIERARCHICAL)
    float stage1NormalAngle = stage1Angle * normalResponse;
    float stage1NormalCosine = cos(stage1NormalAngle);
    float stage1NormalSine = sin(stage1NormalAngle);
    normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
      normalWS, stage1Axis, stage1NormalCosine, stage1NormalSine
    ));
    #ifdef NEED_VERTEX_TANGENT
      tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
        tangentWS, stage1Axis, stage1NormalCosine, stage1NormalSine
      ));
    #endif
  #endif
  #if defined(MATERIAL_WIND_NORMAL_HIERARCHICAL)
    float stage2NormalAngle = stage2Angle * normalResponse;
    float stage2NormalCosine = cos(stage2NormalAngle);
    float stage2NormalSine = sin(stage2NormalAngle);
    normalWS = normalize(terrainProjectRotateAroundAxisSinCos(
      normalWS, stage2Axis, stage2NormalCosine, stage2NormalSine
    ));
    #ifdef NEED_VERTEX_TANGENT
      tangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
        tangentWS, stage2Axis, stage2NormalCosine, stage2NormalSine
      ));
    #endif
  #endif
  return resolvedPosition;
}
#endif

#ifdef MATERIAL_WIND_PROCEDURAL_TREE
  #include "shared/ProceduralTreeWind.glsl"
#endif

#ifdef MATERIAL_WIND_PROCEDURAL_FLOWER
// sin(x)/x has a defined zero-angle limit. Its Taylor polynomial avoids cancellation
// and division by zero; the x^8 remainder is below float precision in the flower range.
float terrainProjectFlowerBeamSinc(float angle) {
  float squared = angle * angle;
  return 1.0 + squared * (-1.0 / 6.0 + squared * (1.0 / 120.0 +
    squared * (-1.0 / 5040.0 + squared / 362880.0)));
}
#endif

vec3 terrainProjectApplyVegetationWind(
  vec3 positionWS,
  vec3 originWS,
  Attributes attributes,
  inout vec3 normalWS,
  inout vec3 tangentWS,
  out float windShadingResponse,
  out vec3 groundWindDiagnostics,
  out vec3 groundWindCarrierNormalWS
) {
  #ifdef MATERIAL_WIND_PROCEDURAL_TREE
    return terrainProjectApplyProceduralTreeWind(
      positionWS,
      originWS,
      attributes,
      normalWS,
      tangentWS,
      windShadingResponse,
      groundWindDiagnostics,
      groundWindCarrierNormalWS
    );
  #else
  groundWindDiagnostics = vec3(0.0);
  groundWindCarrierNormalWS = vec3(0.0, 1.0, 0.0);
  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    groundWindDiagnostics.x = clamp(
      terrainProjectVegetationStructuralWeight(positionWS, originWS, attributes),
      0.0,
      1.0
    );
    groundWindDiagnostics.y = 0.5;
  #endif
  vec3 cameraOffsetFromOrigin = camera_Position - originWS;
  float cameraDistanceSquared = dot(cameraOffsetFromOrigin, cameraOffsetFromOrigin);
  float cameraDistanceToOrigin = sqrt(cameraDistanceSquared);
  vec3 windPositionWS = positionWS;
  vec3 windNormalWS = normalWS;
  vec3 windTangentWS = vec3(0.0);
  #ifdef NEED_VERTEX_TANGENT
    windTangentWS = tangentWS;
  #endif
  #ifdef MATERIAL_ENABLE_WIND
    float windAnimationEnabled = scene_WindAnimationEnabled;
    #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
      windAnimationEnabled = 1.0;
    #endif
    if (windAnimationEnabled > 0.5) {
      #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)
        float heroTrunkResponseHeightWS = terrainProjectHeroTrunkResponseHeightWS(attributes);
      #endif
      #if defined(MATERIAL_WIND_SLOD_FAR) || (defined(TERRAIN_PROJECT_SHADOW_CASTER_PASS) && defined(MATERIAL_WIND_HERO_TREE_HIERARCHY))
        // LOD2 and every tree shadow pass read the same retained displacement/velocity state as
        // the visible LOD0/1 geometry, but compile the spectrum, per-branch hierarchy and leaf
        // aerodynamics out. A directional shadow only needs the mechanically coherent aggregate
        // crown silhouette; repeating the full leaf solve for every shadow cascade multiplies
        // vertex cost without adding visible surface detail. The visible forward pass remains the
        // complete P3 hierarchy. Shadows retain root pinning and low-frequency crown travel; LOD2
        // forward rendering additionally keeps its screen-safe leaf-cluster mode.
        vec2 farPrimaryResponse = terrainProjectTreePrimaryResponse(originWS);
        vec2 farFallbackDirection = length(scene_WindVelocity.xz) > 0.0001
          ? normalize(scene_WindVelocity.xz)
          : vec2(1.0, 0.0);
        vec3 farFallbackAxis = vec3(farFallbackDirection.y, 0.0, -farFallbackDirection.x);
        vec3 farRootAxis;
        float farRootAngle;
        terrainProjectHeroPrimaryRootModeFromResponse(
          farPrimaryResponse,
          originWS,
          farFallbackAxis,
          farRootAxis,
          farRootAngle
        );
        // LOD2 has no explicit branch pivots. Its one crown mode folds the deleted hierarchy into
        // an equivalent tip-displacement gain authored from the same species hierarchy profile.
        // Scale both demand and travel so the aggregate mode remains linear before the mechanical
        // limiter instead of hitting the LOD0 trunk-only cap early.
        float farAggregateGain = max(material_WindTreePrimaryParams.w, 1.0);
        farRootAngle = terrainProjectSmoothSignedLimit(
          farRootAngle * max(material_WindTrunkModeParams.y, 0.0) * farAggregateGain,
          max(material_WindTrunkModeParams.z * farAggregateGain, 1e-4)
        );
        float farRootWeight = terrainProjectHeroContinuousTrunkWeight(
          positionWS,
          originWS,
          heroTrunkResponseHeightWS
        );
        windPositionWS = terrainProjectApplyHeroContinuousTrunkMode(
          positionWS,
          originWS,
          heroTrunkResponseHeightWS,
          farRootAxis,
          farRootAngle
        );
        float farLeafRelativeAngle = 0.0;
        #if defined(MATERIAL_VEGETATION_CLIMATE_LEAF) && !defined(TERRAIN_PROJECT_SHADOW_CASTER_PASS)
          // The LOD2 mesh still carries a card-coherent uint16 element ID and a root-tip
          // coordinate. Eight consecutive cards form one coarse aerodynamic cluster: this keeps
          // internal crown motion visible while filtering the per-leaf high band that would alias
          // at distance. The retained second-order response owns the envelope, so onset and
          // recovery remain continuous through gusts instead of switching an animation on/off.
          float farLeafElementIndex = floor(attributes.TEXCOORD_3.x * 65535.0 + 0.5);
          float farLeafClusterIndex = floor(farLeafElementIndex * 0.125);
          float farLeafClusterPhase = fract(
            farLeafClusterIndex * 0.61803398875 +
              dot(originWS.xz, vec2(0.06711056, 0.113693))
          );
          float farLeafFrequencyHz = mix(0.38, 0.62, farLeafClusterPhase) *
            max(material_WindSpeciesParams.x, 0.1) *
            max(material_WindFlutterTuning.x, 0.1);
          float farLeafClusterOscillation = sin(
            scene_WindFieldParams.w * farLeafFrequencyHz * 6.2831853 +
              farLeafClusterPhase * 6.2831853
          );
          float farLeafResponseLoad = 1.0 - exp(-length(farPrimaryResponse));
          // Mesh LOD removes geometry, not aerodynamic load. Preserve the same steady
          // downwind posture as the outgoing LOD1 crown, then reduce only sub-pixel angular
          // detail. LOD1's distance response is roughly 0.6-0.8 across the authored handoff,
          // so 0.62 keeps the cross-fade energy-continuous without restoring per-leaf work.
          float farLeafAdherenceAngle = material_WindLeafMotionParams.x * 0.62 *
            clamp(material_WindFoliageWeights.x, 0.0, 1.0) *
            max(material_WindFlutterTuning.w, 0.0);
          float farLeafClusterAngle = farLeafClusterOscillation *
            material_WindLeafMotionParams.y * 0.78 *
            clamp(material_WindFoliageWeights.y, 0.0, 1.0) *
            clamp(material_WindLeafBladeParams.y, 0.0, 1.0);
          float farLeafMeanAngle = farLeafResponseLoad * farLeafAdherenceAngle;
          float farLeafOscillationAngle = farLeafResponseLoad * farLeafClusterAngle;
          farLeafRelativeAngle = farLeafMeanAngle + farLeafOscillationAngle;
          float farLeafSpanWeight = clamp(attributes.TEXCOORD_3.y, 0.0, 1.0);
          vec2 farLeafDirection = length(farPrimaryResponse) > 0.0001
            ? normalize(farPrimaryResponse)
            : farFallbackDirection;
          // The coarse positional proxy owns separate equilibrium and differential travel. If
          // their sum enters one limiter, gale adherence consumes the entire range and erases the
          // very cluster motion LOD2 is meant to preserve. Reserve bounded travel around the
          // solved mean pose, just as the full leaf hinge does at LOD0/1.
          float farLeafMeanPositionAngle = terrainProjectSmoothSignedLimit(
            farLeafMeanAngle,
            0.18
          );
          float farLeafRemainingPositionTravel = max(
            0.32 - abs(farLeafMeanPositionAngle),
            0.0
          );
          float farLeafPositionAngle = farLeafMeanPositionAngle +
            terrainProjectCompliantSignedTravel(
              farLeafOscillationAngle,
              farLeafRemainingPositionTravel
            );
          windPositionWS += vec3(farLeafDirection.x, 0.0, farLeafDirection.y) *
            farLeafPositionAngle * farLeafSpanWeight * 0.65;
        #endif
        #ifndef TERRAIN_PROJECT_SHADOW_CASTER_PASS
          // Root positions receive only the crown mode. Leaf normals receive the complete coarse
          // card angle so lighting follows the pinned tip displacement instead of appearing static.
          float farNormalAngle = farRootAngle * farRootWeight + farLeafRelativeAngle;
          float farNormalCosine = cos(farNormalAngle);
          float farNormalSine = sin(farNormalAngle);
          windNormalWS = normalize(terrainProjectRotateAroundAxisSinCos(
            normalWS, farRootAxis, farNormalCosine, farNormalSine
          ));
          #ifdef NEED_VERTEX_TANGENT
            windTangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
              tangentWS, farRootAxis, farNormalCosine, farNormalSine
            ));
          #endif
        #endif
      #else
      // Full and Reduced tree variants are selected from authored projected size. A second
      // physical-distance gate here would make two equally large trees consume different wind
      // bandwidth and would erase LOD1 motion before the authored LOD2 transition. Generic
      // vegetation keeps the continuous distance policy; tree SLOD owns its complete bandwidth.
      #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
        float windLod = 0.0;
      #else
        float windLod = terrainProjectWindAnimationLod(cameraDistanceToOrigin);
      #endif
      TerrainProjectWindReceiverProfile profile = terrainProjectWindReceiverProfile();
      float windWeight = terrainProjectVegetationStructuralWeight(positionWS, originWS, attributes);
      TerrainProjectWindReceiverProfile hierarchyProfile = profile;
      #ifdef MATERIAL_WIND_GROUND_VEGETATION
        // One blade/stem is one cantilever: all of its vertices must observe the same low-order
        // air load. Sampling the travelling gust and height layer independently at every vertex
        // gives adjacent vertices different equilibrium rotations around the same root; that is
        // mesh shear, not beam flexion, and it shows up as flower/grass pose chatter at the gust
        // front. Instance origins remain world-space distributed, so neighbouring plants still
        // resolve the moving packet and wheat-wave field independently. COLOR_0 root-tip weights
        // below own the continuous deformation shape; the per-component phase still decorrelates
        // differential micro motion without splitting the structural load.
        vec3 hierarchyReferenceWS = originWS;
      #else
        vec3 hierarchyReferenceWS = positionWS;
      #endif
      float hierarchyWeight = windWeight;
      #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
        TerrainProjectHeroHierarchyData heroHierarchy = terrainProjectHeroHierarchyData(
          positionWS,
          originWS,
          attributes
        );
        // One air parcel drives the complete tree. Spatial decorrelation belongs between
        // trees, not across two vertices that visually share a branch attachment.
        hierarchyReferenceWS = originWS;
        hierarchyWeight = max(max(heroHierarchy.stageWeights.x, heroHierarchy.stageWeights.y), heroHierarchy.stageWeights.z);
        vec3 deformedHierarchyReferenceWS = heroHierarchy.structurePositionWS;
        vec3 deformedParentTangentWS = vec3(0.0, 1.0, 0.0);
        vec3 deformedLeafHingeAxisWS = heroHierarchy.leafHingeAxisWS;
        vec3 deformedLeafRestNormalWS = heroHierarchy.leafRestNormalWS;
        vec2 heroPrimaryResponse = terrainProjectTreePrimaryResponse(originWS);
      #endif
      #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
        hierarchyProfile = terrainProjectBranchWindReceiverProfile();
      #endif
      TerrainProjectWindSample wind = terrainProjectSampleWind(
        hierarchyReferenceWS,
        originWS,
        attributes,
        windLod,
        hierarchyProfile,
        profile
      );
      #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
        groundWindDiagnostics.y = terrainProjectGroundWindNormalized(wind.groundWave);
        groundWindCarrierNormalWS = terrainProjectGroundWindBandNormal(
          wind.macro,
          wind.groundDetail
        );
      #endif
      float horizontalSpeed = length(wind.velocityWS.xz);
      vec2 retainedTreeResponse = vec2(0.0);
      #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
        retainedTreeResponse = heroPrimaryResponse;
      #endif
      float retainedTreeResponseMagnitude = length(retainedTreeResponse);
      #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
        bool hasWindResponse = true;
      #else
        bool hasWindResponse = horizontalSpeed > 0.0001 || retainedTreeResponseMagnitude > 0.0001;
      #endif
      if (hasWindResponse) {
        #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
          vec2 resolvedDirection = scene_GroundWindMotion.xy;
          vec2 meanDirection = scene_GroundWindMotion.xy;
        #else
          vec2 resolvedDirection = horizontalSpeed > 0.0001
            ? wind.velocityWS.xz / horizontalSpeed
            : retainedTreeResponse / retainedTreeResponseMagnitude;
          vec2 meanDirection = length(scene_WindVelocity.xz) > 0.0001
            ? normalize(scene_WindVelocity.xz)
            : resolvedDirection;
        #endif
        #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
          float lockedMeanDirectionLength = length(material_WindLockedDirectionWS.xz);
          if (lockedMeanDirectionLength > 0.0001) {
            meanDirection = terrainProjectMixHorizontalDirection(
              material_WindLockedDirectionWS.xz / lockedMeanDirectionLength,
              meanDirection,
              material_WindAerodynamicWeights.w
            );
          }
        #endif
        float receiverDirectionVariation = hierarchyProfile.mesoGain;
        #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
          receiverDirectionVariation *= material_WindAerodynamicWeights.z;
        #endif
        vec2 receiverDirection = terrainProjectMixHorizontalDirection(
          meanDirection,
          resolvedDirection,
          receiverDirectionVariation
        );
        vec3 windDirection = vec3(receiverDirection.x, 0.0, receiverDirection.y);
        // Rodrigues rotation of local/world up around (wind.z, 0, -wind.x) moves the
        // receiver towards +windDirection. The opposite axis would cancel the shared GPU
        // whole-tree/root response and is mechanically invalid.
        vec3 bendAxis = normalize(vec3(windDirection.z, 0.0, -windDirection.x));
        float macroLoad = wind.macro * hierarchyProfile.macroGain;
        #ifdef MATERIAL_WIND_GROUND_VEGETATION
          macroLoad *= max(material_WindGroundWaveParams.x, 0.0);
        #endif
        float flow = mix(
          0.55,
          1.45,
          pow(
            clamp(macroLoad * 0.5 + 0.5, 0.0, 1.0),
            max(material_WindFlowDensity, 0.1)
          )
        );
        #ifdef MATERIAL_WIND_FULL_FIDELITY_LOD
          float normalResponse = 1.0;
        #else
          float normalResponse = 1.0 - smoothstep(0.55, 1.8, windLod);
        #endif
        float bendWeight = hierarchyWeight;
        #ifdef MATERIAL_WIND_HERO_TREE_HIERARCHY
          // Anchored hierarchy weights are applied inside each rigid parent/child stage.
          // The shared aerodynamic load must remain identical at both sides of an attachment.
          bendWeight = 1.0;
        #endif
        #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
          float groundWindBodyWeight = terrainProjectGroundWindBodyWeight(windWeight);
          float bendAngle = clamp(
            wind.groundWave,
            -profile.maximumBendRadians,
            profile.maximumBendRadians
          ) * groundWindBodyWeight;
        #else
          float bendAngle = terrainProjectWindBendAngle(
            wind,
            hierarchyProfile,
            flow,
            bendWeight
          );
        #endif
        #ifdef MATERIAL_VEGETATION_CLIMATE_SHRUB
          // Shrub assets contain disconnected leaf cards rather than explicit branch meshes.
          // Offline baking groups those cards into radial implicit branches and stores a
          // card-constant compliance in alpha plus a branch phase in blue. Collapse root and
          // branch response into one Rodrigues rotation: it preserves each card rigidly, keeps
          // the airflow as the dominant direction and adds no texture lookup or second sin/cos.
          float shrubBranchCompliance = terrainProjectShrubBranchCompliance(attributes);
          float shrubBranchDirectionBias = 0.0;
          #ifdef RENDERER_ENABLE_VERTEXCOLOR
            shrubBranchDirectionBias = (attributes.COLOR_0.b * 2.0 - 1.0) * 0.16;
          #endif
          bendAxis = normalize(bendAxis + windDirection * shrubBranchDirectionBias);
          bendAngle *= mix(0.42, 1.0, shrubBranchCompliance);
        #endif
        #ifdef MATERIAL_WIND_GROUND_VEGETATION
          #if !defined(MATERIAL_VEGETATION_CLIMATE_GRASS) && !defined(MATERIAL_VEGETATION_CLIMATE_FLOWER)
          float requestedGroundTravellingWaveAngle = 0.0;
          // Whole-stem recovery is a low structural mode. Driving it with micro flutter injects
          // leaf-tip cadence into the complete blade rotation and turns temporal aliasing into a
          // visible pose snap. Meso is the shared, advected low band. Combine it with the macro
          // travelling wave before the one existing smooth travel limiter, preserving coherent
          // wheat waves without adding another inverse-square-root to every grass vertex.
          float groundRecoveryActivation = smoothstep(0.8, 4.0, horizontalSpeed);
          float groundRecovery = wind.meso * material_WindGroundWaveParams.z *
            groundRecoveryActivation * mix(0.45, 1.0, clamp(wind.turbulence, 0.0, 1.0));
          float requestedGroundRecoveryAngle =
            bendAngle * (clamp(1.0 + groundRecovery, 0.78, 1.18) - 1.0);
          float requestedGroundLowFrequencyAngle =
            requestedGroundTravellingWaveAngle + requestedGroundRecoveryAngle;
          float groundLowFrequencyTravel = requestedGroundLowFrequencyAngle >= 0.0
            ? max(profile.maximumBendRadians - bendAngle, 0.0)
            : bendAngle;
          bendAngle += terrainProjectCompliantSignedTravel(
            requestedGroundLowFrequencyAngle,
            groundLowFrequencyTravel
          );
          // Secondary motion is differential stem flexion around the root, not a world-space
          // translation. Fold it into the existing root rotation so ground vegetation pays no
          // additional sin/cos pair beyond the baseline bend transform.
          #ifdef MATERIAL_VEGETATION_CLIMATE_GRASS
            // One high-speed area-reduction envelope is sufficient. Retain the stronger of the
            // receiver and authored material floors so the gale mode stays visible, while the
            // existing smooth onset and remaining-travel limiter prevent card chatter or folding.
            float retainedGrassMicroScale = max(
              profile.highSpeedMicroScale,
              clamp(material_WindGroundShapeParams.w, 0.0, 1.0)
            );
            float groundMicroEnvelope = mix(
              1.0,
              retainedGrassMicroScale,
              smoothstep(3.0, 8.0, horizontalSpeed)
            );
          #else
            float groundMicroEnvelope = terrainProjectWindMicroEnvelope(horizontalSpeed, profile);
          #endif
          float requestedGroundFlutterAngle =
            wind.micro * profile.microGain * groundMicroEnvelope * wind.turbulence *
              material_WindWavesScale * material_WindForce * 8.0 * windWeight *
              terrainProjectVegetationFlutterWeight(attributes, profile);
          // Mean lodging already approaches maximumBendRadians through compliant aerodynamics.
          // Re-limiting the sum made a travelling gust move the stem into the limiter shoulder;
          // its gain then rose above one before falling to zero, periodically stopping and
          // releasing the flower/grass silhouette. Give the differential mode only the angular
          // travel left by the mean pose. The harmonic minimum remains below both the authored
          // turbulence range and the actual mechanical remainder.
          float remainingGroundBendTravel = max(
            profile.maximumBendRadians - bendAngle,
            0.0
          );
          float groundFlutterTravel =
            0.105 * remainingGroundBendTravel / (0.105 + remainingGroundBendTravel);
          float groundFlutterAngle = terrainProjectCompliantSignedTravel(
            requestedGroundFlutterAngle,
            groundFlutterTravel
          );
          bendAngle += groundFlutterAngle;
          #endif
        #endif
        #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
          groundWindDiagnostics.y = terrainProjectGroundWindNormalized(wind.groundWave);
          groundWindDiagnostics.z = terrainProjectGroundWindHeightResponse(
            bendAngle,
            profile.maximumBendRadians
          );
        #endif
        #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && (defined(MATERIAL_VEGETATION_CLIMATE_BRANCH) || defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
          vec2 leafHierarchyOscillation;
          vec3 hierarchyOscillation = terrainProjectHeroTreeOscillation(
            heroHierarchy.structurePositionWS,
            originWS,
            hierarchyProfile,
            hierarchyWeight,
            heroHierarchy.stiffnessWeight,
            heroHierarchy.phaseCoordinate,
            windLod,
            wind.turbulence,
            wind.elasticMemory,
            leafHierarchyOscillation
          );
          windPositionWS = terrainProjectApplyHeroTreeHierarchy(
            positionWS,
            originWS,
            heroTrunkResponseHeightWS,
            heroPrimaryResponse,
            heroHierarchy.structurePositionWS,
            heroHierarchy.stage0PivotWS,
            heroHierarchy.stage1PivotWS,
            heroHierarchy.stage2PivotWS,
            windDirection,
            bendAxis,
            bendAngle,
            heroHierarchy.stageWeights,
            heroHierarchy.stageParentProgress,
            heroHierarchy.mechanicalDepth,
            heroHierarchy.localProgress,
            hierarchyOscillation,
            normalResponse,
            heroHierarchy.leafHingeAxisWS,
            heroHierarchy.leafRestNormalWS,
            deformedHierarchyReferenceWS,
            deformedParentTangentWS,
            deformedLeafHingeAxisWS,
            deformedLeafRestNormalWS,
            windNormalWS,
            windTangentWS
          );
        #else
          #ifdef MATERIAL_WIND_PROCEDURAL_FLOWER
          // Integrate an inextensible stem from its pinned base. Rigid flower heads
          // use their authored attachment section; stems turn progressively along
          // the same curve. This preserves each head and its connection at every LOD.
          vec3 flowerSectionOS = terrainProjectAssetAssemblyTransformPositionOS(attributes.PLANT_WIND.xyz, attributes);
          vec3 flowerSectionWS = (renderer_ModelMat * vec4(flowerSectionOS, 1.0)).xyz;
          float flowerHeight = max(flowerSectionWS.y - originWS.y, 0.0);
          float flowerSectionAngle = bendAngle * attributes.PLANT_WIND.w;
          float flowerHalfSinc = terrainProjectFlowerBeamSinc(flowerSectionAngle * 0.5);
          vec3 flowerBentSectionWS = originWS + vec3(0.0,
            flowerHeight * terrainProjectFlowerBeamSinc(flowerSectionAngle), 0.0) +
            windDirection * (flowerHeight * flowerSectionAngle * 0.5 * flowerHalfSinc * flowerHalfSinc);
          vec3 stem = positionWS - flowerSectionWS;
          windPositionWS = flowerBentSectionWS + terrainProjectRotateAroundAxis(stem, bendAxis, flowerSectionAngle);
          float bendNormalAngle = flowerSectionAngle * normalResponse;
          #else
          vec3 stem = positionWS - originWS;
          windPositionWS = originWS + terrainProjectRotateAroundAxis(stem, bendAxis, bendAngle);
          float bendNormalAngle = bendAngle * normalResponse;
          #endif
          float bendNormalCosine = cos(bendNormalAngle);
          float bendNormalSine = sin(bendNormalAngle);
          windNormalWS = normalize(terrainProjectRotateAroundAxisSinCos(
            normalWS, bendAxis, bendNormalCosine, bendNormalSine
          ));
          #ifdef NEED_VERTEX_TANGENT
            windTangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
              tangentWS, bendAxis, bendNormalCosine, bendNormalSine
            ));
          #endif
        #endif
        #ifndef MATERIAL_WIND_GROUND_VEGETATION
        #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
          // Direction, pressure and instability are three observations of the same relative air
          // state. Splitting them between steady and instantaneous wind creates temporal hysteresis
          // with no physical storage term and is visible as a one-frame lighting/pose discontinuity.
          float leafRelativeHorizontalSpeed = length(wind.velocityWS.xz);
          float authoredMicroEnvelope = terrainProjectWindMicroEnvelope(leafRelativeHorizontalSpeed, profile);
          float microEnvelope = mix(
            1.0,
            authoredMicroEnvelope,
            clamp(material_WindLeafBladeParams.w, 0.0, 1.0)
          );
          float leafPressureLoad = terrainProjectHeroLeafPressureLoadFromSpeed(
            leafRelativeHorizontalSpeed,
            material_WindFlutterTuning.z
          );
          float boundedLeafTurbulence = clamp(wind.turbulence, 0.0, 1.0);
        #else
          float microEnvelope = terrainProjectWindMicroEnvelope(wind.steadyHorizontalSpeed, profile);
          float leafPressureLoad = 1.0;
        #endif
        float flutter = wind.micro * profile.microGain * microEnvelope * wind.turbulence * material_WindWavesScale *
          material_WindForce * 0.08 * windWeight * terrainProjectVegetationFlutterWeight(attributes, profile) *
          leafPressureLoad;
        #if defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
          // The parent-deformed leaf hinge is the kinematic constraint. Aerodynamic-center data
          // may scale the torque, but every local position transform stays rooted here so a card
          // cannot detach from its branch under any wind strength or instance scale.
          vec3 leafStructuralPivotWS = deformedHierarchyReferenceWS;
          // A leaf inherits the complete parent transform first. Its additional displacement is
          // then a bounded angular response around the card-coherent structural hinge.
          // Position deformation may only use card-coherent anchors, axes, and scalars. Shading
          // normals intentionally vary per corner and are never a valid geometric card identity.
          // The analytical parent primary band controls inherited petiole travel. Aerodynamic
          // pressure owns only bounded local angular freedom around the deformed attachment: it may
          // reorient a leaf, but it cannot translate the crown or bypass the parent transform.
          #ifdef MATERIAL_WIND_SLOD_REDUCED
          // LOD1 retains UE directional adherence and two already-computed, parent-correlated
          // low-frequency tumble bands at full authored amplitude. Texture-driven ripple, twist,
          // twitch and high-frequency shedding stay compiled out; motion energy no longer does.
          windPositionWS = terrainProjectApplyHeroLeafTumble(
            windPositionWS,
            leafStructuralPivotWS,
            deformedLeafHingeAxisWS,
            deformedLeafRestNormalWS,
            windDirection,
            leafPressureLoad,
            material_WindFoliageWeights.x,
            material_WindFoliageWeights.y,
            0.0,
            0.0,
            heroHierarchy.phaseCoordinate,
            leafHierarchyOscillation.x,
            leafHierarchyOscillation.y,
            0.0,
            material_WindLeafMotionParams.x * max(material_WindFlutterTuning.w, 0.0),
            material_WindLeafMotionParams.y,
            0.0,
            0.0,
            0.0,
            0.0,
            normalResponse,
            windNormalWS,
            windTangentWS
          );
          #else
          float leafSpanMask = terrainProjectHeroLeafSpanWeight(attributes);
          float leafBladeFlexion = clamp(material_WindLeafBladeParams.z, 0.0, 1.0);
          float leafAttachmentCompliance = mix(
            0.42,
            1.0,
            max(heroHierarchy.tipWeight, 1.0 - heroHierarchy.stiffnessWeight)
          );
          #if defined(MATERIAL_WIND_FULL_FIDELITY_LOD) && defined(MATERIAL_WIND_MECHANICAL_DEPTH_0)
            // LOD2 collapses every deleted branch into the depth-0 crown proxy, so its authored
            // stage weights are necessarily zero. Zero describes missing representation, not an
            // infinitely rigid petiole. Preserve the calibrated leaf-local compliance after the
            // parent branch hierarchy has been folded into the retained crown mode.
            leafAttachmentCompliance = 1.0;
          #endif
          float aerodynamicAngularRetention = 1.0 / (1.0 + 3.2 * leafPressureLoad);
          float leafFlutterCadence = terrainProjectWindFlutterFrequencyHz(
            heroHierarchy.phaseCoordinate * 2.0 - 1.0,
            profile
          ) * max(material_WindFlutterTuning.x, 0.01);
          float leafRippleSignal = sin(
            scene_WindFieldParams.w * leafFlutterCadence * 6.2831853 +
              heroHierarchy.phaseCoordinate * 17.0
          ) * mix(0.28, 1.0, boundedLeafTurbulence);
          // UE evaluates ripple before tumble in anchor-local space. Using the deformed parent
          // frame here is the algebraically equivalent P3 composition after hierarchy transport.
          windPositionWS = terrainProjectApplyHeroLeafRipple(
            windPositionWS,
            leafStructuralPivotWS,
            deformedLeafRestNormalWS,
            leafSpanMask,
            leafRippleSignal,
            material_WindLeafBladeParams.x,
            leafPressureLoad * microEnvelope
          );
          float resolvedMicroOscillation = wind.micro * microEnvelope *
            mix(0.35, 1.0, boundedLeafTurbulence);
          windPositionWS = terrainProjectApplyHeroLeafTumble(
            windPositionWS,
            leafStructuralPivotWS,
            deformedLeafHingeAxisWS,
            deformedLeafRestNormalWS,
            windDirection,
            leafPressureLoad,
            material_WindFoliageWeights.x,
            material_WindFoliageWeights.y * leafAttachmentCompliance,
            material_WindFoliageWeights.z,
            material_WindFoliageWeights.w,
            heroHierarchy.phaseCoordinate,
            leafHierarchyOscillation.x,
            leafHierarchyOscillation.y,
            resolvedMicroOscillation,
            material_WindLeafMotionParams.x * max(material_WindFlutterTuning.w, 0.0),
            material_WindLeafMotionParams.y,
            material_WindLeafMotionParams.z,
            material_WindLeafMotionParams.w,
            leafSpanMask,
            leafBladeFlexion,
            normalResponse,
            windNormalWS,
            windTangentWS
          );

          // P3 enhancement: branch-correlated cluster roll is layered after the UE-equivalent
          // leaf-local result around the same structural hinge and never gates UE local freedom.
          float requestedClusterRollAngle =
            leafHierarchyOscillation.y * 0.12 * material_WindLeafBladeParams.y *
            leafAttachmentCompliance * leafPressureLoad * aerodynamicAngularRetention;
          float clusterRollAngle = terrainProjectSmoothSignedLimit(
            requestedClusterRollAngle,
            0.12
          ) * normalResponse;
          float clusterRollCosine = cos(clusterRollAngle);
          float clusterRollSine = sin(clusterRollAngle);
          windPositionWS = leafStructuralPivotWS + terrainProjectRotateAroundAxisSinCos(
            windPositionWS - leafStructuralPivotWS,
            deformedParentTangentWS,
            clusterRollCosine,
            clusterRollSine
          );
          windNormalWS = normalize(terrainProjectRotateAroundAxisSinCos(
            windNormalWS,
            deformedParentTangentWS,
            clusterRollCosine,
            clusterRollSine
          ));
          #ifdef NEED_VERTEX_TANGENT
            windTangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
              windTangentWS,
              deformedParentTangentWS,
              clusterRollCosine,
              clusterRollSine
            ));
          #endif
          #endif
        #elif defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF)
          float signedWindFacing = dot(normalWS, windDirection);
          float windFacing = smoothstep(-0.2, 0.2, signedWindFacing) * 2.0 - 1.0;
          vec3 leafBillowDirection = normalize(windDirection + normalWS * windFacing * 0.45);
          windPositionWS += leafBillowDirection * flutter;
        #else
          windPositionWS += windDirection * flutter;
        #endif
        #endif
        #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) && defined(MATERIAL_VEGETATION_CLIMATE_LEAF) && !defined(MATERIAL_WIND_HERO_TREE_ATTACHMENT)
          vec3 rawFlutterAxis = cross(windNormalWS, windDirection);
          float flutterAxisLength = length(rawFlutterAxis);
          vec3 flutterAxis = flutterAxisLength > 0.0001 ? rawFlutterAxis / flutterAxisLength : bendAxis;
          float flutterAngle = clamp(flutter * 4.0, -0.12, 0.12) * normalResponse;
          float flutterCosine = cos(flutterAngle);
          float flutterSine = sin(flutterAngle);
          windNormalWS = normalize(terrainProjectRotateAroundAxisSinCos(
            windNormalWS, flutterAxis, flutterCosine, flutterSine
          ));
          #ifdef NEED_VERTEX_TANGENT
            windTangentWS = normalize(terrainProjectRotateAroundAxisSinCos(
              windTangentWS, flutterAxis, flutterCosine, flutterSine
            ));
          #endif
        #endif
      }
      #endif
    }
  #endif

  #ifdef MATERIAL_WIND_GRASS_FLOWER_FIELD
    windNormalWS = normalize(
      windNormalWS +
      (groundWindCarrierNormalWS - vec3(0.0, 1.0, 0.0)) *
      (1.15 * groundWindDiagnostics.x)
    );
  #endif
  float grassFade;
  #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
    // Unity Terrain Details uses saturate(2 * (R^2 - d^2) / R^2): full coverage through
    // R / sqrt(2), then a squared radial fade to zero at R
    float maximumDistanceSquared = max(
      material_GrassFadeDistance * material_GrassFadeDistance,
      0.0001
    );
    grassFade = clamp(
      2.0 * (maximumDistanceSquared - cameraDistanceSquared) / maximumDistanceSquared,
      0.0,
      1.0
    );
  #else
    float eyeDepth = -(camera_ViewMat * vec4(positionWS, 1.0)).z;
    float cameraDepthFade = (
      eyeDepth - camera_ProjectionParams.y - material_GrassFadeDistance
    ) / 5.0;
    grassFade = clamp(
      mix(1.0 - cameraDepthFade, cameraDepthFade, material_GrassFalloff * 0.5),
      0.0,
      1.0
    );
  #endif
  float grassFadeMask = mix(1.0, grassFade, material_GrassDistanceFadeEnable);
  normalWS = normalize(mix(normalWS, windNormalWS, grassFadeMask));
  #ifdef NEED_VERTEX_TANGENT
    tangentWS = normalize(mix(tangentWS, windTangentWS, grassFadeMask));
    tangentWS = normalize(tangentWS - normalWS * dot(normalWS, tangentWS));
  #endif
  windShadingResponse = grassFadeMask;
  return mix(originWS, windPositionWS, grassFadeMask);
  #endif
}

vec3 terrainProjectVegetationPositionWS(
  vec4 positionOS,
  Attributes attributes,
  vec3 proceduralTreeWindOriginOS,
  inout vec3 normalWS,
  inout vec3 tangentWS,
  out float windShadingResponse,
  out vec3 groundWindDiagnostics,
  out vec3 groundWindCarrierNormalWS
) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    vec3 detailPositionOS = terrainProjectAssetAssemblyPositionOS(positionOS.xyz, attributes);
    #ifdef MATERIAL_WIND_PROCEDURAL_TREE
      vec3 detailOriginOS = terrainProjectAssetAssemblyPositionOS(proceduralTreeWindOriginOS, attributes);
    #else
      vec3 detailOriginOS = terrainProjectAssetAssemblyOriginOS(attributes);
    #endif
  #else
    vec3 detailPositionOS = terrainProjectDetailPositionOS(positionOS.xyz, attributes);
    vec3 detailOriginOS = terrainProjectDetailOriginOS(attributes);
  #endif
  vec4 homogeneousPositionWS = renderer_ModelMat * vec4(detailPositionOS, 1.0);
  vec3 positionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
  vec4 homogeneousOriginWS = renderer_ModelMat * vec4(detailOriginOS, 1.0);
  vec3 originWS = homogeneousOriginWS.xyz / homogeneousOriginWS.w;
  return terrainProjectApplyVegetationWind(
    positionWS,
    originWS,
    attributes,
    normalWS,
    tangentWS,
    windShadingResponse,
    groundWindDiagnostics,
    groundWindCarrierNormalWS
  );
}

#endif
