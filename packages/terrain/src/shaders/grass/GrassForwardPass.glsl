#define TERRAIN_PROJECT_FORWARD_PASS
#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"

struct Attributes {
  #ifdef RENDERER_GRASS_ROCK_APPEARANCE
    vec4 DETAIL_ROCK_A;
    vec4 DETAIL_ROCK_B;
    vec4 DETAIL_ROCK_C;
    vec4 DETAIL_ROCK_NA;
    vec4 DETAIL_ROCK_NB;
    vec4 DETAIL_ROCK_NC;
    vec4 DETAIL_ROCK_META;
  #endif
  vec3 POSITION;
  vec3 NORMAL;
  #if defined(MATERIAL_GRASS_GROUND_SURFACE) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    vec4 COLOR_0;
  #endif
  #ifdef RENDERER_HAS_UV
    vec2 TEXCOORD_0;
  #endif
  #if defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)
    vec4 DETAIL_POSITION_ROTATION;
    #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
      vec3 DETAIL_SCALE;
      vec3 DETAIL_SURFACE_WEIGHTS;
      vec3 DETAIL_TERRAIN_NORMAL;
    #else
      vec2 DETAIL_SCALE;
    #endif
  #endif
};

#include "shared/DetailInstancing.glsl"
#include "shared/SurfaceGrassAttachment.glsl"

#ifdef RENDERER_WORLD_PICK
  float renderer_WorldPickBase;
  float renderer_WorldPickInstanced;
#endif
// Compact instance data describes geometry. An explicit mode can opt out of the legacy ground path.
#if defined(TERRAIN_PROJECT_GROUND_MATERIAL_BINDING) || (defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && !defined(RENDERER_SURFACE_GRASS_ATTACHMENT) && (!defined(RENDERER_GRASS_MATCH_GROUND) || RENDERER_GRASS_MATCH_GROUND == 1))
  #define TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
  #if !defined(MATERIAL_GRASS_GROUND_SURFACE) && !defined(MATERIAL_FARM_GROUND_SURFACE) && (defined(RENDERER_TERRAIN_LAYERS) || defined(MATERIAL_TERRAIN_LAYERS) || defined(RENDERER_TERRAIN_UNTEXTURED_SINGLE_MAP) || defined(RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP))
    #define TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
    #if !defined(RENDERER_ROCK_GRASS_GROUND) && !defined(RENDERER_GRASS_ROCK_APPEARANCE) && !defined(TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_ACTIVE)
      #define TERRAIN_PROJECT_GRASS_PACKED_VARYINGS
    #endif
  #endif
#endif
#if defined(TERRAIN_PROJECT_GRASS_PACKED_VARYINGS) && defined(SCENE_SURFACE_CLIMATE_DRY) && !defined(RENDERER_WORLD_PICK) && !defined(SCENE_OIL_PAINT_STYLE)
  // Keep dry grass lighting lightweight in fragment without hoisting cloud shadow, fog, or
  // multi-cascade shadow coordinates into vertex (avoids VPC slot bloat beyond 4 vec4s / 13 floats
  // and per-vertex ALU/texture overhead on sub-pixel grass blades).
  #define TERRAIN_PROJECT_GRASS_MATTE_LIGHTING
#endif
#if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX) && !defined(TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE)
  #define TERRAIN_PROJECT_GRASS_VERTEX_PROBE_VOLUME
#endif
struct Varyings {
  #ifdef RENDERER_WORLD_PICK
    float worldPickId;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_PACKED_VARYINGS
    vec3 positionWS;
    vec4 rootGroundBase;
    vec3 shadingNormalWS;
    #ifndef SCENE_SURFACE_CLIMATE_DRY
      float tipWeight;
    #endif
  #elif defined(MATERIAL_FARM_GROUND_SURFACE)
    vec3 terrainNormalWS;
    vec3 positionWS;
  #else
    #ifdef RENDERER_GRASS_ROCK_APPEARANCE
      vec4 rockAppearance;
      vec4 rockAppearanceNormalSnow;
    #endif
    vec3 rootPositionWS;
    vec3 terrainNormalWS;
    vec3 positionWS;
    vec3 grassColor;
    vec3 surfaceWeights;
    #ifdef RENDERER_ROCK_GRASS_GROUND
      vec4 rockGround;
      vec4 rockGroundNormal;
    #endif
    #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
      vec4 rootGroundBase;
      vec4 groundReliefNormalWeight;
    #endif
    float tipWeight;
    vec3 windCarrierNormalWS;
    vec3 windBentNormalWS;
  #endif
  vec4 positionCS;
  #if SCENE_FOG_MODE != 0
    vec3 positionVS;
  #endif
  #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
    vec3 probeIrradiance;
    float probeWeight;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    vec3 shadowCoord;
  #endif
};

#include "shared/Shadow.glsl"
#include "shared/Lighting.glsl"
#include "shared/TerrainSurfaceData.glsl"
#ifndef MATERIAL_GRASS_SHARED_COLOR_FIELD
  #define GRASS_COLOR_FIELD_RENDERER_SOURCE
#endif
#include "shared/GrassColorField.glsl"
#undef GRASS_COLOR_FIELD_RENDERER_SOURCE
#include "shared/GrassDistanceFade.glsl"
#include "shared/SurfaceClimate.glsl"

vec4 material_GrassGroundColor;
vec4 material_GrassSurfaceSnowResponse;
vec4 renderer_GrassRoadColor;
vec4 renderer_GrassLodDebugColor;
#include "shared/GrassGroundFusion.glsl"
#ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
  #ifndef TERRAIN_PROJECT_GROUND_MATERIAL_BINDING
    #define TERRAIN_GROUND_RENDERER
  #endif
  #include "shared/GrassTerrainSurface.glsl"
  #undef TERRAIN_GROUND_RENDERER
#endif
#if defined(TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE) || defined(MATERIAL_FARM_GROUND_SURFACE)
  #include "shared/FarmGroundBlend.glsl"
#endif
#include "shared/SurfaceRelief.glsl"
#ifdef RENDERER_ROCK_GRASS_GROUND
  #include "shared/RockGrassGround.glsl"
  #include "shared/RockTerrainContact.glsl"
#endif

#ifdef RENDERER_GRASS_ROCK_APPEARANCE
  #include "shared/GrassRockAppearance.glsl"
#endif
sampler2D scene_WindSpectrumTexture;
vec4 scene_GroundWindWave;
vec4 scene_GroundWindShape;
vec4 scene_GroundWindMotion;
vec4 scene_GroundWindAdvection;
#include "shared/GroundWindField.glsl"
#include "shared/GroundWindAppearance.glsl"
#include "shared/GroundWindLighting.glsl"

vec3 grassRotateAroundAxis(vec3 value, vec3 axis, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return value * cosine + cross(axis, value) * sine + axis * dot(axis, value) * (1.0 - cosine);
}

vec3 grassWindPosition(
  vec3 rootPositionWS,
  vec3 positionWS,
  float tipWeight,
  int carrierNormalMode,
  out vec3 carrierNormalWS,
  out vec3 bentNormalWS
) {
  float rootWeight = pow(
    clamp(tipWeight, 0.0, 1.0),
    max(scene_GroundWindShape.x, 0.05)
  );
  vec2 direction = scene_GroundWindMotion.xy;
  float unweightedAngle = terrainProjectGroundWindAngleAt(rootPositionWS.xz);
  // mode 0: unused in GrassFragment (50m full relief + dry weather);
  // mode 1: far dry grass (>50m, sub-2px) analytical directional wind normal (0 extra fetches);
  // mode 2: full 6-fetch finite-difference carrier normal (all rain/snow or non-root-varyings path).
  if (carrierNormalMode == 2) {
    carrierNormalWS = terrainProjectGroundWindCarrierNormal(rootPositionWS.xz, unweightedAngle);
  } else if (carrierNormalMode == 1) {
    carrierNormalWS = terrainProjectGroundWindDirectionalNormal(unweightedAngle);
  } else {
    carrierNormalWS = vec3(0.0, 1.0, 0.0);
  }
  #ifdef RENDERER_GRASS_MATCH_GROUND
    vec3 bendAxis = dot(direction, direction) > 0.00001
      ? normalize(vec3(direction.y, 0.0, -direction.x))
      : vec3(0.0, 0.0, 1.0);
  #else
    vec3 bendAxis = normalize(vec3(direction.y, 0.0, -direction.x));
  #endif
  float bodyWeight = terrainProjectGroundWindBodyWeight(rootWeight);
  float bendAngle = unweightedAngle * bodyWeight;
  bentNormalWS = carrierNormalMode != 0
    ? grassRotateAroundAxis(vec3(0.0, 1.0, 0.0), bendAxis, bendAngle)
    : vec3(0.0, 1.0, 0.0);
  vec3 stem = positionWS - rootPositionWS;
  return rootPositionWS + grassRotateAroundAxis(stem, bendAxis, bendAngle);
}

Varyings grassCulledVaryings() {
  Varyings output;
  #ifdef RENDERER_WORLD_PICK
    output.worldPickId = 0.0;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_PACKED_VARYINGS
    output.positionWS = vec3(0.0);
    output.rootGroundBase = vec4(0.0);
    output.shadingNormalWS = vec3(0.0, 1.0, 0.0);
    #ifndef SCENE_SURFACE_CLIMATE_DRY
      output.tipWeight = 0.0;
    #endif
  #elif defined(MATERIAL_FARM_GROUND_SURFACE)
    output.terrainNormalWS = vec3(0.0, 1.0, 0.0);
    output.positionWS = vec3(0.0);
  #else
    #ifdef RENDERER_GRASS_ROCK_APPEARANCE
      output.rockAppearance = vec4(0.0);
      output.rockAppearanceNormalSnow = vec4(0.0, 1.0, 0.0, 0.0);
    #endif
    output.rootPositionWS = vec3(0.0);
    output.terrainNormalWS = vec3(0.0, 1.0, 0.0);
    output.positionWS = vec3(0.0);
    output.grassColor = vec3(0.0);
    output.surfaceWeights = vec3(0.0);
    #ifdef RENDERER_ROCK_GRASS_GROUND
      output.rockGround = vec4(0.0);
      output.rockGroundNormal = vec4(0.0, 1.0, 0.0, 0.0);
    #endif
    #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
      output.rootGroundBase = vec4(0.0);
      output.groundReliefNormalWeight = vec4(0.0, 1.0, 0.0, 0.0);
    #endif
    output.tipWeight = 0.0;
    output.windCarrierNormalWS = vec3(0.0, 1.0, 0.0);
    output.windBentNormalWS = vec3(0.0, 1.0, 0.0);
  #endif
  output.positionCS = vec4(2.0, 2.0, 2.0, 1.0);
  #if SCENE_FOG_MODE != 0
    output.positionVS = vec3(0.0);
  #endif
  #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
    output.probeIrradiance = vec3(0.0);
    output.probeWeight = 0.0;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    output.shadowCoord = vec3(0.0);
  #endif
  gl_Position = output.positionCS;
  return output;
}

Varyings GrassVertex(Attributes attributes) {
  #if !defined(MATERIAL_GRASS_GROUND_SURFACE) && (defined(RENDERER_DETAIL_INSTANCE) || defined(RENDERER_SEED_WORLD_DETAIL_COMPACT))
    if (attributes.DETAIL_SCALE.y <= 0.0001) {
      return grassCulledVaryings();
    }
  #endif
  Varyings output;
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    float farmWeight = 0.0;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
    float reliefWeight = 0.0;
  #endif
  #ifdef RENDERER_WORLD_PICK
    output.worldPickId = renderer_WorldPickBase + float(gl_InstanceID) * renderer_WorldPickInstanced;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_PACKED_VARYINGS
    vec3 positionOS = terrainProjectDetailPositionOS(attributes.POSITION, attributes);
    vec3 rootOS = terrainProjectDetailOriginOS(attributes);
    vec4 rootPosition = renderer_ModelMat * vec4(rootOS, 1.0);
    vec3 vRootPositionWS = rootPosition.xyz / rootPosition.w;
    #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
      vec3 vTerrainNormalWS = normalize(attributes.DETAIL_TERRAIN_NORMAL);
      vec3 vSurfaceWeights = attributes.DETAIL_SURFACE_WEIGHTS;
    #else
      vec3 vTerrainNormalWS = vec3(0.0, 1.0, 0.0);
      vec3 vSurfaceWeights = vec3(1.0, 0.0, 0.0);
    #endif

    float bladeScale = terrainProjectGrassDistanceVisibility(vRootPositionWS);
    #ifdef RENDERER_GRASS_DENSITY_LOD
      bladeScale *= terrainProjectGrassDensityVisibility(vRootPositionWS);
    #endif
    farmWeight = terrainProjectFarmGroundCoverage(vRootPositionWS.xz);
    bladeScale *= terrainProjectFarmGrassScale(vSurfaceWeights.x, farmWeight);
    if (bladeScale <= 0.0001) {
      return grassCulledVaryings();
    }
    positionOS = mix(rootOS, positionOS, bladeScale);

    float authoredHeight = 0.16685753;
    float tipWeight = clamp(attributes.POSITION.y / authoredHeight, 0.0, 1.0);

    reliefWeight = terrainProjectSurfaceReliefWeight(vRootPositionWS);
    // Keep physical wind sway & directional wind normal with 0 extra finite-difference spectrum fetches.
    int carrierNormalMode = reliefWeight >= 0.9999 ? 0 : 1;

    vec3 vWindCarrierNormalWS;
    vec3 vWindBentNormalWS;
    vec4 worldPosition = renderer_ModelMat * vec4(positionOS, 1.0);
    worldPosition.xyz = grassWindPosition(
      vRootPositionWS,
      worldPosition.xyz,
      tipWeight,
      carrierNormalMode,
      vWindCarrierNormalWS,
      vWindBentNormalWS
    );
    output.positionWS = worldPosition.xyz / worldPosition.w;
    output.positionCS = camera_VPMat * worldPosition;
    #if SCENE_FOG_MODE != 0
      output.positionVS = (camera_ViewMat * worldPosition).xyz;
    #endif
    #ifdef TERRAIN_PROJECT_GRASS_VERTEX_PROBE_VOLUME
      vec3 probeIrradiance;
      bool hasProbe = sampleProbeVolume(
        output.positionWS,
        vTerrainNormalWS,
        normalize(camera_Position - output.positionWS),
        probeIrradiance
      );
      output.probeIrradiance = probeIrradiance;
      output.probeWeight = hasProbe ? 1.0 : 0.0;
    #elif defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
      // Defer probe volume sampling to fragment when terrain surface samplers are active in VS
      // so active vertex samplers stay <= 16 (WebGL2 minimum) across all macro combinations.
      output.probeIrradiance = vec3(0.0);
      output.probeWeight = 0.0;
    #endif
    #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
      output.shadowCoord = getShadowCoord(output.positionWS);
    #endif
    gl_Position = output.positionCS;

    TerrainProjectLayerBlend root = terrainProjectGrassRootSurface(vRootPositionWS);
    vec3 rootColor = terrainProjectGroundColor(root, vRootPositionWS);
    #if defined(RENDERER_GRASS_MATCH_GROUND) && RENDERER_GRASS_MATCH_GROUND == 1
      vec3 matchWeights = max(vSurfaceWeights, vec3(0.0));
      float matchWeightSum = dot(matchWeights, vec3(1.0));
      matchWeights = matchWeightSum > 0.00001
        ? matchWeights / matchWeightSum
        : vec3(1.0, 0.0, 0.0);
      vec3 matchColor =
        grassColorFromField(0.5) * matchWeights.x +
        renderer_GrassRoadColor.rgb * matchWeights.y +
        material_GrassGroundColor.rgb * matchWeights.z;
      rootColor = mix(rootColor, matchColor, terrainProjectGrassBladeAppearanceWeight(tipWeight));
    #endif
    rootColor = terrainProjectBlendFarmGroundColor(rootColor, vRootPositionWS.xz, farmWeight);
    output.rootGroundBase = vec4(rootColor, root.snowResponse);

    float bladeShadeWeight = terrainProjectGrassBladeShadeWeight(tipWeight);
    vec3 windFieldNormal = terrainProjectGrassWindFieldNormal(vTerrainNormalWS, vWindCarrierNormalWS, vWindBentNormalWS);
    vec3 vShadingNormal = normalize(mix(vTerrainNormalWS, windFieldNormal, bladeShadeWeight));
    if (reliefWeight > 0.0) {
      vec3 reliefNormal = terrainProjectSurfaceReliefNormal(
        vRootPositionWS, vTerrainNormalWS, root.grassWeight * root.weight
      );
      vShadingNormal = normalize(mix(vShadingNormal, reliefNormal, reliefWeight));
    }
    output.shadingNormalWS = vShadingNormal;
    #ifndef SCENE_SURFACE_CLIMATE_DRY
      output.tipWeight = tipWeight;
    #endif
    return output;
  #elif defined(MATERIAL_FARM_GROUND_SURFACE)
    vec4 worldPosition = renderer_ModelMat * vec4(attributes.POSITION, 1.0);
    output.terrainNormalWS = normalize(mat3(renderer_NormalMat) * attributes.NORMAL);
    output.positionWS = worldPosition.xyz / worldPosition.w;
    output.positionCS = camera_VPMat * worldPosition;
    #if SCENE_FOG_MODE != 0
      output.positionVS = (camera_ViewMat * worldPosition).xyz;
    #endif
    #ifdef TERRAIN_PROJECT_GRASS_VERTEX_PROBE_VOLUME
      vec3 probeIrradiance;
      bool hasProbe = sampleProbeVolume(
        output.positionWS,
        output.terrainNormalWS,
        normalize(camera_Position - output.positionWS),
        probeIrradiance
      );
      output.probeIrradiance = probeIrradiance;
      output.probeWeight = hasProbe ? 1.0 : 0.0;
    #elif defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
      output.probeIrradiance = vec3(0.0);
      output.probeWeight = 0.0;
    #endif
    #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
      output.shadowCoord = getShadowCoord(output.positionWS);
    #endif
    gl_Position = output.positionCS;
    return output;
  #else
  #ifdef MATERIAL_GRASS_GROUND_SURFACE
    // A ground surface shares the grass palette and lighting, but has no blade deformation or distance collapse.
    vec4 worldPosition = renderer_ModelMat * vec4(attributes.POSITION, 1.0);
    output.rootPositionWS = worldPosition.xyz / worldPosition.w;
    output.grassColor = vec3(0.0);
    output.terrainNormalWS = normalize(mat3(renderer_NormalMat) * attributes.NORMAL);
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
      output.surfaceWeights = attributes.COLOR_0.rgb;
    #else
      output.surfaceWeights = vec3(1.0, 0.0, 0.0);
    #endif
    output.tipWeight = 0.0;
    output.windCarrierNormalWS = vec3(0.0, 1.0, 0.0);
    output.windBentNormalWS = vec3(0.0, 1.0, 0.0);
  #else
  vec3 positionOS = terrainProjectDetailPositionOS(attributes.POSITION, attributes);
  vec3 rootOS = terrainProjectDetailOriginOS(attributes);
  #ifdef TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_ACTIVE
    positionOS = rootOS + terrainProjectAlignGrassToSurface(
      positionOS - rootOS,
      attributes.DETAIL_TERRAIN_NORMAL
    );
  #endif
  vec4 rootPosition = renderer_ModelMat * vec4(rootOS, 1.0);
  output.rootPositionWS = rootPosition.xyz / rootPosition.w;
  #ifdef RENDERER_SEED_WORLD_DETAIL_COMPACT
    output.terrainNormalWS = normalize(attributes.DETAIL_TERRAIN_NORMAL);
    output.surfaceWeights = attributes.DETAIL_SURFACE_WEIGHTS;
  #else
    output.terrainNormalWS = vec3(0.0, 1.0, 0.0);
    output.surfaceWeights = vec3(1.0, 0.0, 0.0);
  #endif

  float bladeScale = terrainProjectGrassDistanceVisibility(output.rootPositionWS);
  #ifdef RENDERER_GRASS_DENSITY_LOD
    bladeScale *= terrainProjectGrassDensityVisibility(output.rootPositionWS);
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    farmWeight = terrainProjectFarmGroundCoverage(output.rootPositionWS.xz);
    bladeScale *= terrainProjectFarmGrassScale(output.surfaceWeights.x, farmWeight);
  #endif
  if (bladeScale <= 0.0001) {
    return grassCulledVaryings();
  }
  positionOS = mix(rootOS, positionOS, bladeScale);

  #ifdef RENDERER_ROCK_GRASS_GROUND
    output.grassColor = terrainProjectGrassSurfaceColor(output.rootPositionWS);
  #elif defined(TERRAIN_PROJECT_GRASS_ROOT_VARYINGS)
    output.grassColor = vec3(0.0);
  #else
    output.grassColor = evaluateGrassBaseColor(output.rootPositionWS.xz);
  #endif
  #if defined(RENDERER_SEED_WORLD_DETAIL_COMPACT) && defined(RENDERER_ROCK_GRASS_GROUND)
    vec3 rockDescriptor = attributes.DETAIL_SURFACE_WEIGHTS;
    output.rockGround = terrainProjectRockGrassGround(rockDescriptor.x, output.grassColor);
    vec3 rockNormal = terrainProjectAttachedReliefNormal(output.rootPositionWS,
      output.terrainNormalWS, rockDescriptor.x);
    float contactSnowResponse = material_GrassSurfaceSnowResponse.x;
    terrainProjectBlendRockContact(output.rootPositionWS,
      terrainProjectRockGroundClearance(output.rootPositionWS), output.rockGround,
      rockNormal, contactSnowResponse);
    output.rockGroundNormal = vec4(rockNormal, contactSnowResponse);
    // The full attached blade owns its final supporting surface palette.
    output.grassColor = output.rockGround.rgb;
  #endif

  float authoredHeight = 0.16685753;
  float tipWeight = clamp(attributes.POSITION.y / authoredHeight, 0.0, 1.0);
  output.tipWeight = tipWeight;

  int carrierNormalMode = 2;
  #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
    reliefWeight = terrainProjectSurfaceReliefWeight(output.rootPositionWS);
    #ifdef SCENE_SURFACE_CLIMATE_DRY
      if (reliefWeight >= 0.9999) {
        carrierNormalMode = 0;
      } else if (terrainProjectSurfaceReliefEnabled()) {
        carrierNormalMode = 1;
      }
    #else
      if (dot(scene_SurfaceClimate, scene_SurfaceClimate) <= 0.0) {
        if (reliefWeight >= 0.9999) {
          carrierNormalMode = 0;
        } else if (terrainProjectSurfaceReliefEnabled()) {
          carrierNormalMode = 1;
        }
      }
    #endif
  #endif

  vec4 worldPosition = renderer_ModelMat * vec4(positionOS, 1.0);
  worldPosition.xyz = grassWindPosition(
    output.rootPositionWS,
    worldPosition.xyz,
    tipWeight,
    carrierNormalMode,
    output.windCarrierNormalWS,
    output.windBentNormalWS
  );
  #endif
  output.positionWS = worldPosition.xyz / worldPosition.w;
  #ifdef RENDERER_GRASS_ROCK_APPEARANCE
    terrainProjectGrassRockAppearance(output.positionWS, attributes,
      output.rockAppearance, output.rockAppearanceNormalSnow);
  #endif
  output.positionCS = camera_VPMat * worldPosition;
  #if SCENE_FOG_MODE != 0
    output.positionVS = (camera_ViewMat * worldPosition).xyz;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_VERTEX_PROBE_VOLUME
    vec3 probeIrradiance;
    bool hasProbe = sampleProbeVolume(
      output.positionWS,
      output.terrainNormalWS,
      normalize(camera_Position - output.positionWS),
      probeIrradiance
    );
    output.probeIrradiance = probeIrradiance;
    output.probeWeight = hasProbe ? 1.0 : 0.0;
  #elif defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
    // Defer probe volume sampling to fragment when terrain surface samplers are active in VS
    // so active vertex samplers stay <= 16 (WebGL2 minimum) across all macro combinations.
    output.probeIrradiance = vec3(0.0);
    output.probeWeight = 0.0;
  #endif
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
    output.shadowCoord = getShadowCoord(output.positionWS);
  #endif
  gl_Position = output.positionCS;
  // Keep root material evaluation after the existing position and lighting varyings.
  #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
    TerrainProjectLayerBlend root = terrainProjectGrassRootSurface(output.rootPositionWS);
    vec3 rootColor = terrainProjectGroundColor(root, output.rootPositionWS);
    rootColor = terrainProjectBlendFarmGroundColor(rootColor, output.rootPositionWS.xz, farmWeight);
    output.rootGroundBase = vec4(rootColor, root.snowResponse);
    vec3 reliefNormal = output.terrainNormalWS;
    if (reliefWeight > 0.0) {
      reliefNormal = terrainProjectSurfaceReliefNormal(output.rootPositionWS,
        output.terrainNormalWS, root.grassWeight * root.weight);
    }
    output.groundReliefNormalWeight = vec4(reliefNormal, reliefWeight);
  #endif

  return output;
  #endif
}

#ifdef TERRAIN_PROJECT_GRASS_MATTE_LIGHTING
vec3 evaluateMatteGrassLighting(
  Varyings input,
  vec3 albedo,
  vec3 normalWS,
  float shadowAttenuation
) {
  // Dry grass blades have fixed metallic=0.0, roughness=1.0, IOR=1.5 (F0=0.04), AO=1.0.
  // Diffuse albedo is albedo * (1.0 - F0) = albedo * 0.96. Direct GGX specular at roughness=1.0
  // is ~0.01 * dotNL * lightColor, and envBRDFApprox(0.04, 1.0, 1.0, dotNV) * energyCompensation
  // is strictly constant (~0.01646), matching full PBR within <0.3% with 0 cubemap/SSR/GGX cost.
  vec3 diffuseAlbedo = albedo * 0.96;
  vec3 directResponse = diffuseAlbedo + vec3(0.01);
  vec3 totalRadiance = vec3(0.0);

  #ifdef SCENE_DIRECT_LIGHT_COUNT
    for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
        DirectLight directionalLight = getDirectLight(i);
        if (i == 0) {
          directionalLight.color *= shadowAttenuation;
        }
        float dotNL = saturate(dot(normalWS, -directionalLight.direction));
        totalRadiance += dotNL * directionalLight.color * directResponse;
      }
    }
  #endif

  #ifdef SCENE_POINT_LIGHT_COUNT
    for (int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])) {
        PointLight pointLight = getPointLight(i);
        if (dot(pointLight.color, pointLight.color) > 0.0) {
          vec3 lVector = pointLight.position - input.positionWS;
          float distanceSq = dot(lVector, lVector);
          float attenuation = getDistanceAttenuation(distanceSq, pointLight.distance);
          if (attenuation > 0.0) {
            vec3 direction = lVector * inversesqrt(max(distanceSq, 1e-12));
            float dotNL = saturate(dot(normalWS, direction));
            totalRadiance += (dotNL * attenuation) * pointLight.color * directResponse;
          }
        }
      }
    }
  #endif

  #ifdef SCENE_SPOT_LIGHT_COUNT
    for (int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i++) {
      if (!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])) {
        SpotLight spotLight = getSpotLight(i);
        vec3 lVector = spotLight.position - input.positionWS;
        float distanceSq = dot(lVector, lVector);
        float attenuation = getDistanceAttenuation(distanceSq, spotLight.distance);
        if (attenuation > 0.0) {
          vec3 direction = lVector * inversesqrt(max(distanceSq, 1e-12));
          float spotEffect = smoothstep(spotLight.penumbraCos, spotLight.angleCos, dot(direction, -spotLight.direction));
          float dotNL = saturate(dot(normalWS, direction));
          totalRadiance += (dotNL * spotEffect * attenuation) * spotLight.color * directResponse;
        }
      }
    }
  #endif

  #if defined(SCENE_USE_PROBE_VOLUME) || defined(SCENE_USE_SH)
    vec3 globalIrradiance = getGlobalDiffuseIrradiance(normalWS);
  #else
    vec3 globalIrradiance = scene_EnvMapLight.diffuse * PI;
  #endif
  vec3 diffuseIrradiance = globalIrradiance * scene_EnvMapLight.diffuseIntensity;

  #if defined(SCENE_USE_PROBE_VOLUME) && !defined(MATERIAL_DISABLE_PROBE_VOLUME)
    vec3 probeIrradiance;
    bool hasProbe;
    #if defined(TERRAIN_PROJECT_GRASS_VERTEX_PROBE_VOLUME) && defined(RENDERER_HAS_NORMAL)
      probeIrradiance = input.probeIrradiance;
      hasProbe = input.probeWeight > 0.999 && dot(probeIrradiance, vec3(1.0)) > 1e-5;
      if (!hasProbe) {
        vec3 viewDir = normalize(camera_Position - input.positionWS);
        hasProbe = sampleProbeVolume(input.positionWS, normalWS, viewDir, probeIrradiance);
      }
    #else
      vec3 viewDir = normalize(camera_Position - input.positionWS);
      hasProbe = sampleProbeVolume(input.positionWS, normalWS, viewDir, probeIrradiance);
    #endif
    if (hasProbe) {
      diffuseIrradiance = probeIrradiance;
    }
  #endif

  totalRadiance += diffuseIrradiance * (diffuseAlbedo * RECIPROCAL_PI);
  #ifdef SCENE_USE_SPECULAR_ENV
    totalRadiance += globalIrradiance * (0.01646 * RECIPROCAL_PI * scene_EnvMapLight.specularIntensity);
  #endif

  return max(totalRadiance, vec3(0.0));
}
#endif

void GrassFragment(Varyings input) {
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    vec3 shadowPositionDx = dFdx(input.positionWS);
    vec3 shadowPositionDy = dFdy(input.positionWS);
  #endif
  #ifdef MATERIAL_FARM_GROUND_SURFACE
    vec2 farmGroundSample = terrainProjectFarmGroundSample(input.positionWS.xz);
    float farmGroundWeight = farmGroundSample.x;
    if (farmGroundWeight <= 0.0 || farmGroundSample.y >= 0.99) discard;
  #endif
  #if defined(RENDERER_WORLD_PICK) && !defined(MATERIAL_FARM_GROUND_SURFACE)
    float pickId = floor(input.worldPickId + 0.5);
    #ifdef RENDERER_WORLD_PICK_DEPTH
      pickId = floor(gl_FragCoord.z * 16777215.0 + 0.5);
    #endif
    gl_FragColor = vec4(mod(pickId, 256.0), mod(floor(pickId / 256.0), 256.0), floor(pickId / 65536.0), 255.0) / 255.0;
  #elif defined(MATERIAL_FARM_GROUND_SURFACE)
    // Alpha-blended dirt overlay over the already-shaded Terrain surface.
    // Avoids re-evaluating Terrain alphamaps, grass colour field, surface relief, and blade wind.
    vec3 surfaceColor = terrainProjectBlendFarmGroundColor(vec3(0.0), input.positionWS.xz, 1.0);
    vec3 shadingNormal = normalize(input.terrainNormalWS);
    SurfaceData surfaceData = terrainProjectBuildSurfaceData(
      input,
      surfaceColor,
      shadingNormal,
      0.0,
      0.0,
      1.0
    );
    #ifndef SCENE_SURFACE_CLIMATE_DRY
      terrainProjectApplySurfaceClimate(
        surfaceData,
        shadingNormal,
        vec3(1.0, 0.0, material_GrassSurfaceSnowResponse.x)
      );
    #endif
    #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
      float shadowAttenuation = sampleTerrainProjectGroundShadow(input, shadowPositionDx, shadowPositionDy);
    #else
      float shadowAttenuation = sampleTerrainProjectShadow(input);
    #endif
    vec3 color = max(
      terrainProjectFinalLighting(evaluateTerrainProjectLightingWithShadow(input, surfaceData, shadowAttenuation)),
      vec3(0.0)
    );
    #if SCENE_FOG_MODE != 0
      color = fog(vec4(color, 1.0), input.positionVS).rgb;
    #endif
    if (renderer_GrassLodDebugColor.a > 0.0) {
      color = mix(color, renderer_GrassLodDebugColor.rgb, renderer_GrassLodDebugColor.a);
    }
    gl_FragColor = vec4(color, farmGroundWeight);
  #elif defined(TERRAIN_PROJECT_GRASS_PACKED_VARYINGS)
    vec3 surfaceColor = input.rootGroundBase.rgb;
    vec3 shadingNormal = normalize(input.shadingNormalWS);
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
      #if SCENE_SHADOW_CASCADED_COUNT == 1
        vec3 grassShadowCoord = input.shadowCoord;
      #else
        vec3 grassShadowCoord = getShadowCoord(input.positionWS);
      #endif
      float shadowAttenuation = 1.0;
      if (grassShadowCoord.z > 0.0 && grassShadowCoord.z < 1.0) {
        float rawShadow = textureLod(scene_ShadowMap, grassShadowCoord, 0.0);
        float grassShadowFade = getShadowFade(input.positionWS);
        shadowAttenuation = mix(1.0, mix(rawShadow, 1.0, grassShadowFade), scene_ShadowInfo.x);
      }
    #else
      float shadowAttenuation = 1.0;
    #endif
    #ifdef SCENE_VOLUMETRIC_CLOUD_SHADOW
      shadowAttenuation *= sampleVolumetricCloudShadow(input.positionWS);
    #endif
    #ifdef TERRAIN_PROJECT_GRASS_MATTE_LIGHTING
      vec3 color = evaluateMatteGrassLighting(input, surfaceColor, shadingNormal, shadowAttenuation);
    #else
      SurfaceData surfaceData = terrainProjectBuildSurfaceData(
        input,
        surfaceColor,
        shadingNormal,
        0.0,
        0.0,
        1.0
      );
      #ifndef SCENE_SURFACE_CLIMATE_DRY
        if (dot(scene_SurfaceClimate, scene_SurfaceClimate) > 0.0) {
          float bladeAppearanceWeight = terrainProjectGrassBladeAppearanceWeight(input.tipWeight);
          float snowResponse = mix(
            input.rootGroundBase.a,
            material_GrassSurfaceSnowResponse.w,
            bladeAppearanceWeight
          );
          terrainProjectApplySurfaceClimate(
            surfaceData,
            shadingNormal,
            vec3(1.0, 0.0, snowResponse)
          );
        }
      #endif
      vec3 color = max(
        terrainProjectFinalLighting(evaluateTerrainProjectLightingWithShadow(input, surfaceData, shadowAttenuation)),
        vec3(0.0)
      );
    #endif
    #if SCENE_FOG_MODE != 0
      color = fog(vec4(color, 1.0), input.positionVS).rgb;
    #endif
    if (renderer_GrassLodDebugColor.a > 0.0) {
      color = mix(color, renderer_GrassLodDebugColor.rgb, renderer_GrassLodDebugColor.a);
    }
    gl_FragColor = vec4(color, 1.0);
  #else
  vec3 surfaceWeights = max(input.surfaceWeights, vec3(0.0));
  float surfaceWeight = dot(surfaceWeights, vec3(1.0));
  surfaceWeights = surfaceWeight > 0.00001
    ? surfaceWeights / surfaceWeight
    : vec3(1.0, 0.0, 0.0);
  // Match the Terrain layer decision at this candidate root. The same
  // interpolated ownership also drives clump scale in the vertex stage,
  // so short road-edge grass keeps the road/ground colour instead of
  // revealing a detached green base.
  float bladeAppearanceWeight = terrainProjectGrassBladeAppearanceWeight(input.tipWeight);
  #if defined(RENDERER_GRASS_MATCH_GROUND)
    vec3 grassSurfaceColor = grassColorFromField(0.5);
  #elif defined(MATERIAL_GRASS_GROUND_SURFACE)
    // Sample at the fragment's world position, never interpolate a whole plane's corner colours.
    vec3 grassSurfaceColor = evaluateGrassBaseColor(input.positionWS.xz);
  #else
    vec3 grassSurfaceColor = input.grassColor;
  #endif
  vec3 surfaceColor =
    grassSurfaceColor * surfaceWeights.x +
    renderer_GrassRoadColor.rgb * surfaceWeights.y +
    material_GrassGroundColor.rgb * surfaceWeights.z;
  #ifdef RENDERER_ROCK_GRASS_GROUND
    surfaceColor = mix(input.rockGround.rgb, input.grassColor, bladeAppearanceWeight);
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    // One root samples the shared ground field for the complete clump, including
    // bent tips. Wind changes geometry without making colours slide across blades.
    #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
      #if defined(RENDERER_GRASS_MATCH_GROUND) && RENDERER_GRASS_MATCH_GROUND == 1
        surfaceColor = mix(input.rootGroundBase.rgb, surfaceColor, bladeAppearanceWeight);
      #else
        surfaceColor = input.rootGroundBase.rgb;
      #endif
    #else
      vec3 groundPositionWS = input.rootPositionWS;
      TerrainProjectLayerBlend ground = terrainProjectGroundSurface(groundPositionWS);
      vec3 groundColor = terrainProjectGroundColorGrad(
        ground,
        groundPositionWS,
        dFdx(groundPositionWS.xz),
        dFdy(groundPositionWS.xz)
      );
      #if defined(RENDERER_GRASS_MATCH_GROUND) && RENDERER_GRASS_MATCH_GROUND == 1
        surfaceColor = mix(groundColor, surfaceColor, bladeAppearanceWeight);
      #else
        surfaceColor = groundColor;
      #endif
      surfaceColor = terrainProjectBlendFarmGroundColor(surfaceColor, groundPositionWS.xz);
    #endif
  #endif
  // Keep the root lighting normal on the Terrain path as well. The wind geometry and
  // travelling field stay untouched; only the visible root's surface ownership is gated.
  float bladeShadeWeight = terrainProjectGrassBladeShadeWeight(input.tipWeight);
  #ifdef TERRAIN_PROJECT_SURFACE_GRASS_ATTACHMENT_ACTIVE
    vec3 detailGroundNormal = terrainProjectSurfaceGrassNormal(input.terrainNormalWS);
  #else
    vec3 detailGroundNormal = input.terrainNormalWS;
  #endif
  vec3 windFieldNormal = terrainProjectGrassWindFieldNormal(
    detailGroundNormal, input.windCarrierNormalWS, input.windBentNormalWS);
  vec3 shadingNormal = normalize(mix(input.terrainNormalWS, windFieldNormal, bladeShadeWeight));
  #ifdef RENDERER_ROCK_GRASS_GROUND
    shadingNormal = normalize(mix(input.rockGroundNormal.xyz, windFieldNormal, bladeShadeWeight));
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
    float surfaceReliefWeight = input.groundReliefNormalWeight.w;
    #else
    float surfaceReliefWeight = terrainProjectSurfaceReliefWeight(input.rootPositionWS);
    #endif
    #if defined(RENDERER_GRASS_MATCH_GROUND) && RENDERER_GRASS_MATCH_GROUND == 1 && !defined(TERRAIN_PROJECT_GRASS_ROOT_VARYINGS)
      vec3 rootNormal = terrainProjectLayerNormalToWorld(ground.tangentNormal, input.terrainNormalWS);
      shadingNormal = normalize(mix(rootNormal, shadingNormal, bladeShadeWeight));
    #endif
    if (surfaceReliefWeight > 0.0) {
      #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
      vec3 reliefNormal = input.groundReliefNormalWeight.xyz;
      #else
      vec3 reliefNormal = terrainProjectSurfaceReliefNormal(
        input.rootPositionWS, input.terrainNormalWS, ground.grassWeight * ground.weight);
      #endif
      shadingNormal = normalize(mix(shadingNormal, reliefNormal, surfaceReliefWeight));
    }
  #endif
  float groundWindColorWeight =
    clamp(scene_GroundWindShape.z, 0.0, 1.0) * bladeShadeWeight;
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    groundWindColorWeight *= 1.0 - surfaceReliefWeight;
  #endif
  #ifdef RENDERER_GRASS_ROCK_APPEARANCE
    surfaceColor = mix(surfaceColor, input.rockAppearance.rgb, input.rockAppearance.a);
    shadingNormal = normalize(mix(shadingNormal, input.rockAppearanceNormalSnow.xyz, input.rockAppearance.a));
  #endif
  SurfaceData surfaceData = terrainProjectBuildSurfaceData(
    input,
    surfaceColor,
    shadingNormal,
    0.0,
    0.0,
    1.0
  );
  #ifdef RENDERER_ROCK_GRASS_GROUND
    surfaceData.roughness = mix(input.rockGround.a, 1.0, bladeAppearanceWeight);
  #endif
  float groundSnowResponse = dot(
    surfaceWeights,
    material_GrassSurfaceSnowResponse.xyz
  );
  #ifdef RENDERER_ROCK_GRASS_GROUND
    groundSnowResponse = input.rockGroundNormal.w;
  #endif
  #ifdef TERRAIN_PROJECT_GRASS_TERRAIN_SURFACE
    #ifdef TERRAIN_PROJECT_GRASS_ROOT_VARYINGS
      groundSnowResponse = input.rootGroundBase.a;
    #else
      groundSnowResponse = ground.snowResponse;
    #endif
  #endif
  #ifdef RENDERER_GRASS_ROCK_APPEARANCE
    groundSnowResponse = mix(groundSnowResponse, input.rockAppearanceNormalSnow.w, input.rockAppearance.a);
  #endif
  #ifndef SCENE_SURFACE_CLIMATE_DRY
    if (dot(scene_SurfaceClimate, scene_SurfaceClimate) > 0.0) {
      float snowResponse = mix(
        groundSnowResponse,
        material_GrassSurfaceSnowResponse.w,
        bladeAppearanceWeight
      );
      vec3 climateNormal = normalize(mix(
        input.terrainNormalWS,
        windFieldNormal,
        bladeAppearanceWeight
      ));
      // Rain and retained puddles keep porous wetness uniform over the blade. Terrain owns the
      // horizontal standing-water interface; the shared root band retains the same substrate
      // colour, roughness, normal and snow response as the Terrain below it.
      terrainProjectApplySurfaceClimate(
        surfaceData,
        climateNormal,
        vec3(1.0, 0.0, snowResponse)
      );
    }
  #endif
  #ifdef TERRAIN_PROJECT_GROUND_SHADOW_PCF
    float shadowAttenuation = sampleTerrainProjectGroundShadow(input, shadowPositionDx, shadowPositionDy);
  #else
    float shadowAttenuation = sampleTerrainProjectShadow(input);
  #endif
  vec3 color = max(
    terrainProjectFinalLighting(evaluateTerrainProjectLightingWithShadow(input, surfaceData, shadowAttenuation)),
    vec3(0.0)
  );
  if (groundWindColorWeight > 0.0) {
    float groundWindColorContrast = max(scene_GroundWindAdvection.z, 0.001);
    vec3 groundWindColorNormal = terrainProjectGroundWindColorNormal(
      input.terrainNormalWS,
      input.windCarrierNormalWS,
      bladeShadeWeight,
      groundWindColorContrast
    );
    float groundWindRawLightingSweep = terrainProjectGroundWindLightingSweep(
      groundWindColorNormal
    );
    float groundWindBaseLightingSweep = terrainProjectGroundWindLightingSweep(
      input.terrainNormalWS
    );
    float groundWindLightingSweep = terrainProjectGroundWindLightingBand(
      groundWindRawLightingSweep,
      groundWindBaseLightingSweep,
      groundWindColorContrast
    );
    color = terrainProjectApplyGrassGroundWindColor(
      color,
      groundWindLightingSweep,
      groundWindColorWeight,
      groundWindColorContrast
    );
  }
  #if SCENE_FOG_MODE != 0
    color = fog(vec4(color, 1.0), input.positionVS).rgb;
  #endif
  if (renderer_GrassLodDebugColor.a > 0.0) {
    color = mix(color, renderer_GrassLodDebugColor.rgb, renderer_GrassLodDebugColor.a);
  }
  gl_FragColor = vec4(color, 1.0);
  #endif
}
