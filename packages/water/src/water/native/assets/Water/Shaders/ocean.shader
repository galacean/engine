
Shader "AIWorld/Ocean" {
int material_WaterProfile;
int material_WaterRiverDrops;
float material_Water_look_reflectionSampling_screenSpaceCompositeIntensity;
float material_Water_look_reflectionSampling_environmentFallbackIntensity;
float material_Water_look_reflectionSampling_distortionStrength;
float material_Water_look_reflectionSampling_maximumDistortionPixels;
float material_Water_look_reflectionSampling_edgeFadeTexels;
float material_Water_look_reflectionSampling_minimumClipW;
float material_Water_look_reflectionSampling_roughnessFootprintTexels;
float material_Water_look_reflectionSampling_highFilterSampleCount;
float material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness;
float material_Water_look_oceanResponse_timeScale;
float material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond;
float material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio;
float material_Water_look_oceanResponse_microDetailResponse_0_speedRatio;
float material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond;
float material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio;
float material_Water_look_oceanResponse_microDetailResponse_1_speedRatio;
int material_Water_look_foam_enabled;
float material_Water_look_foam_intensity;
vec4 material_Water_look_foam_color;
int material_Water_appearance_appearance_primaryColorClosure;
float material_Water_appearance_appearance_directionalHighlight_strength;
float material_Water_appearance_appearance_directionalHighlight_exponent;
float material_Water_appearance_appearance_directionalHighlight_distortion;
int material_Water_appearance_appearance_directionalHighlight_sharp;
float material_Water_appearance_appearance_depthResponse_terms_0_coefficientPerMeter;
float material_Water_appearance_appearance_depthResponse_terms_1_coefficientPerMeter;
float material_Water_appearance_appearance_boundaryEffects_0_rangeMeters;
int material_Water_appearance_appearance_boundaryEffects_0_invert;
float material_Water_appearance_appearance_boundaryEffects_0_outputs_refractionSuppression;
int material_Water_appearance_appearance_refraction_enabled;
int material_Water_appearance_appearance_refraction_normalSource;
int material_Water_appearance_appearance_refraction_validation;
int material_Water_appearance_appearance_composition;
int material_Water_appearance_featureFlags_externalNormal;
int material_Water_appearance_featureFlags_depthTint;
int material_Water_appearance_featureFlags_coastalAlpha;
int material_Water_appearance_featureFlags_contactFoam;
int material_Water_appearance_featureFlags_directSpecular;
vec3 material_Water_optics_profile_absorptionCoefficient;
vec3 material_Water_optics_profile_scatteringColor;
float material_Water_optics_profile_scatteringCoefficient;
float material_Water_optics_profile_maximumViewDistance;
float material_Water_optics_profile_indexOfRefraction;
float material_Water_optics_profile_maximumSurfaceOpticalDistance;
float material_Water_optics_profile_refractionStrength;
float material_Water_optics_profile_roughness;
float material_Water_optics_profile_reflectionIntensity;
int material_Water_optics_refractionEnabled;
int material_Water_optics_caustics;
int material_Water_reflectionPolicy_policy_preferred;
int material_WaterReflectionFallback0;
int material_WaterReflectionFallback1;
int material_Water_renderState_depthWriteEnabled;
int material_Water_renderState_queue;
float material_Water_renderState_priorityOffset;
int material_Water_renderState_cullMode;
int material_Water_renderState_blendMode;
sampler2D material_Ocean_smoothWaves;
sampler2D material_Ocean_roughWaves;
sampler2D material_Ocean_caustics;
sampler2D material_Ocean_foam;
sampler2D material_Ocean_intersectionNoise;
Editor { Properties {
material_WaterProfile("material_WaterProfile", Enum(lake:0, river:1, ocean:2)) = 2;
material_WaterRiverDrops("material_WaterRiverDrops", Boolean) = false;
material_Water_look_reflectionSampling_screenSpaceCompositeIntensity("material_Water_look_reflectionSampling_screenSpaceCompositeIntensity", Float) = 1;
material_Water_look_reflectionSampling_environmentFallbackIntensity("material_Water_look_reflectionSampling_environmentFallbackIntensity", Float) = 1;
material_Water_look_reflectionSampling_distortionStrength("material_Water_look_reflectionSampling_distortionStrength", Float) = 0.025;
material_Water_look_reflectionSampling_maximumDistortionPixels("material_Water_look_reflectionSampling_maximumDistortionPixels", Float) = 64;
material_Water_look_reflectionSampling_edgeFadeTexels("material_Water_look_reflectionSampling_edgeFadeTexels", Float) = 8;
material_Water_look_reflectionSampling_minimumClipW("material_Water_look_reflectionSampling_minimumClipW", Float) = 0.001;
material_Water_look_reflectionSampling_roughnessFootprintTexels("material_Water_look_reflectionSampling_roughnessFootprintTexels", Float) = 3;
material_Water_look_reflectionSampling_highFilterSampleCount("material_Water_look_reflectionSampling_highFilterSampleCount", Float) = 1;
material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness("material_Water_look_environmentResponse_surfaceNormalVarianceToRoughness", Float) = 0;
material_Water_look_oceanResponse_timeScale("material_Water_look_oceanResponse_timeScale", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond("material_Water_look_oceanResponse_microDetailResponse_0_speedMetresPerSecond", Float) = 0;
material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio("material_Water_look_oceanResponse_microDetailResponse_0_strengthRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_0_speedRatio("material_Water_look_oceanResponse_microDetailResponse_0_speedRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond("material_Water_look_oceanResponse_microDetailResponse_1_speedMetresPerSecond", Float) = 100;
material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio("material_Water_look_oceanResponse_microDetailResponse_1_strengthRatio", Float) = 1;
material_Water_look_oceanResponse_microDetailResponse_1_speedRatio("material_Water_look_oceanResponse_microDetailResponse_1_speedRatio", Float) = 1;
material_Water_look_foam_enabled("material_Water_look_foam_enabled", Boolean) = true;
material_Water_look_foam_intensity("material_Water_look_foam_intensity", Float) = 0.373;
material_Water_look_foam_color("material_Water_look_foam_color", Color) = (1, 1, 1, 1);
material_Water_appearance_appearance_primaryColorClosure("material_Water_appearance_appearance_primaryColorClosure", Enum(physical-volume:0, refracted-albedo-depth-ramp:1, stylized-depth-ramp:2, lit-scene-color-depth-ramp:3, scene-color-composite-depth-ramp:4)) = 4;
material_AppearanceV2MacroNormalStrength("material_AppearanceV2MacroNormalStrength", Float) = 0.16;
material_Water_appearance_appearance_directionalHighlight_strength("material_Water_appearance_appearance_directionalHighlight_strength", Float) = 5;
material_Water_appearance_appearance_directionalHighlight_exponent("material_Water_appearance_appearance_directionalHighlight_exponent", Float) = 616.9759999999997;
material_Water_appearance_appearance_directionalHighlight_distortion("material_Water_appearance_appearance_directionalHighlight_distortion", Float) = 0.702;
material_Water_appearance_appearance_directionalHighlight_sharp("material_Water_appearance_appearance_directionalHighlight_sharp", Boolean) = false;
material_Water_appearance_appearance_depthResponse_terms_0_coefficientPerMeter("material_Water_appearance_appearance_depthResponse_terms_0_coefficientPerMeter", Float) = 0.17;
material_Water_appearance_appearance_depthResponse_terms_1_coefficientPerMeter("material_Water_appearance_appearance_depthResponse_terms_1_coefficientPerMeter", Float) = 4;
material_AppearanceV2DepthShallowColor("material_AppearanceV2DepthShallowColor", Vector4) = (0, 1, 0.98136926, 0.3764706);
material_AppearanceV2DepthDeepColor("material_AppearanceV2DepthDeepColor", Vector4) = (0, 0.16451614, 0.34, 0.98039216);
material_Water_appearance_appearance_boundaryEffects_0_rangeMeters("material_Water_appearance_appearance_boundaryEffects_0_rangeMeters", Float) = 3.04;
material_Water_appearance_appearance_boundaryEffects_0_invert("material_Water_appearance_appearance_boundaryEffects_0_invert", Boolean) = true;
material_Water_appearance_appearance_boundaryEffects_0_outputs_refractionSuppression("material_Water_appearance_appearance_boundaryEffects_0_outputs_refractionSuppression", Float) = 1;
material_Water_appearance_appearance_refraction_enabled("material_Water_appearance_appearance_refraction_enabled", Boolean) = true;
material_AppearanceV2RefractionUvScale("material_AppearanceV2RefractionUvScale", Float) = 0.172;
material_Water_appearance_appearance_refraction_normalSource("material_Water_appearance_appearance_refraction_normalSource", Enum(view-space-delta:0, tangent-space:1, first-detail-layer:2)) = 0;
material_Water_appearance_appearance_refraction_validation("material_Water_appearance_appearance_refraction_validation", Enum(full-scene-depth:0, shifted-scene-depth:1, local-only-safe:2)) = 0;
material_Water_appearance_appearance_composition("material_Water_appearance_appearance_composition", Enum(alpha-blend:0, precomposed-replace:1)) = 1;
material_Water_appearance_featureFlags_externalNormal("material_Water_appearance_featureFlags_externalNormal", Boolean) = true;
material_Water_appearance_featureFlags_depthTint("material_Water_appearance_featureFlags_depthTint", Boolean) = true;
material_Water_appearance_featureFlags_coastalAlpha("material_Water_appearance_featureFlags_coastalAlpha", Boolean) = true;
material_Water_appearance_featureFlags_contactFoam("material_Water_appearance_featureFlags_contactFoam", Boolean) = false;
material_Water_appearance_featureFlags_directSpecular("material_Water_appearance_featureFlags_directSpecular", Boolean) = true;
material_Water_optics_profile_absorptionCoefficient("material_Water_optics_profile_absorptionCoefficient", Vector3) = (0, 0, 0);
material_Water_optics_profile_scatteringColor("material_Water_optics_profile_scatteringColor", Vector3) = (0, 0, 0);
material_Water_optics_profile_scatteringCoefficient("material_Water_optics_profile_scatteringCoefficient", Float) = 0;
material_Water_optics_profile_maximumViewDistance("material_Water_optics_profile_maximumViewDistance", Float) = 500;
material_Water_optics_profile_indexOfRefraction("material_Water_optics_profile_indexOfRefraction", Float) = 1.333;
material_Water_optics_profile_maximumSurfaceOpticalDistance("material_Water_optics_profile_maximumSurfaceOpticalDistance", Float) = 500;
material_Water_optics_profile_refractionStrength("material_Water_optics_profile_refractionStrength", Float) = 0.172;
material_Water_optics_profile_roughness("material_Water_optics_profile_roughness", Float) = 0;
material_Water_optics_profile_reflectionIntensity("material_Water_optics_profile_reflectionIntensity", Float) = 1;
material_Water_optics_refractionEnabled("material_Water_optics_refractionEnabled", Boolean) = true;
material_Water_optics_caustics("material_Water_optics_caustics", Boolean) = true;
material_Water_reflectionPolicy_policy_preferred("material_Water_reflectionPolicy_policy_preferred", Enum(environment:0, ssr:1, analytic:2)) = 0;
material_WaterReflectionFallback0("material_WaterReflectionFallback0", Enum(None:-1, environment:0, ssr:1, analytic:2)) = 2;
material_WaterReflectionFallback1("material_WaterReflectionFallback1", Enum(None:-1, environment:0, ssr:1, analytic:2)) = -1;
material_Water_renderState_depthWriteEnabled("material_Water_renderState_depthWriteEnabled", Boolean) = false;
material_Water_renderState_queue("material_Water_renderState_queue", Enum(opaque:0, alpha-test:1, transparent:2)) = 2;
material_Water_renderState_priorityOffset("material_Water_renderState_priorityOffset", Float) = 0;
material_Water_renderState_cullMode("material_Water_renderState_cullMode", Enum(off:0, front:1, back:2)) = 2;
material_Water_renderState_blendMode("material_Water_renderState_blendMode", Enum(opaque:0, alpha:1, premultiplied-alpha:2, additive:3)) = 1;
material_Ocean_smoothWaves("material_Ocean_smoothWaves", Texture2D);
material_Ocean_roughWaves("material_Ocean_roughWaves", Texture2D);
material_Ocean_caustics("material_Ocean_caustics", Texture2D);
material_Ocean_foam("material_Ocean_foam", Texture2D);
material_Ocean_intersectionNoise("material_Ocean_intersectionNoise", Texture2D);
} }

  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }
      VertexShader = vert;
      FragmentShader = frag;
      Bool material_DepthWriteEnabled;
      BlendState oceanBlend {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState oceanDepth { WriteEnabled = material_DepthWriteEnabled; CompareFunction = CompareFunction.LessEqual; }
      RasterState oceanRaster { CullMode = CullMode.Back; }
      BlendState = oceanBlend;
      DepthState = oceanDepth;
      RasterState = oceanRaster;
      RenderQueueType = Transparent;


      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"

      mat4 camera_ViewInvMat;
      vec4 scene_ElapsedTime;
      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      highp sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      samplerCube material_ReflectionCubeTexture;
#ifndef WATER_ENVIRONMENT_REFLECTION_UNIFORMS_INCLUDED
#define WATER_ENVIRONMENT_REFLECTION_UNIFORMS_INCLUDED

      vec4 material_EnvironmentReflectionParameters;
      float material_EnvironmentFallbackIntensity;
      float material_EnvironmentReflectionMaximumMip;
      vec4 material_EnvironmentReflectionProbePosition;
      vec4 material_EnvironmentReflectionBoxMinimum;
      vec4 material_EnvironmentReflectionBoxMaximum;
      samplerCube material_SecondaryReflectionCubeTexture;
      vec4 material_SecondaryEnvironmentReflectionParameters;
      float material_SecondaryEnvironmentReflectionMaximumMip;
      vec4 material_SecondaryEnvironmentReflectionProbePosition;
      vec4 material_SecondaryEnvironmentReflectionBoxMinimum;
      vec4 material_SecondaryEnvironmentReflectionBoxMaximum;
      float material_EnvironmentReflectionAvailable;
      float material_EnvironmentReflectionBlend;
      #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
      samplerCube material_LocalReflectionCubeTexture;
      float material_LocalEnvironmentReflectionAvailable;
      vec4 material_LocalEnvironmentReflectionParameters;
      float material_LocalEnvironmentReflectionMaximumMip;
      vec4 material_LocalEnvironmentReflectionProbePosition;
      vec4 material_LocalEnvironmentReflectionBoxMinimum;
      vec4 material_LocalEnvironmentReflectionBoxMaximum;
      #endif

#endif

vec3 material_AbsorptionCoefficient;
vec3 material_ScatteringColor;
float material_ScatteringCoefficient;
float material_IndexOfRefraction;
float material_MaximumSurfaceOpticalDistance;
float material_ReflectionIntensity;
float material_Roughness;
float material_OceanFoamEnabled;
float material_OceanFoamIntensity;
float material_RefractionStrength;
float material_RefractionEnabled;

#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;
      float material_AppearanceV2MacroNormalStrength;
      float material_AppearanceV2DirectionalHighlightStrength;
      float material_AppearanceV2DirectionalHighlightExponent;
      float material_AppearanceV2DirectionalHighlightDistortion;
      float material_AppearanceV2DirectionalHighlightSharp;


      float material_AppearanceV2DepthMaximumOpacity;
      float material_AppearanceV2DepthCoefficient0;
      float material_AppearanceV2DepthCoefficient1;
      vec4 material_AppearanceV2DepthShallowColor;
      vec4 material_AppearanceV2DepthDeepColor;
      float material_AppearanceV2DepthDebugView;

      float material_AppearanceV2Boundary0Range;
      float material_AppearanceV2Boundary0RefractionSuppression;




      float material_AppearanceDirectSpecularEnabled;
#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#ifndef WATER_SURFACE_DEPTH_RESPONSE_INCLUDED
#define WATER_SURFACE_DEPTH_RESPONSE_INCLUDED

float waterSurfaceDepthSampleValidity(float rawDepth, float sceneEyeDepth, float surfaceEyeDepth) {
  return step(0.0, sceneEyeDepth)
    * step(sceneEyeDepth, 1000000.0)
    * step(surfaceEyeDepth + 0.000001, sceneEyeDepth)
    * (1.0 - step(0.999999, rawDepth));
}

vec3 waterSurfaceReconstructOpaquePositionWS(
  vec3 surfacePositionWS,
  vec3 cameraPositionWS,
  mat4 cameraViewInverse,
  float surfaceEyeDepth,
  float sceneEyeDepth,
  float orthographicProjection
) {
  float safeSurfaceEyeDepth = max(surfaceEyeDepth, 0.000001);
  vec3 perspectivePosition = cameraPositionWS
    + (surfacePositionWS - cameraPositionWS) * (sceneEyeDepth / safeSurfaceEyeDepth);
  vec3 cameraForwardWS = normalize((cameraViewInverse * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
  vec3 orthographicPosition = surfacePositionWS
    + cameraForwardWS * max(sceneEyeDepth - surfaceEyeDepth, 0.0);
  return mix(perspectivePosition, orthographicPosition, clamp(orthographicProjection, 0.0, 1.0));
}

// Surface-normal depth uses the normalized physical macro normal; scrolling
// detail normals never affect the appearance depth field.
float waterSurfaceNormalDepth(
  vec3 surfacePositionWS,
  vec3 opaquePositionWS,
  vec3 macroNormalWS
) {
  return abs(dot(surfacePositionWS - opaquePositionWS, normalize(macroNormalWS)));
}

float waterSurfaceDerivedSceneRayDepth(
  float verticalDepth,
  vec3 macroNormalWS,
  vec3 viewDirectionWS
) {
  float projectionDenominator = abs(dot(normalize(viewDirectionWS), normalize(macroNormalWS)));
  return min(
    max(verticalDepth, 0.0) / max(projectionDenominator, 0.001),
    1000000.0
  );
}

// max(1-exp(-a), 1-exp(-b)) == 1-exp(-max(a,b)); one exp for one or two terms.
float waterSurfaceCompositeExponentialDensity(float firstScaledDepth, float secondScaledDepth) {
  return clamp(1.0 - exp(-max(max(firstScaledDepth, 0.0), max(secondScaledDepth, 0.0))), 0.0, 1.0);
}

#endif

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
}

vec3 waterSurfaceAppearanceDecodeTangentNormal(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 slope = packedNormal.rg * 2.0 - 1.0;
  slope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  slope *= strength;
  float normalZ = sqrt(max(1.0 - dot(slope, slope), 0.0001));
  normalZ = mix(1.0, normalZ, clamp(strength, 0.0, 1.0));
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(slope, normalZ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
  vec4 packedNormal,
  float strength,
  float flipGreen
) {
  vec2 sourceSlope = packedNormal.rg * 2.0 - 1.0;
  sourceSlope.y *= mix(1.0, -1.0, step(0.5, flipGreen));
  float sourceNormalZ = sqrt(max(1.0 - clamp(dot(sourceSlope, sourceSlope), 0.0, 1.0), 0.0001));
  float normalZ = mix(1.0, sourceNormalZ, clamp(strength, 0.0, 1.0));
  // Do not normalize here: partial-derivative/whiteout blends own the final
  // normalization and must retain the authored XY-to-Z strength relation.
  return vec3(sourceSlope * strength, normalZ);
}

vec3 waterSurfaceAppearanceBlendTangentNormals(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(firstNormal.xy + secondNormal.xy, firstNormal.z * secondNormal.z),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(
  vec3 firstNormal,
  vec3 secondNormal
) {
  return waterSurfaceAppearanceSafeNormalize3(
    vec3(
      firstNormal.xy * secondNormal.z + secondNormal.xy * firstNormal.z,
      firstNormal.z * secondNormal.z
    ),
    vec3(0.0, 0.0, 1.0)
  );
}

vec3 waterSurfaceAppearanceV2BlendAddSlope(vec3 baseNormal, vec3 detailNormal) {
  vec2 slope = baseNormal.xy / max(baseNormal.z, 0.0001)
    + detailNormal.xy / max(detailNormal.z, 0.0001);
  return waterSurfaceAppearanceSafeNormalize3(vec3(slope, 1.0), vec3(0.0, 0.0, 1.0));
}

vec3 waterSurfaceAppearanceV2BlendReoriented(vec3 baseNormal, vec3 detailNormal) {
  vec3 t = baseNormal + vec3(0.0, 0.0, 1.0);
  vec3 u = detailNormal * vec3(-1.0, -1.0, 1.0);
  return waterSurfaceAppearanceSafeNormalize3(
    t * dot(t, u) / max(t.z, 0.0001) - u,
    vec3(0.0, 0.0, 1.0)
  );
}

#endif

float waterSurfaceAppearanceV2RefractionValidity(
  float insideScreen,
  float waterCoverage,
  float shoreSafety,
  float centeredGeometryBehindSurface,
  float shiftedGeometryBehindSurface,
  float shiftedDepthContinuity
) {
  return clamp(insideScreen, 0.0, 1.0)
    * clamp(waterCoverage, 0.0, 1.0)
    * clamp(shoreSafety, 0.0, 1.0)
    * clamp(centeredGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedDepthContinuity, 0.0, 1.0);
}
#endif

#ifndef WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED

      struct WaterSurfaceEnvironmentLight {
        vec3 diffuse;
        float mipMapLevel;
        float diffuseIntensity;
        float specularIntensity;
      };
      WaterSurfaceEnvironmentLight scene_EnvMapLight;
      #ifdef SCENE_USE_SH
        #ifdef SCENE_USE_REALTIME_SH
          #include "ShaderLibrary/Lighting/RealtimeSphericalHarmonics.glsl"
        #else
        vec3 scene_EnvSH[9];
        #endif
      #endif

#endif

      sampler2D material_SmoothWavesTexture;
      sampler2D material_RoughWavesTexture;
      sampler2D material_CausticsTexture;
      sampler2D material_FoamTexture;
      sampler2D material_IntersectionNoiseTexture;
      sampler2D material_NearshoreTexture;
      vec4 material_NearshoreWorldToUv;
      vec4 material_NearshoreDecode;
      vec4 material_NearshoreOutsidePolicy;
      vec2 material_NearshoreCellSize;
      float material_WaterLevel;
      float material_SurfaceTimeOverride;
      float material_CameraFeaturesAvailable;
      float material_DebugView;
      float material_LodDebug;
      float material_OceanBandlimitViewportHeight;
      vec2 material_OceanFarTransition;
      vec4 material_OceanWaveParameters;
      vec3 material_OceanWaveFadeAndTimeScale;
      vec4 material_OceanNormalParameters;
      vec4 material_OceanNormalMapping;
      float material_OceanNormalFadeEndDistance;
      vec4 material_OceanDeepColor;
      vec4 material_OceanHorizonColor;
      vec2 material_OceanFarReflectionFilter;
      float material_OceanReflectionNormalBlend;
      vec4 material_OceanSurfaceFoamParameters;
      vec4 material_OceanSurfaceFoamMapping;
      vec4 material_OceanSurfaceFoamColor;
      vec4 material_OceanIntersectionParameters;
      vec4 material_OceanIntersectionMotion;
      vec4 material_OceanIntersectionColor;
      float material_OceanIntersectionRippleStrength;
      vec4 material_OceanCausticsParameters;
      vec4 material_OceanCausticsMotion;
      vec4 material_OceanTranslucencyParameters;
      float material_OceanTranslucencyCurvatureMask;
      float renderer_OceanLod;
#ifndef WATER_OCEAN_SCENE_FOG_DECLARATIONS_INCLUDED
#define WATER_OCEAN_SCENE_FOG_DECLARATIONS_INCLUDED
#include "ShaderLibrary/Common/Fog.glsl"

#if SCENE_FOG_MODE != 0
float material_OceanSceneFogEnabled;
#endif

vec4 waterOceanApplySceneFog(vec4 color, vec3 positionVS) {
#if SCENE_FOG_MODE != 0
  if (material_OceanSceneFogEnabled > 0.5) {
    return fog(color, positionVS);
  }
#endif
  return color;
}
#endif

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings {
        vec3 worldPosition;
        vec3 macroNormalWS;
        vec3 tangentWS;
        vec3 positionVS;
        vec4 clipPosition;
        float waveOffsetY;
        float lod;
      };

#ifndef WATER_ENVIRONMENT_REFLECTION_INCLUDED
#define WATER_ENVIRONMENT_REFLECTION_INCLUDED

      vec3 waterEnvironmentSrgbToLinear(vec3 color) {
        vec3 low = color / 12.92;
        vec3 high = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
        return mix(low, high, step(vec3(0.04045), color));
      }

      vec3 waterEnvironmentReflectionDirection(
        vec3 directionWS,
        vec3 positionWS,
        vec4 probePosition,
        vec3 boxMinimum,
        vec3 boxMaximum
      ) {
        if (probePosition.w < 0.5) {
          return directionWS;
        }
        vec3 directionSign = mix(
          vec3(-1.0),
          vec3(1.0),
          step(vec3(0.0), directionWS)
        );
        vec3 safeDirection = directionSign * max(abs(directionWS), vec3(0.000001));
        vec3 intersectingPlane = mix(
          boxMinimum,
          boxMaximum,
          step(vec3(0.0), directionWS)
        );
        vec3 intersectionDistances = (intersectingPlane - positionWS) / safeDirection;
        float nearestIntersection = min(
          intersectionDistances.x,
          min(intersectionDistances.y, intersectionDistances.z)
        );
        vec3 projectedDirection = positionWS
          + directionWS * max(nearestIntersection, 0.0)
          - probePosition.xyz;
        float projectedValid = step(0.00000001, dot(projectedDirection, projectedDirection));
        return mix(directionWS, projectedDirection, projectedValid);
      }

      vec3 sampleWaterDistantEnvironmentReflection(vec3 directionWS, vec3 positionWS, float roughness) {
        vec3 originalDirectionWS = directionWS;
        directionWS = waterEnvironmentReflectionDirection(
          directionWS,
          positionWS,
          material_EnvironmentReflectionProbePosition,
          material_EnvironmentReflectionBoxMinimum.xyz,
          material_EnvironmentReflectionBoxMaximum.xyz
        );
        vec2 rotation = material_EnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(roughness, 0.0, 1.0)
          * max(material_EnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            waterEnvironmentSrgbToLinear(reflectedRadiance),
            step(0.5, material_EnvironmentReflectionParameters.w)
          );
        #endif
        reflectedRadiance *= max(material_EnvironmentReflectionParameters.z, 0.0);

        float secondaryWeight = clamp(material_EnvironmentReflectionBlend, 0.0, 1.0);
        if (secondaryWeight > 0.0) {
          vec3 secondaryDirection = waterEnvironmentReflectionDirection(
            originalDirectionWS,
            positionWS,
            material_SecondaryEnvironmentReflectionProbePosition,
            material_SecondaryEnvironmentReflectionBoxMinimum.xyz,
            material_SecondaryEnvironmentReflectionBoxMaximum.xyz
          );
          vec2 secondaryRotation = material_SecondaryEnvironmentReflectionParameters.xy;
          secondaryDirection = vec3(
            secondaryRotation.x * secondaryDirection.x + secondaryRotation.y * secondaryDirection.z,
            secondaryDirection.y,
            -secondaryRotation.y * secondaryDirection.x + secondaryRotation.x * secondaryDirection.z
          );
          float secondaryMipLevel = clamp(roughness, 0.0, 1.0)
            * max(material_SecondaryEnvironmentReflectionMaximumMip, 0.0);
          #ifdef HAS_TEX_LOD
            vec3 secondaryRadiance = textureCubeLodEXT(
              material_SecondaryReflectionCubeTexture,
              secondaryDirection,
              secondaryMipLevel
            ).rgb;
          #else
            vec3 secondaryRadiance = textureCube(
              material_SecondaryReflectionCubeTexture,
              secondaryDirection,
              secondaryMipLevel
            ).rgb;
          #endif
          #ifdef ENGINE_NO_SRGB
            secondaryRadiance = mix(
              secondaryRadiance,
              waterEnvironmentSrgbToLinear(secondaryRadiance),
              step(0.5, material_SecondaryEnvironmentReflectionParameters.w)
            );
          #endif
          secondaryRadiance *= max(material_SecondaryEnvironmentReflectionParameters.z, 0.0);
          reflectedRadiance = mix(reflectedRadiance, secondaryRadiance, secondaryWeight);
        }
        return reflectedRadiance * max(material_EnvironmentFallbackIntensity, 0.0);
      }

      #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
      float waterLocalEnvironmentWeight(vec3 positionWS) {
        if (material_LocalEnvironmentReflectionProbePosition.w < 0.5) {
          return 0.0;
        }
        vec3 distanceToBoundary = min(
          positionWS - material_LocalEnvironmentReflectionBoxMinimum.xyz,
          material_LocalEnvironmentReflectionBoxMaximum.xyz - positionWS
        );
        float nearestBoundary = min(distanceToBoundary.x, min(distanceToBoundary.y, distanceToBoundary.z));
        vec3 boxSize = max(
          material_LocalEnvironmentReflectionBoxMaximum.xyz
            - material_LocalEnvironmentReflectionBoxMinimum.xyz,
          vec3(0.001)
        );
        float fadeWidth = max(min(boxSize.x, min(boxSize.y, boxSize.z)) * 0.1, 0.001);
        return smoothstep(0.0, fadeWidth, nearestBoundary);
      }

      vec3 sampleWaterLocalEnvironmentReflection(vec3 directionWS, vec3 positionWS, float roughness) {
        directionWS = waterEnvironmentReflectionDirection(
          directionWS,
          positionWS,
          material_LocalEnvironmentReflectionProbePosition,
          material_LocalEnvironmentReflectionBoxMinimum.xyz,
          material_LocalEnvironmentReflectionBoxMaximum.xyz
        );
        vec2 rotation = material_LocalEnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(roughness, 0.0, 1.0)
          * max(material_LocalEnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_LocalReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_LocalReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            waterEnvironmentSrgbToLinear(reflectedRadiance),
            step(0.5, material_LocalEnvironmentReflectionParameters.w)
          );
        #endif
        return reflectedRadiance * max(material_LocalEnvironmentReflectionParameters.z, 0.0);
      }
      #endif

      vec3 sampleWaterBaseReflectionRadiance(
        vec3 analyticFallbackRadiance,
        vec3 directionWS,
        vec3 positionWS,
        float roughness
      ) {
        vec3 reflectedRadiance = analyticFallbackRadiance;
        if (material_EnvironmentReflectionAvailable > 0.5) {
          reflectedRadiance = sampleWaterDistantEnvironmentReflection(directionWS, positionWS, roughness);
        }
        #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
        if (material_LocalEnvironmentReflectionAvailable > 0.5) {
          float localWeight = waterLocalEnvironmentWeight(positionWS);
          if (localWeight > 0.0) {
            vec3 localRadiance = sampleWaterLocalEnvironmentReflection(directionWS, positionWS, roughness);
            reflectedRadiance = mix(reflectedRadiance, localRadiance, localWeight);
          }
        }
        #endif
        return reflectedRadiance;
      }

      float waterBaseReflectionAvailable() {
        float available = material_EnvironmentReflectionAvailable;
        #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
          available = max(available, material_LocalEnvironmentReflectionAvailable);
        #endif
        return available;
      }

#endif

#ifndef WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED

      const float WATER_SURFACE_AMBIENT_PI = 3.141592653589793;

      vec3 waterSurfaceAmbientDiffuseRadiance(vec3 normalWS) {
        vec3 ambientIrradiance = scene_EnvMapLight.diffuse * WATER_SURFACE_AMBIENT_PI;
        #ifdef SCENE_USE_SH
          #ifdef SCENE_USE_REALTIME_SH
          ambientIrradiance = getRealtimeLightProbeIrradiance(normalWS);
          #else
          ambientIrradiance = max(
            scene_EnvSH[0]
              + scene_EnvSH[1] * normalWS.y
              + scene_EnvSH[2] * normalWS.z
              + scene_EnvSH[3] * normalWS.x
              + scene_EnvSH[4] * (normalWS.y * normalWS.x)
              + scene_EnvSH[5] * (normalWS.y * normalWS.z)
              + scene_EnvSH[6] * (3.0 * normalWS.z * normalWS.z - 1.0)
              + scene_EnvSH[7] * (normalWS.z * normalWS.x)
              + scene_EnvSH[8] * (normalWS.x * normalWS.x - normalWS.y * normalWS.y),
            vec3(0.0)
          );
          #endif
        #endif
        return ambientIrradiance
          * max(scene_EnvMapLight.diffuseIntensity, 0.0)
          / WATER_SURFACE_AMBIENT_PI;
      }

#endif

#ifndef WATER_SPATIAL_FIELD_DECODE_INCLUDED
#define WATER_SPATIAL_FIELD_DECODE_INCLUDED

float waterSpatialFieldDecodeDepth(
  float encodedDepth,
  float maximumDepth
) {
  return encodedDepth * maximumDepth;
}

float waterSpatialFieldDecodeSignedDistance(
  float encodedDistance,
  float decodeScale,
  float decodeBias,
  float signedDistanceRange
) {
  return (encodedDistance * decodeScale + decodeBias)
    * signedDistanceRange;
}

#endif

#ifndef WATER_SURFACE_BRDF_INCLUDED
#define WATER_SURFACE_BRDF_INCLUDED

const float WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS =
  0.045;
const float WATER_SURFACE_BRDF_EPSILON = 0.000001;
const float WATER_SURFACE_BRDF_RECIPROCAL_PI =
  0.3183098861837907;
const float WATER_SURFACE_BRDF_PI = 3.141592653589793;

float waterSurfaceResolvePerceptualRoughness(float perceptualRoughness) {
  return max(
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS,
    clamp(perceptualRoughness, 0.0, 1.0)
  );
}

float waterSurfaceSchlick(float f0, float f90, float dotLH) {
  float boundedF0 = clamp(f0, 0.0, 1.0);
  float boundedF90 = clamp(f90, 0.0, 1.0);
  return boundedF0
    + (boundedF90 - boundedF0)
      * pow(1.0 - clamp(dotLH, 0.0, 1.0), 5.0);
}

float waterSurfaceGgxDistribution(float alpha, float dotNH) {
  float minimumAlpha =
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS
    * WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS;
  float resolvedAlpha = max(minimumAlpha, alpha);
  float alphaSquared = resolvedAlpha * resolvedAlpha;
  float boundedDotNH = clamp(dotNH, 0.0, 1.0);
  float denominator =
    boundedDotNH * boundedDotNH * (alphaSquared - 1.0) + 1.0;
  return WATER_SURFACE_BRDF_RECIPROCAL_PI * alphaSquared
    / max(
      denominator * denominator,
      WATER_SURFACE_BRDF_EPSILON
    );
}

float waterSurfaceGgxSmithCorrelated(float alpha, float dotNL, float dotNV) {
  float minimumAlpha =
    WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS
    * WATER_SURFACE_BRDF_MIN_PERCEPTUAL_ROUGHNESS;
  float resolvedAlpha = max(minimumAlpha, alpha);
  float alphaSquared = resolvedAlpha * resolvedAlpha;
  float boundedDotNL = clamp(dotNL, 0.0, 1.0);
  float boundedDotNV = clamp(dotNV, 0.0, 1.0);
  float gv = boundedDotNL * sqrt(
    alphaSquared
      + (1.0 - alphaSquared) * boundedDotNV * boundedDotNV
  );
  float gl = boundedDotNV * sqrt(
    alphaSquared
      + (1.0 - alphaSquared) * boundedDotNL * boundedDotNL
  );
  return 0.5 / max(gv + gl, WATER_SURFACE_BRDF_EPSILON);
}

float waterSurfaceDirectSpecular(
  float f0,
  float perceptualRoughness,
  float dotNV,
  float dotNL,
  float dotNH,
  float dotLH
) {
  float resolvedRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float alpha = resolvedRoughness * resolvedRoughness;
  float boundedDotNV = clamp(dotNV, 0.0, 1.0);
  float boundedDotNL = clamp(dotNL, 0.0, 1.0);
  float boundedDotNH = clamp(dotNH, 0.0, 1.0);
  float boundedDotLH = clamp(dotLH, 0.0, 1.0);
  float fresnel = waterSurfaceSchlick(f0, 1.0, boundedDotLH);
  float distribution = waterSurfaceGgxDistribution(alpha, boundedDotNH);
  float visibility =
    waterSurfaceGgxSmithCorrelated(alpha, boundedDotNL, boundedDotNV);
  return fresnel
    * distribution
    * visibility
    * boundedDotNL
    * WATER_SURFACE_BRDF_PI;
}

// Same split-sum DFG fit used by the engine PBR environment BRDF. Every
// reflected-radiance source (distant IBL, Local Probe, or SSR) passes
// through this once after confidence/validity composition.
vec2 waterSurfaceEnvironmentDfg(float perceptualRoughness, float dotNV) {
  vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = clamp(perceptualRoughness, 0.0, 1.0) * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * clamp(dotNV, 0.0, 1.0))) * r.x + r.y;
  return vec2(-1.04, 1.04) * a004 + r.zw;
}

vec3 waterSurfaceEnvironmentSpecularWeight(
  float f0,
  float perceptualRoughness,
  float dotNV
) {
  vec2 dfg = waterSurfaceEnvironmentDfg(perceptualRoughness, dotNV);
  return vec3(f0 * dfg.x + dfg.y);
}

// The mobile Lit closure uses a stable direct-BRDF fit rather than the full
// correlated-Smith evaluation above. Keep it opt-in so physical Water PCG
// materials retain the physically-derived default.
float waterSurfaceLitDirectSpecular(
  float f0,
  float perceptualRoughness,
  float dotNL,
  float dotNH,
  float dotLH
) {
  float resolvedPerceptualRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float roughness = max(
    resolvedPerceptualRoughness * resolvedPerceptualRoughness,
    0.0078125
  );
  float roughnessSquared = max(roughness * roughness, 0.00006103515625);
  float denominator = clamp(dotNH, 0.0, 1.0);
  denominator = denominator * denominator * (roughnessSquared - 1.0) + 1.00001;
  float lightDotHalfSquared = max(
    clamp(dotLH, 0.0, 1.0) * clamp(dotLH, 0.0, 1.0),
    0.1
  );
  float normalization = roughness * 4.0 + 2.0;
  float specularTerm = roughnessSquared
    / max(
      denominator * denominator * lightDotHalfSquared * normalization,
      WATER_SURFACE_BRDF_EPSILON
    );
  return clamp(f0, 0.0, 1.0) * specularTerm * clamp(dotNL, 0.0, 1.0);
}

// Mobile Lit environment term: perceptual roughness controls both the
// prefiltered probe mip and the F0-to-grazing interpolation (Pow4).
float waterSurfaceLitEnvironmentSpecularWeight(
  float f0,
  float perceptualRoughness,
  float dotNV
) {
  float resolvedPerceptualRoughness =
    waterSurfaceResolvePerceptualRoughness(perceptualRoughness);
  float roughness = resolvedPerceptualRoughness * resolvedPerceptualRoughness;
  float surfaceReduction = 1.0 / (roughness * roughness + 1.0);
  float grazingTerm = clamp(
    1.0 - resolvedPerceptualRoughness + clamp(f0, 0.0, 1.0),
    0.0,
    1.0
  );
  float fresnelTerm = pow(1.0 - clamp(dotNV, 0.0, 1.0), 4.0);
  return surfaceReduction * mix(clamp(f0, 0.0, 1.0), grazingTerm, fresnelTerm);
}

#endif

#ifndef WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED
#define WATER_SURFACE_RAW_CONTRIBUTION_INCLUDED

struct WaterSurfaceRawRefractionFactsV2 {
  vec3 centeredSceneSample;
  vec3 displacedSceneSample;
  float displacedSampleValidity;
  float depthWeight;
  float shoreValidity;
  float coverage;
};

struct WaterSurfaceRawReflectionFactsV2 {
  vec3 analyticSample;
  vec3 environmentSample;
  float environmentValidity;
  vec3 ssrPremultipliedSample;
  float ssrValidity;
};

struct WaterSurfaceRawFoamFactsV2 {
  float surfaceSignal;
  float shoreSignal;
  float crestSignal;
  float currentSignal;
  float wakeSignal;
  float contactSignal;
  float localSignal;
  float motionScale;
  float enabled;
};

struct WaterSurfaceRawContributionPolicyV2 {
  float primaryColorClosureModel;
  float refractionEnabled;
  float clarity;
  float boundaryRefractionSuppression;
  float reflectionSource;
  float ssrCompositeIntensity;
  float foamIntensity;
  float calibrationMode;
};

struct WaterSurfaceResolvedRawContributionsV2 {
  vec3 refractionSceneColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float foamWeight;
};

void waterSurfaceSampleRawEnvironmentReflectionV2(
  vec3 directionWS,
  vec3 positionWS,
  float perceptualRoughness,
  out vec3 radiance,
  out float validity
) {
  radiance = vec3(0.0);
  validity = 0.0;
  if (material_EnvironmentReflectionAvailable > 0.5) {
    radiance = sampleWaterDistantEnvironmentReflection(
      directionWS,
      positionWS,
      perceptualRoughness
    );
    validity = 1.0;
  }
  #ifdef MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION
    if (material_LocalEnvironmentReflectionAvailable > 0.5) {
      float localWeight = waterLocalEnvironmentWeight(positionWS);
      if (localWeight > 0.0) {
        vec3 localRadiance = sampleWaterLocalEnvironmentReflection(
          directionWS,
          positionWS,
          perceptualRoughness
        );
        if (validity > 0.5) {
          radiance = mix(radiance, localRadiance, localWeight);
        } else {
          radiance = localRadiance;
          validity = localWeight;
        }
      }
    }
  #endif
}

vec3 waterSurfaceResolveAnalyticReflectionFallbackV2(
  float normalY,
  float perceptualRoughness,
  float environmentIntensity
) {
  return mix(
    vec3(0.075, 0.16, 0.21),
    vec3(0.32, 0.48, 0.57),
    mix(
      clamp(normalY * 0.5 + 0.5, 0.0, 1.0),
      0.5,
      clamp(perceptualRoughness, 0.0, 1.0)
    )
  ) * max(environmentIntensity, 0.0);
}

WaterSurfaceResolvedRawContributionsV2 waterSurfaceResolveRawContributionsV2(
  WaterSurfaceRawRefractionFactsV2 refraction,
  WaterSurfaceRawReflectionFactsV2 reflection,
  WaterSurfaceRawFoamFactsV2 foam,
  WaterSurfaceRawContributionPolicyV2 policy
) {
  WaterSurfaceResolvedRawContributionsV2 resolved;
  float proceduralSignal = max(
    max(
      max(foam.surfaceSignal, foam.shoreSignal),
      foam.crestSignal * 0.68 + foam.currentSignal * 0.32
    ),
    foam.wakeSignal
  ) * max(foam.motionScale, 0.0);
  float foamSignal = clamp(
    max(
      max(proceduralSignal, 0.0) * max(policy.foamIntensity, 0.0),
      max(foam.localSignal, 0.0)
    )
      * step(0.5, foam.enabled)
      * (1.0 - step(0.5, policy.calibrationMode)),
    0.0,
    1.0
  );
  resolved.foamWeight = max(
    smoothstep(0.02, 0.78, foamSignal),
    clamp(foam.contactSignal, 0.0, 1.0)
  );

  float displacedValidity = clamp(
    refraction.displacedSampleValidity
      * step(0.5, policy.refractionEnabled),
    0.0,
    1.0
  );
  resolved.refractionSceneColor = mix(
    refraction.centeredSceneSample,
    refraction.displacedSceneSample,
    displacedValidity
  );
  resolved.refractionWeight = clamp(
    (1.0 - step(1.5, policy.primaryColorClosureModel))
      * displacedValidity
      * clamp(refraction.depthWeight, 0.0, 1.0)
      * clamp(refraction.shoreValidity, 0.0, 1.0)
      * clamp(refraction.coverage, 0.0, 1.0)
      * clamp(policy.clarity, 0.0, 1.0)
      * (1.0 - resolved.foamWeight * 0.94)
      * (1.0 - clamp(policy.boundaryRefractionSuppression, 0.0, 1.0)),
    0.0,
    1.0
  );

  vec3 environment = mix(
    reflection.analyticSample,
    reflection.environmentSample,
    clamp(reflection.environmentValidity, 0.0, 1.0)
  );
  resolved.reflectionRadiance = reflection.analyticSample;
  if (policy.reflectionSource > 2.5) {
    float ssrScale = clamp(policy.ssrCompositeIntensity, 0.0, 1.0);
    float ssrBlend = clamp(reflection.ssrValidity * ssrScale, 0.0, 1.0);
    resolved.reflectionRadiance =
      environment * (1.0 - ssrBlend)
      + reflection.ssrPremultipliedSample * ssrScale;
  } else if (policy.reflectionSource > 0.5) {
    resolved.reflectionRadiance = environment;
  }
  return resolved;
}

#endif

#ifndef WATER_SURFACE_BOUNDED_TRANSLUCENCY_INCLUDED
#define WATER_SURFACE_BOUNDED_TRANSLUCENCY_INCLUDED
// Optional artistic transmission lobe. Geometry supplies the normal and mask;
// lighting response is shared and enters FinalClosure before Fresnel and foam.
vec3 waterSurfaceBoundedTranslucency(
  vec3 tint, vec3 lightRadiance, vec3 lightDirection, vec3 viewDirection,
  vec3 normal, float backStrength, float incidentStrength, float exponent,
  float curvatureWeight, float visibility
) {
  float back = pow(max(dot(-viewDirection, lightDirection), 0.0), max(exponent, 1.0)) * max(backStrength, 0.0);
  float incident = max(dot(lightDirection, normal), 0.0) * max(incidentStrength, 0.0);
  float curvature = clamp(mix(1.0, dot(normal, -lightDirection), curvatureWeight), 0.0, 1.0);
  return max(tint, vec3(0.0)) * max(lightRadiance, vec3(0.0)) * (back + incident) * curvature * clamp(visibility, 0.0, 1.0);
}
#endif

#ifndef WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
#define WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
struct WaterSingleScatteringResult {
  vec3 transmittance;
  vec3 lightTransmittance;
  vec3 scattering;
};

float waterScatteringPhase(float phaseG, float cosine) {
  float g = clamp(phaseG, -0.95, 0.95);
  // UE Schlick approximation with a positivity guard at the authoring limits.
  float k = clamp(1.55 * g - 0.55 * g * g * g, -0.99, 0.99);
  float denominator = 1.0 + k * clamp(cosine, -1.0, 1.0);
  return (1.0 - k * k) / (12.5663706144 * denominator * denominator);
}

WaterSingleScatteringResult waterEvaluateSingleScattering(
  vec3 absorption, vec3 scatteringCoefficient, float phaseG,
  float opticalDistance, float lightDistance, float phaseCosine,
  vec3 sunRadiance, vec3 ambientRadiance
) {
  WaterSingleScatteringResult result;
  vec3 sigmaS = max(scatteringCoefficient, vec3(0.0));
  vec3 sigmaT = max(absorption, vec3(0.0)) + sigmaS;
  result.transmittance = exp(-sigmaT * max(opticalDistance, 0.0));
  result.lightTransmittance = exp(-sigmaT * max(lightDistance, 0.0));
  vec3 incoming = max(sunRadiance, vec3(0.0)) * waterScatteringPhase(phaseG, phaseCosine)
    + max(ambientRadiance, vec3(0.0)) / 12.5663706144;
  result.scattering = incoming * clamp(
    sigmaS * (1.0 - result.transmittance) / max(sigmaT, vec3(0.00001)), vec3(0.0), vec3(1.0)
  );
  return result;
}
#endif

#ifndef WATER_SURFACE_CLOSURE_INCLUDED
#define WATER_SURFACE_CLOSURE_INCLUDED
vec3 waterSurfaceResolvePrimaryColor(
  vec3 sceneColor,
  vec3 surfaceColor,
  vec3 depthColor,
  float depthFactor,
  vec3 diffuseLighting,
  float closureModel
) {
  if (closureModel > 3.5) {
    return mix(sceneColor, depthColor, clamp(depthFactor, 0.0, 1.0)) * max(diffuseLighting, vec3(0.0));
  }
  vec3 stylized = mix(
    surfaceColor,
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
  vec3 litScene = mix(
    clamp(sceneColor, vec3(0.0), vec3(1.0)),
    depthColor * max(diffuseLighting, vec3(0.0)),
    clamp(depthFactor, 0.0, 1.0)
  );
    vec3 sceneCompositeWater = mix(
      surfaceColor,
      depthColor,
      clamp(depthFactor, 0.0, 1.0)
    ) * max(diffuseLighting, vec3(0.0));
    return closureModel > 2.5
      ? sceneCompositeWater
      : (closureModel > 1.5
        ? litScene
        : (closureModel > 0.5 ? stylized : surfaceColor));
}

vec3 waterSurfaceOpticalTransmittance(vec3 absorptionCoefficient, float opticalDepth) {
  return exp(-max(absorptionCoefficient, vec3(0.0)) * max(opticalDepth, 0.0));
}

vec3 waterSurfaceOpticalScattering(
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  float weight = 1.0 - exp(-max(scatteringCoefficient, 0.0) * max(opticalDepth, 0.0));
  return max(scatteringColor, vec3(0.0)) * weight;
}

vec3 waterSurfaceApplyOpticalVolume(
  vec3 surfaceColor,
  vec3 absorptionCoefficient,
  vec3 scatteringColor,
  float scatteringCoefficient,
  float opticalDepth
) {
  return surfaceColor * waterSurfaceOpticalTransmittance(absorptionCoefficient, opticalDepth)
    + waterSurfaceOpticalScattering(scatteringColor, scatteringCoefficient, opticalDepth);
}

vec4 waterSurfaceComposeFinal(vec3 color, float alpha, float precomposedReplace) {
  return vec4(color, mix(clamp(alpha, 0.0, 1.0), 1.0, step(0.5, precomposedReplace)));
}

float waterSurfaceResolveAlphaV2(
  float baseAlpha,
  float clarity,
  float opticalDepth,
  float fresnel,
  float foamWeight,
  float calibrationMode,
  float coastalAlpha,
  float coastalAlphaWeight
) {
  float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clamp(clarity, 0.0, 1.0)) * max(opticalDepth, 0.0));
  float alpha = baseAlpha * mix(0.18, 0.94, absorptionAlpha);
  alpha += clamp(fresnel, 0.0, 1.0) * (1.0 - alpha) * 0.48;
  alpha += clamp(foamWeight, 0.0, 1.0) * 0.3 * (1.0 - step(0.5, calibrationMode));
  alpha = mix(alpha, coastalAlpha, clamp(coastalAlphaWeight, 0.0, 1.0));
  return clamp(alpha, 0.0, 1.0);
}
vec3 waterSurfaceAmplifyMacroNormalSlopes(vec3 macroNormalWS, float strength) {
  vec3 amplified = vec3(
    macroNormalWS.x * max(strength, 0.0),
    macroNormalWS.y,
    macroNormalWS.z * max(strength, 0.0)
  );
  float lengthSquared = dot(amplified, amplified);
  return lengthSquared > 0.00000001
    ? amplified * inversesqrt(lengthSquared)
    : vec3(0.0, 1.0, 0.0);
}

// Vendor-neutral port of the bounded perturbed Blinn-Phong directional highlight.
vec3 waterSurfaceDirectionalHighlightV2(
  vec3 lightRadiance,
  vec3 lightDirectionWS,
  vec3 viewDirectionWS,
  vec3 geometryNormalWS,
  vec3 detailNormalWS,
  float distortion,
  float exponent,
  float strength,
  float sharp
) {
  float safeDistortion = clamp(distortion, 0.0, 2.0);
  vec3 perturbedNormal = normalize(mix(geometryNormalWS, detailNormalWS, safeDistortion));
  vec3 halfVector = normalize(lightDirectionWS + viewDirectionWS + perturbedNormal * safeDistortion);
  float specular = pow(
    clamp(dot(geometryNormalWS, halfVector), 0.0, 1.0),
    max(exponent, 1.0)
  );
  float sharpWeight = step(0.5, sharp);
  specular = mix(specular, step(0.2, specular), sharpWeight);
  float viewFactor = smoothstep(
    0.0,
    0.15,
    clamp(dot(geometryNormalWS, lightDirectionWS), 0.0, 1.0)
  );
  return max(lightRadiance, vec3(0.0))
    * specular
    * max(strength, 0.0)
    * mix(1.0, 0.5, sharpWeight)
  * viewFactor;
}

struct WaterSurfaceFinalClosureV2Input {
  vec3 additionalTransmissionRadiance;
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  vec3 surfaceScatteringCoefficient;
  float surfaceScatteringPhaseG;
  float sceneToSurfaceDistance;
  float phaseCosine;
  vec3 sunRadiance;
  vec3 ambientRadiance;
  float opticalDebugMode;
#endif
  vec3 primarySceneColor;
  vec3 surfaceColor;
  vec3 depthColor;
  float depthFactor;
  vec3 diffuseLighting;
  float primaryColorClosureModel;
  vec3 absorptionCoefficient;
  vec3 scatteringColor;
  float scatteringCoefficient;
  float opticalDepth;
  vec3 refractionColor;
  float refractionWeight;
  vec3 reflectionRadiance;
  float fresnelF0;
  float perceptualRoughness;
  float normalDotView;
  float transmissionFresnelWeight;
  float reflectionIntensity;
  vec3 directSpecularRadiance;
  vec3 boundaryColor;
  vec3 foamColor;
  float foamWeight;
  float baseAlpha;
  float clarity;
  float calibrationMode;
  float coastalAlpha;
  float coastalAlphaWeight;
  float coverage;
  vec3 compositionSceneColor;
  float precomposedReplace;
};

struct WaterSurfaceResolvedLightingV2 {
  vec3 diffuseRadiance;
  vec3 directSpecularRadiance;
};

WaterSurfaceResolvedLightingV2 waterSurfaceCreateResolvedLightingV2(vec3 ambientDiffuseRadiance) {
  WaterSurfaceResolvedLightingV2 lighting;
  lighting.diffuseRadiance = max(ambientDiffuseRadiance, vec3(0.0));
  lighting.directSpecularRadiance = vec3(0.0);
  return lighting;
}

WaterSurfaceResolvedLightingV2 waterSurfaceAccumulateDirectLightingV2(
  WaterSurfaceResolvedLightingV2 lighting,
  vec3 lightRadiance,
  float normalDotView,
  float normalDotLight,
  float normalDotHalf,
  float lightDotHalf,
  float fresnelF0,
  float perceptualRoughness,
  float primaryColorClosureModel,
  float directSpecularEnabled
) {
  vec3 safeLightRadiance = max(lightRadiance, vec3(0.0));
  float safeNormalDotLight = clamp(normalDotLight, 0.0, 1.0);
  float standardDirectSpecular = waterSurfaceDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    normalDotView,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float litDirectSpecular = waterSurfaceLitDirectSpecular(
    fresnelF0,
    perceptualRoughness,
    safeNormalDotLight,
    normalDotHalf,
    lightDotHalf
  );
  float resolvedDirectSpecular = mix(
    standardDirectSpecular,
    litDirectSpecular,
    step(1.5, primaryColorClosureModel) * (1.0 - step(3.5, primaryColorClosureModel))
  ) * clamp(directSpecularEnabled, 0.0, 1.0);
  lighting.diffuseRadiance += safeLightRadiance * safeNormalDotLight;
  lighting.directSpecularRadiance += safeLightRadiance * resolvedDirectSpecular;
  return lighting;
}

vec4 waterSurfaceEvaluateFinalClosureV2(
  WaterSurfaceFinalClosureV2Input closure,
  float foamColorWeight,
  float depthOpacity
) {
  float fresnel = waterSurfaceSchlick(
    closure.fresnelF0,
    1.0,
    closure.normalDotView
  );
#ifdef MATERIAL_WATER_SURFACE_SCATTERING
  WaterSingleScatteringResult medium = waterEvaluateSingleScattering(
    closure.absorptionCoefficient, closure.surfaceScatteringCoefficient, closure.surfaceScatteringPhaseG,
    closure.opticalDepth, closure.sceneToSurfaceDistance, closure.phaseCosine,
    closure.sunRadiance, closure.ambientRadiance
  );
  vec3 tint = mix(closure.surfaceColor, closure.depthColor, clamp(closure.depthFactor, 0.0, 1.0));
  vec3 volume = closure.refractionColor * medium.transmittance * medium.lightTransmittance
    + medium.scattering * max(tint, vec3(0.0));
  vec3 reflectionWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0, closure.perceptualRoughness, closure.normalDotView
  );
  vec3 lit = volume * (1.0 - fresnel)
    + closure.reflectionRadiance * reflectionWeight * max(closure.reflectionIntensity, 0.0)
    + closure.directSpecularRadiance
    + closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  lit = mix(lit, closure.foamColor * max(closure.diffuseLighting, vec3(0.0)), clamp(foamColorWeight, 0.0, 1.0));
  if (closure.opticalDebugMode > 13.5 && closure.opticalDebugMode < 14.5) return vec4(medium.transmittance, 1.0);
  if (closure.opticalDebugMode > 14.5 && closure.opticalDebugMode < 15.5) return vec4(medium.scattering, 1.0);
  // The volume already contains the background. Coverage alone blends its geometric boundary.
  return vec4(mix(closure.compositionSceneColor, lit, clamp(closure.coverage, 0.0, 1.0)), 1.0);
#endif
  vec3 primaryColor = waterSurfaceResolvePrimaryColor(
    closure.primarySceneColor,
    closure.surfaceColor,
    closure.depthColor,
    closure.depthFactor,
    closure.diffuseLighting,
    closure.primaryColorClosureModel
  );
  vec3 opticalVolumeColor = waterSurfaceApplyOpticalVolume(
    primaryColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 baseColor = mix(
    opticalVolumeColor,
    primaryColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 refractedVolumeColor = waterSurfaceApplyOpticalVolume(
    closure.refractionColor,
    closure.absorptionCoefficient,
    closure.scatteringColor,
    closure.scatteringCoefficient,
    closure.opticalDepth
  );
  vec3 resolvedRefractionColor = mix(
    refractedVolumeColor,
    closure.refractionColor,
    step(0.5, closure.primaryColorClosureModel)
  );
  vec3 color = mix(
    baseColor,
    resolvedRefractionColor,
    clamp(closure.refractionWeight, 0.0, 1.0) * (1.0 - step(1.5, closure.primaryColorClosureModel))
  );
  vec3 boundaryContribution = closure.boundaryColor * max(closure.diffuseLighting, vec3(0.0));
  float litSceneColorClosure = step(1.5, closure.primaryColorClosureModel);
  color += boundaryContribution * litSceneColorClosure;
    color += closure.additionalTransmissionRadiance;
    // Match the energy removed from a rough transmitted lobe to its integrated
    // environment BRDF; smooth Schlick would blacken a rough grazing horizon.
    float transmissionFresnel = clamp(waterSurfaceEnvironmentSpecularWeight(
      closure.fresnelF0, closure.perceptualRoughness, closure.normalDotView
    ).x, 0.0, 1.0);
  color *= mix(
    1.0,
    1.0 - transmissionFresnel,
    clamp(closure.transmissionFresnelWeight, 0.0, 1.0)
  );
  vec3 reflectionBrdfWeight = waterSurfaceEnvironmentSpecularWeight(
    closure.fresnelF0,
    closure.perceptualRoughness,
    closure.normalDotView
  );
  color += closure.reflectionRadiance
    * reflectionBrdfWeight
    * max(closure.reflectionIntensity, 0.0);
  color += closure.directSpecularRadiance;
  color += boundaryContribution * (1.0 - litSceneColorClosure);
  vec3 litFoamColor = closure.foamColor * max(closure.diffuseLighting, vec3(0.0));
  color = mix(color, litFoamColor, clamp(foamColorWeight, 0.0, 1.0));
    float sceneColorCompositeClosure = step(2.5, closure.primaryColorClosureModel) * (1.0 - step(3.5, closure.primaryColorClosureModel));
    float sceneCompositeWeight = clamp(
      closure.depthFactor * clamp(depthOpacity, 0.0, 1.0) + foamColorWeight,
      0.0,
      1.0
    ) * clamp(closure.coverage, 0.0, 1.0);
    color = mix(
      color,
      mix(closure.primarySceneColor, color, sceneCompositeWeight),
      sceneColorCompositeClosure
    );

  float alpha = waterSurfaceResolveAlphaV2(
    closure.baseAlpha,
    closure.clarity,
    closure.opticalDepth,
    fresnel,
    closure.foamWeight,
    closure.calibrationMode,
    closure.coastalAlpha,
    closure.coastalAlphaWeight
  ) * clamp(closure.coverage, 0.0, 1.0);
  float replace = step(0.5, closure.precomposedReplace);
    color = mix(
      color,
      mix(closure.compositionSceneColor, color, alpha),
      replace * (1.0 - sceneColorCompositeClosure)
    );
  return waterSurfaceComposeFinal(color, alpha, replace);
}

// Existing backends retain their opaque depth colors unless they supply depth opacity.
vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure, float foamColorWeight) {
  return waterSurfaceEvaluateFinalClosureV2(closure, foamColorWeight, 1.0);
}

vec4 waterSurfaceEvaluateFinalClosureV2(WaterSurfaceFinalClosureV2Input closure) {
  return waterSurfaceEvaluateFinalClosureV2(closure, closure.foamWeight);
}

// Shared editor picking output; normal rendering retains the resolved optical closure.
#ifdef RENDERER_WORLD_PICK
float renderer_WorldPickBase;
#endif
float renderer_WorldSelectionMode;
vec4 renderer_WorldSelectionAppearance;
vec4 waterSurfaceOutputWithPick(vec4 color) {
#ifdef RENDERER_WORLD_PICK
  if (color.a <= 0.001) discard;
  float id = floor(renderer_WorldPickBase + 0.5);
  #ifdef RENDERER_WORLD_PICK_DEPTH
    id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
  #endif
  return vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
#else
  if (renderer_WorldSelectionMode >= 0.5) {
    vec2 p = gl_FragCoord.xy * renderer_WorldSelectionAppearance.yz * 2.0;
    float phase = renderer_WorldSelectionAppearance.x * 6.2831853;
    // Smooth warped colour pools instead of parallel rainbow stripes. Exact 2.4s loop.
    float field = p.y * 3.0 + sin(p.x * 4.0 + p.y * 2.0) * 0.7;
    float flow = field + phase + 0.24 * sin(phase + p.x * 5.0);
    // Match the saturated spectrum used by generation reveal effects.
    vec3 film = 0.54 + 0.46 * cos(flow + 6.2831853 * vec3(0.03, 0.36, 0.69));
    float sheen = pow(0.5 + 0.5 * sin(flow + p.x * 1.4), 8.0);
    // HDR emission feeds the existing scene Bloom before tonemapping.
    vec3 highlighted = mix(color.rgb, film, 0.82) + film * (1.2 + sheen * 0.8);
    // Fade the entire highlight, including HDR emission, back to the live material.
    float breath = 0.5 - 0.5 * cos(phase);
    color.rgb = mix(color.rgb, highlighted, renderer_WorldSelectionAppearance.w * breath);
  }
  return color;
#endif
}

#endif

#ifndef WATER_OCEAN_DIAGNOSTICS_INCLUDED
#define WATER_OCEAN_DIAGNOSTICS_INCLUDED

// Linear colors; the common output stage applies the display transfer function.
vec3 oceanDepthDensityColor(float density) {
  return mix(vec3(0.12, 0.80, 0.68), vec3(0.008, 0.035, 0.20), clamp(density, 0.0, 1.0));
}

vec3 oceanUnavailableDiagnosticColor() {
  float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 18.0));
  return mix(vec3(0.075, 0.060, 0.10), vec3(0.12, 0.10, 0.16), stripe);
}

#endif

#ifndef WATER_OCEAN_FAR_FIELD_INCLUDED
#define WATER_OCEAN_FAR_FIELD_INCLUDED

      vec3 oceanFarFieldSafeNormalize(
        vec3 value,
        vec3 fallbackValue
      ) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 oceanFarFieldSrgbToLinear(vec3 color) {
        vec3 low = color / 12.92;
        vec3 high = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
        return mix(low, high, step(vec3(0.04045), color));
      }

      // Reflecting a normal slope doubles its angular excursion. Preserve the
      // unresolved reflection cone with one prefiltered environment lookup.
      vec3 oceanFarReflectionDirection(vec3 viewDirection) {
        vec3 direction = reflect(-viewDirection, vec3(0.0, 1.0, 0.0));
        direction.y = sqrt(direction.y * direction.y + 4.0 * material_OceanFarReflectionFilter.y);
        return normalize(direction);
      }

      float oceanFarReflectionNormalDotView(vec3 viewDirection) {
        // For a symmetric Gaussian slope, E[max(slope, 0)] = sigma / sqrt(2*pi).
        // This bounded moment avoids treating the whole wave distribution as
        // a single positive RMS slope, which removes too much grazing reflection.
        float normalDotView = clamp(viewDirection.y, 0.0, 1.0);
        float positiveSlopeMeanSquared = material_OceanFarReflectionFilter.y * 0.159154943;
        return clamp(sqrt(normalDotView * normalDotView + positiveSlopeMeanSquared), 0.0, 1.0);
      }

      vec3 sampleOceanFarFieldReflection(vec3 analyticFallback, vec3 directionWS) {
        if (material_EnvironmentReflectionAvailable < 0.5) return analyticFallback;
        vec2 rotation = material_EnvironmentReflectionParameters.xy;
        vec3 sampleDirection = vec3(
          rotation.x * directionWS.x + rotation.y * directionWS.z,
          directionWS.y,
          -rotation.y * directionWS.x + rotation.x * directionWS.z
        );
        float mipLevel = clamp(material_OceanFarReflectionFilter.x, 0.0, 1.0)
          * max(material_EnvironmentReflectionMaximumMip, 0.0);
        #ifdef HAS_TEX_LOD
          vec3 reflectedRadiance = textureCubeLodEXT(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #else
          vec3 reflectedRadiance = textureCube(
            material_ReflectionCubeTexture,
            sampleDirection,
            mipLevel
          ).rgb;
        #endif
        #ifdef ENGINE_NO_SRGB
          reflectedRadiance = mix(
            reflectedRadiance,
            oceanFarFieldSrgbToLinear(reflectedRadiance),
            step(0.5, material_EnvironmentReflectionParameters.w)
          );
        #endif
        return reflectedRadiance
          * max(material_EnvironmentReflectionParameters.z, 0.0)
          * max(material_EnvironmentFallbackIntensity, 0.0);
      }

      // Far diagnostics report the same deep-water/flat-normal approximation
      // used by the far renderer. Missing scene/detail signals are not zero data.
      vec3 oceanFarFieldDiagnostic(float view, vec3 worldPosition, float coverage, float shoreDistance) {
        if (view < 2.5) return vec3(0.5, 1.0, 0.5);
        if (view < 3.5) return oceanDepthDensityColor(1.0);
        if (view < 4.5) return vec3(clamp(shoreDistance / max(material_NearshoreDecode.y, 0.001) * 0.5 + 0.5, 0.0, 1.0));
        if (view < 5.5) return oceanUnavailableDiagnosticColor();
        if (view < 6.5) {
          vec3 viewDirection = oceanFarFieldSafeNormalize(camera_Position - worldPosition, vec3(0.0, 1.0, 0.0));
          return sampleOceanFarFieldReflection(
            waterSurfaceResolveAnalyticReflectionFallbackV2(1.0, material_OceanFarReflectionFilter.x, 1.0),
            oceanFarReflectionDirection(viewDirection)
          );
        }
        if (view < 8.5) return oceanUnavailableDiagnosticColor();
        if (view < 9.5) {
          vec3 lightVector = -scene_SunlightDirection;
          return waterSurfaceAmbientDiffuseRadiance(vec3(0.0, 1.0, 0.0))
            + max(scene_SunlightColor.rgb, vec3(0.0))
              * step(0.00000001, dot(lightVector, lightVector))
              * max(oceanFarFieldSafeNormalize(lightVector, vec3(0.0, 1.0, 0.0)).y, 0.0);
        }
        return vec3(coverage);
      }

      vec3 oceanFarFieldRadiance(vec3 worldPosition) {
        const vec3 surfaceNormal = vec3(0.0, 1.0, 0.0);
        vec3 viewDirection = oceanFarFieldSafeNormalize(
          camera_Position - worldPosition,
          surfaceNormal
        );
        float horizonFactor = pow(
          1.0 - clamp(dot(viewDirection, surfaceNormal), 0.0, 1.0),
          8.0
        ) * material_OceanHorizonColor.a;
        vec3 baseColor = mix(
          material_OceanDeepColor.rgb,
          material_OceanHorizonColor.rgb,
          horizonFactor
        );

        vec3 lightVector = -scene_SunlightDirection;
        float sunlightAvailable = step(0.00000001, dot(lightVector, lightVector));
        vec3 lightDirection = oceanFarFieldSafeNormalize(lightVector, surfaceNormal);
        vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * sunlightAvailable;
        vec3 diffuseLighting = waterSurfaceAmbientDiffuseRadiance(surfaceNormal)
          + sunlightColor * max(dot(surfaceNormal, lightDirection), 0.0);
        // Scene-texture-free capability: a fully opaque deep-water limit,
        // with flat geometric normal and rough environment sampling.
#ifndef WATER_OCEAN_FAR_GEOMETRY_BRIDGE_INCLUDED
#define WATER_OCEAN_FAR_GEOMETRY_BRIDGE_INCLUDED

vec3 waterSurface_positionWS = worldPosition;
vec3 waterSurface_macroNormalWS = vec3(0.0, 1.0, 0.0);
vec3 waterSurface_tangentWS = vec3(1.0, 0.0, 0.0);
vec3 waterSurface_bitangentWS = vec3(0.0, 0.0, 1.0);
vec2 waterSurface_meshUv = worldPosition.xz;
vec2 waterSurface_flowWS = vec2(0.0);
float waterSurface_coverage = 1.0;
float waterSurface_verticalDepth = material_MaximumSurfaceOpticalDistance;
float waterSurface_horizontalShoreDistance = material_NearshoreDecode.y;
float waterSurface_obstacleContact = 0.0;
float waterSurface_waveCrest = 0.0;

#endif

        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = vec3(0.0);
        rawRefractionFacts.displacedSceneSample = vec3(0.0);
        rawRefractionFacts.displacedSampleValidity = 0.0;
        rawRefractionFacts.depthWeight = 0.0;
        rawRefractionFacts.shoreValidity = 1.0;
        rawRefractionFacts.coverage = waterSurface_coverage;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = waterSurfaceResolveAnalyticReflectionFallbackV2(1.0, material_OceanFarReflectionFilter.x, 1.0);
        rawReflectionFacts.environmentSample = sampleOceanFarFieldReflection(rawReflectionFacts.analyticSample, oceanFarReflectionDirection(viewDirection));
        rawReflectionFacts.environmentValidity = material_EnvironmentReflectionAvailable;
        rawReflectionFacts.ssrPremultipliedSample = vec3(0.0);
        rawReflectionFacts.ssrValidity = 0.0;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = 0.0;
        rawFoamFacts.shoreSignal = 0.0;
        rawFoamFacts.crestSignal = 0.0;
        rawFoamFacts.currentSignal = 0.0;
        rawFoamFacts.wakeSignal = 0.0;
        rawFoamFacts.contactSignal = 0.0;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 0.0;
        rawFoamFacts.enabled = 0.0;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 3.0;
        rawContributionPolicy.refractionEnabled = 0.0;
        rawContributionPolicy.clarity = 1.0;
        rawContributionPolicy.boundaryRefractionSuppression = 0.0;
        rawContributionPolicy.reflectionSource = 1.0;
        rawContributionPolicy.ssrCompositeIntensity = 0.0;
        rawContributionPolicy.foamIntensity = 0.0;
        rawContributionPolicy.calibrationMode = 0.0;
        WaterSurfaceResolvedRawContributionsV2 contributions = waterSurfaceResolveRawContributionsV2(rawRefractionFacts, rawReflectionFacts, rawFoamFacts, rawContributionPolicy);
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.additionalTransmissionRadiance = vec3(0.0);
        closureInput.primarySceneColor = vec3(0.0);
        closureInput.surfaceColor = baseColor;
        closureInput.depthColor = baseColor;
        closureInput.depthFactor = 1.0;
        closureInput.diffuseLighting = diffuseLighting;
        closureInput.primaryColorClosureModel = 3.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = waterSurface_verticalDepth;
        closureInput.refractionColor = contributions.refractionSceneColor;
        closureInput.refractionWeight = 0.0;
        closureInput.reflectionRadiance = contributions.reflectionRadiance;
        closureInput.fresnelF0 = pow((material_IndexOfRefraction - 1.0) / (material_IndexOfRefraction + 1.0), 2.0);
        // Far mip filtering suppresses unresolved detail; it does not change the material BRDF.
        closureInput.perceptualRoughness = material_Roughness;
        closureInput.normalDotView = oceanFarReflectionNormalDotView(viewDirection);
        closureInput.transmissionFresnelWeight = 1.0;
        closureInput.reflectionIntensity = material_ReflectionIntensity;
        closureInput.directSpecularRadiance = vec3(0.0);
        closureInput.boundaryColor = vec3(0.0);
        closureInput.foamColor = vec3(1.0);
        closureInput.foamWeight = contributions.foamWeight;
        closureInput.baseAlpha = 1.0;
        closureInput.clarity = 1.0;
        closureInput.calibrationMode = 0.0;
        closureInput.coastalAlpha = 1.0;
        closureInput.coastalAlphaWeight = 1.0;
        closureInput.coverage = waterSurface_coverage;
        closureInput.compositionSceneColor = vec3(0.0);
        closureInput.precomposedReplace = 1.0;
        return waterSurfaceEvaluateFinalClosureV2(closureInput).rgb;
      }

#endif


      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

#ifndef WATER_OCEAN_REFRACTION_0_INCLUDED
#define WATER_OCEAN_REFRACTION_0_INCLUDED

      vec3 reconstructOpaquePositionWS(vec2 uv, float eyeDepth) {
        vec2 ndc = uv * 2.0 - 1.0;
        vec3 positionVS;
        #ifdef CAMERA_ORTHOGRAPHIC
          positionVS = vec3(
            ndc.x / camera_ProjMat[0][0],
            ndc.y / camera_ProjMat[1][1],
            -eyeDepth
          );
        #else
          positionVS = vec3(
            ndc.x * eyeDepth / camera_ProjMat[0][0],
            ndc.y * eyeDepth / camera_ProjMat[1][1],
            -eyeDepth
          );
        #endif
        return (camera_ViewInvMat * vec4(positionVS, 1.0)).xyz;
      }

#endif

#ifndef WATER_OCEAN_SURFACE_DETAIL_0_INCLUDED
#define WATER_OCEAN_SURFACE_DETAIL_0_INCLUDED

      vec3 decodeNormalMap(vec3 encoded) {
        return safeNormalize3(encoded * 2.0 - 1.0, vec3(0.0, 0.0, 1.0));
      }

      vec3 blendNormalRnm(vec3 first, vec3 second) {
        return safeNormalize3(
          vec3(first.xy + second.xy, first.z * second.z - dot(first.xy, second.xy)),
          vec3(0.0, 0.0, 1.0)
        );
      }

#endif

#ifndef WATER_OCEAN_REFRACTION_1_INCLUDED
#define WATER_OCEAN_REFRACTION_1_INCLUDED

      float smoothstep01(float value) {
        float bounded = clamp(value, 0.0, 1.0);
        return bounded * bounded * (3.0 - 2.0 * bounded);
      }

      float screenEdgeMask(vec2 screenUv, float refractionLength) {
        float reciprocalLength = 1.0 / max(refractionLength, 0.000001);
        vec2 remapped = clamp(
          vec2(reciprocalLength) - abs(screenUv * 2.0 - 1.0) * reciprocalLength,
          vec2(0.0),
          vec2(1.0)
        );
        return smoothstep01(remapped.x) * smoothstep01(remapped.y);
      }

      vec2 physicalRefractionOffset(
        vec2 screenUv,
        vec3 cameraForwardWS,
        vec3 tangentWorldNormal,
        float strength
      ) {
        // An identical medium has no displacement, including the artistic edge fallback.
        if (material_IndexOfRefraction == 1.0) return vec2(0.0);
        vec3 physicalRefractionRayWS = refract(
          -cameraForwardWS,
          tangentWorldNormal,
          1.0 / material_IndexOfRefraction
        );
        vec3 physicalRefractionRayVS = mat3(camera_ViewMat) * physicalRefractionRayWS;
        float edgeMask = screenEdgeMask(screenUv, length(physicalRefractionRayVS.xy));
        vec2 normalFallback = tangentWorldNormal.xz * 0.5;
        return mix(normalFallback, physicalRefractionRayVS.xy, edgeMask) * strength;
      }

      float screenInterior(vec2 uv) {
        return step(0.001, uv.x) * step(uv.x, 0.999)
          * step(0.001, uv.y) * step(uv.y, 0.999);
      }

#endif

#ifndef WATER_OCEAN_SURFACE_DETAIL_1_INCLUDED
#define WATER_OCEAN_SURFACE_DETAIL_1_INCLUDED

      vec4 packedUv(vec2 sourceUv, vec2 tiling, vec2 timeValue, float speed, float subTiling, float subSpeed) {
        vec2 baseSpeed = vec2(speed) * tiling;
        vec2 uv1 = sourceUv * tiling + timeValue * baseSpeed;
        vec2 tiling2 = tiling * subTiling;
        vec2 uv2 = sourceUv * tiling2 + timeValue * (speed * subSpeed * tiling2);
        return vec4(uv1, uv2);
      }

#endif

#ifndef WATER_CONNECTION_FUNCTIONS
#define WATER_CONNECTION_FUNCTIONS
#ifdef MATERIAL_WATER_CONNECTIONS
float material_WaterConnectionCount;
vec4 material_WaterConnectionFrames[4];
vec4 material_WaterConnectionRanges[4];
vec4 material_WaterConnectionBounds[4];
vec4 material_WaterConnectionShoreFields[4];
sampler2D material_WaterConnectionShoreAtlas;
#endif

// motion, SSR contribution, reserved (-1), coverage.
vec4 waterConnectionFacts(vec2 p) {
  vec4 result = vec4(1.0, 1.0, -1.0, 1.0);
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 frame = material_WaterConnectionFrames[i];
    vec4 range = material_WaterConnectionRanges[i];
    vec2 delta = p - frame.xy;
    float along = dot(delta, frame.zw);
    float across = abs(dot(delta, vec2(frame.w, -frame.z)));
    vec4 bounds = material_WaterConnectionBounds[i];
    if (across <= range.x && p.x >= bounds.x && p.y >= bounds.y && p.x <= bounds.z && p.y <= bounds.w &&
      (along * range.z < 0.0 || (along == 0.0 && range.z < 0.0))) result.w = 0.0;
    if (abs(along) <= range.y && across <= range.x) {
      float weight = smoothstep(0.0, range.y, abs(along));
      result.x = min(result.x, weight);
      result.y = min(result.y, mix(1.0, weight, range.w));

    }
  }
#endif
  return result;
}
float waterConnectionShore(vec2 p, float original) {
  float result = original;
#ifdef MATERIAL_WATER_CONNECTIONS
  for (int i = 0; i < 4; i++) {
    if (float(i) >= material_WaterConnectionCount) break;
    vec4 field = material_WaterConnectionShoreFields[i];
    vec2 grid = (p - field.xy) * field.z;
    float edge = min(min(grid.x, grid.y), min(64.0 - grid.x, 64.0 - grid.y));
    if (edge <= 0.0) continue;
    vec2 uv = vec2((grid.x + 0.5) / 65.0, (grid.y + 0.5 + float(i) * 65.0) / 260.0);
    vec2 encoded = texture2D(material_WaterConnectionShoreAtlas, uv).rg;
    float shore = (dot(encoded, vec2(256.0, 1.0)) / 257.0 * 2.0 - 1.0) * 64.0;
    result = mix(result, shore, smoothstep(0.0, 4.0, edge));
  }
#endif
  return result;
}
vec3 waterConnectionNormal(vec2 p, vec3 normal) {
  return normalize(mix(vec3(0.0, 1.0, 0.0), normal, waterConnectionFacts(p).x));
}
#endif
#ifndef WATER_OCEAN_GEOMETRY_INCLUDED
#define WATER_OCEAN_GEOMETRY_INCLUDED

      float oceanMaximum4(vec4 value) {
        return max(max(value.x, value.y), max(value.z, value.w));
      }

      vec4 oceanGeometryWaveWavelength(vec4 frequency) {
        const float twoPi = 6.283185307179586;
        return vec4(twoPi) / max(frequency, vec4(0.0001));
      }

      vec4 oceanGeometryWaveGridWeight(vec4 wavelength, float samplingCellSize) {
        vec4 samplesPerWavelength = wavelength / max(samplingCellSize, 0.0001);
        return smoothstep(
          vec4(2.0),
          vec4(4.0),
          samplesPerWavelength
        );
      }

      vec4 oceanGeometryWaveViewWeight(
        vec4 wavelength,
        vec4 directionAB,
        vec4 directionCD,
        float viewDistance,
        vec3 viewDirection,
        float projectedPixelsPerMetre,
        float grazingWeight
      ) {
        vec4 waveViewAlignment = abs(vec4(
          dot(directionAB.xy, viewDirection.xz),
          dot(directionAB.zw, viewDirection.xz),
          dot(directionCD.xy, viewDirection.xz),
          dot(directionCD.zw, viewDirection.xz)
        ));
        vec4 projectedDirectionScale = sqrt(max(
          vec4(1.0) - waveViewAlignment * waveViewAlignment,
          vec4(0.0)
        ));
        vec4 projectedPixelsPerWavelength = wavelength
          * projectedPixelsPerMetre
          * projectedDirectionScale;
        vec4 projectedPixelWeight = smoothstep(
          vec4(2.0),
          vec4(6.0),
          projectedPixelsPerWavelength
        );
        vec4 viewDistanceWavelengths = vec4(viewDistance) / wavelength;
        vec4 distanceWeight = vec4(1.0) - smoothstep(
          vec4(12.0),
          vec4(48.0),
          viewDistanceWavelengths
        );
        return projectedPixelWeight * distanceWeight * grazingWeight;
      }

      void applyWaveGroup(
        vec2 restXZ,
        vec4 amplitude,
        vec4 frequency,
        vec4 phase,
        vec4 steepness,
        vec4 directionAB,
        vec4 directionCD,
        vec4 waveBandlimitWeight,
        inout vec3 offset,
        inout vec3 normalSum
      ) {
        vec4 weightedAmplitude = amplitude * waveBandlimitWeight;
        float maximumAmplitude = max(
          max(abs(weightedAmplitude.x), abs(weightedAmplitude.y)),
          max(abs(weightedAmplitude.z), abs(weightedAmplitude.w))
        );
        if (maximumAmplitude > 0.0001) {
          vec4 angles = frequency * vec4(
            dot(directionAB.xy, restXZ),
            dot(directionAB.zw, restXZ),
            dot(directionCD.xy, restXZ),
            dot(directionCD.zw, restXZ)
          ) + phase;
          vec4 cosine = cos(angles);
          vec4 sine = sin(angles);
          vec4 horizontalAB = steepness.xxyy * directionAB * weightedAmplitude.xxyy;
          vec4 horizontalCD = steepness.zzww * directionCD * weightedAmplitude.zzww;
          offset += vec3(
            dot(cosine, vec4(horizontalAB.xz, horizontalCD.xz)),
            dot(sine, weightedAmplitude),
            dot(cosine, vec4(horizontalAB.yw, horizontalCD.yw))
          );

          vec4 normalAB = frequency.xxyy * weightedAmplitude.xxyy * directionAB;
          vec4 normalCD = frequency.zzww * weightedAmplitude.zzww * directionCD;
          vec3 groupNormal = vec3(0.0, 2.0, 0.0);
          groupNormal.x -= dot(cosine, vec4(normalAB.xz, normalCD.xz));
          groupNormal.z -= dot(cosine, vec4(normalAB.yw, normalCD.yw));
          // Keep the geometry normal independent of artistic shading strength.
          normalSum += normalize(groupNormal);
        }
      }

#endif


      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 worldPosition4 = renderer_ModelMat * attributes.POSITION;
        vec2 restXZ = worldPosition4.xz;
        vec3 restWorldPosition = vec3(restXZ.x, material_WaterLevel, restXZ.y);
        vec3 cameraVector = camera_Position - restWorldPosition;
        float viewDistance = max(length(cameraVector), 0.001);
        float distanceToCamera = distance(camera_Position.xz, restXZ);
        float fadeFactor = clamp(
          (material_OceanWaveFadeAndTimeScale.y - distanceToCamera)
            / max(material_OceanWaveFadeAndTimeScale.y - material_OceanWaveFadeAndTimeScale.x, 0.0001),
          0.0,
          1.0
        );
        fadeFactor *= 1.0 - smoothstep(
          material_OceanFarTransition.x,
          material_OceanFarTransition.y,
          viewDistance
        );
        float elapsedTime = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        vec2 sourceTime = vec2(-elapsedTime) * material_OceanWaveFadeAndTimeScale.z;
        vec4 phase = vec4(
          1.2 * sourceTime.x,
          1.375 * sourceTime.y,
          1.1 * sourceTime.x,
          1.0 * sourceTime.y
        ) * material_OceanWaveParameters.z;
        vec4 amplitude = vec4(0.3, 0.35, 0.25, 0.25);
        vec4 frequency = vec4(3.9000000000000004, 4.050000000000001, 3.75, 3.75)
          * max(1.0 - material_OceanWaveParameters.y, 0.001);
        vec4 steepness = vec4(36.0) * material_OceanWaveParameters.w;
        vec4 directionAB = vec4(-0.3, -0.85, -0.85, -0.25);
        vec4 directionCD = vec4(-0.1, -0.9, 0.5, 0.5);
        vec3 offset = vec3(0.0);
        vec3 normalSum = vec3(0.0);
        vec4 waveBandlimitWeight = vec4(0.0);
        vec4 waveWavelength = oceanGeometryWaveWavelength(frequency);
        vec4 waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);

        // Preserve Ocean's inclusive i <= WaveCount loop and cumulative fade/frequency mutation.
        if (oceanMaximum4(waveGridWeight) > 0.0) {
          vec3 viewDirection = cameraVector / viewDistance;
          float projectedPixelsPerMetre = 0.5
            * max(material_OceanBandlimitViewportHeight, 1.0)
            * abs(camera_ProjMat[1][1]);
          #ifndef CAMERA_ORTHOGRAPHIC
            projectedPixelsPerMetre /= viewDistance;
          #endif
          float grazingWeight = smoothstep(
            0.035,
            0.14,
            abs(viewDirection.y)
          );
#ifndef WATER_OCEAN_WAVE_SPECTRUM_INCLUDED
#define WATER_OCEAN_WAVE_SPECTRUM_INCLUDED

          // Three inclusive spectrum groups, each evaluating four wave lanes.
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

          frequency *= 1.5;
          waveWavelength = oceanGeometryWaveWavelength(frequency);
          waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

          frequency *= 2.0;
          waveWavelength = oceanGeometryWaveWavelength(frequency);
          waveGridWeight = oceanGeometryWaveGridWeight(waveWavelength, attributes.TEXCOORD_0.x);
          amplitude *= fadeFactor;
          if (oceanMaximum4(waveGridWeight) > 0.0) {
            waveBandlimitWeight = waveGridWeight * oceanGeometryWaveViewWeight(
          waveWavelength,
          directionAB,
          directionCD,
          viewDistance,
          viewDirection,
          projectedPixelsPerMetre,
          grazingWeight
            );
            applyWaveGroup(
              restXZ,
              amplitude,
              frequency,
              phase,
              steepness,
              directionAB,
              directionCD,
              waveBandlimitWeight,
              offset,
              normalSum
            );
          }

#endif

        }

        offset.y /= 2.0;
        offset.xz *= 0.01 * material_OceanWaveParameters.x;
        offset.y *= material_OceanWaveParameters.x;
        offset *= waterConnectionFacts(worldPosition4.xz).x;
        worldPosition4.xyz += offset;
        worldPosition4.y += material_WaterLevel;
        vec3 macroNormal = waterConnectionNormal(worldPosition4.xz, safeNormalize3(normalSum, vec3(0.0, 1.0, 0.0)));
        vec3 tangent = safeNormalize3(vec3(1.0, -macroNormal.x / max(macroNormal.y, 0.05), 0.0), vec3(1.0, 0.0, 0.0));
        output.worldPosition = worldPosition4.xyz;
        output.macroNormalWS = macroNormal;
        output.tangentWS = tangent;
        output.positionVS = (camera_ViewMat * worldPosition4).xyz;
        output.clipPosition = camera_VPMat * worldPosition4;
        output.waveOffsetY = offset.y;
        output.lod = renderer_OceanLod;
        gl_Position = output.clipPosition;
        return output;
      }

#ifndef WATER_OCEAN_SURFACE_DETAIL_2_INCLUDED
#define WATER_OCEAN_SURFACE_DETAIL_2_INCLUDED

      vec3 sampleDetailNormal(vec2 worldXZ, vec3 worldPosition, float elapsedTime) {
        vec2 timeValue = vec2(-elapsedTime) * material_OceanWaveFadeAndTimeScale.z;
        vec4 farUv = packedUv(
          worldXZ,
          vec2(material_OceanNormalMapping.z),
          timeValue,
          material_OceanNormalParameters.z * 0.5,
          0.5,
          0.15
        );
        vec3 farA = decodeNormalMap(texture2D(material_RoughWavesTexture, farUv.xy).rgb);
        vec3 farB = decodeNormalMap(texture2D(material_RoughWavesTexture, farUv.zw).rgb);
        vec3 farNormal = blendNormalRnm(farA, farB);
        float pixelDistance = distance(camera_Position, worldPosition);
        float fadeFactor = clamp(
          (material_OceanNormalFadeEndDistance - pixelDistance)
            / max(material_OceanNormalFadeEndDistance - material_OceanNormalMapping.w, 0.0001),
          0.0,
          1.0
        );
        if (fadeFactor <= 0.0) {
          return safeNormalize3(farNormal, vec3(0.0, 0.0, 1.0));
        }

        vec4 nearUv = packedUv(
          worldXZ,
          material_OceanNormalMapping.xy,
          timeValue,
          material_OceanNormalParameters.z,
          material_OceanNormalParameters.y,
          material_OceanNormalParameters.w
        );
        vec3 nearA = decodeNormalMap(texture2D(material_SmoothWavesTexture, nearUv.xy).rgb);
        vec3 nearB = decodeNormalMap(texture2D(material_SmoothWavesTexture, nearUv.zw).rgb);
        vec3 nearNormal = blendNormalRnm(nearA, nearB);
        return safeNormalize3(mix(farNormal, nearNormal, fadeFactor), vec3(0.0, 0.0, 1.0));
      }

#endif



      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        vec2 nearshoreUv = input.worldPosition.xz * material_NearshoreWorldToUv.xy
          + material_NearshoreWorldToUv.zw;
        vec4 outsideEdges = vec4(
          1.0 - step(0.0, nearshoreUv.x),
          step(1.000001, nearshoreUv.x),
          1.0 - step(0.0, nearshoreUv.y),
          step(1.000001, nearshoreUv.y)
        );
        float outsideAtlas = max(max(outsideEdges.x, outsideEdges.y), max(outsideEdges.z, outsideEdges.w));
        float outsideWet = mix(1.0, material_NearshoreOutsidePolicy.x, outsideEdges.x)
          * mix(1.0, material_NearshoreOutsidePolicy.y, outsideEdges.y)
          * mix(1.0, material_NearshoreOutsidePolicy.z, outsideEdges.z)
          * mix(1.0, material_NearshoreOutsidePolicy.w, outsideEdges.w);
        vec4 nearshoreSample = texture2D(material_NearshoreTexture, clamp(nearshoreUv, vec2(0.0), vec2(1.0)));
        float sampledVerticalDepth = waterSpatialFieldDecodeDepth(
          nearshoreSample.b,
          max(material_NearshoreDecode.x, 0.0001)
        );
        float sampledShoreDistance = waterSpatialFieldDecodeSignedDistance(
          nearshoreSample.a,
          2.0078740157480315,
          -1.0078740157480315,
          material_NearshoreDecode.y
        );
        float verticalDepth = mix(
          sampledVerticalDepth,
          max(material_NearshoreDecode.x, 0.0001) * outsideWet,
          outsideAtlas
        );
        float shoreDistance = mix(
          sampledShoreDistance,
          mix(-material_NearshoreDecode.y, material_NearshoreDecode.y, outsideWet),
          outsideAtlas
        );
        float shoreAntialias = max(
          max(material_NearshoreCellSize.x, material_NearshoreCellSize.y) * 0.42,
          max(fwidth(shoreDistance) * 1.25, material_NearshoreDecode.y * (2.0 / 255.0))
        );
        shoreDistance = waterConnectionShore(input.worldPosition.xz, shoreDistance);
        float atlasCoverage = smoothstep(-shoreAntialias, shoreAntialias, shoreDistance);
        float coverage = mix(atlasCoverage, outsideWet, outsideAtlas);
        if (coverage <= 0.001) discard;

#ifndef WATER_OCEAN_GEOMETRY_BRIDGE_INCLUDED
#define WATER_OCEAN_GEOMETRY_BRIDGE_INCLUDED

vec3 waterSurface_positionWS = input.worldPosition;
vec3 waterSurface_macroNormalWS = input.macroNormalWS;
vec3 waterSurface_tangentWS = input.tangentWS;
vec3 waterSurface_bitangentWS = normalize(cross(input.macroNormalWS, input.tangentWS));
vec2 waterSurface_meshUv = nearshoreUv;
vec2 waterSurface_flowWS = vec2(0.0);
float waterSurface_coverage = coverage;
float waterSurface_verticalDepth = verticalDepth;
float waterSurface_horizontalShoreDistance = shoreDistance;
float waterSurface_obstacleContact = 0.0;
float waterSurface_waveCrest = max(input.waveOffsetY, 0.0);

#endif

        float farFieldWeight = smoothstep(
          material_OceanFarTransition.x,
          material_OceanFarTransition.y,
          distance(camera_Position, input.worldPosition)
        );
        if (
          farFieldWeight >= 0.999
          && material_DebugView < 0.5
          && material_LodDebug < 0.5
        ) {
          vec3 farFieldColor = oceanFarFieldRadiance(input.worldPosition);
#if SCENE_FOG_MODE != 0
        {
          farFieldColor = waterOceanApplySceneFog(
            vec4(farFieldColor, 1.0),
            input.positionVS
          ).rgb;
        }
#endif

          vec4 farWaterClosure = vec4(farFieldColor, coverage);
gl_FragColor = waterSurfaceOutputWithPick(farWaterClosure);
        } else {
          float elapsedTime = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        vec3 macroNormal = waterSurfaceAmplifyMacroNormalSlopes(waterSurface_macroNormalWS, material_AppearanceV2MacroNormalStrength);
        // Rebuild the detail frame around the shading normal after slope amplification.
        vec3 tangent = safeNormalize3(
          input.tangentWS - macroNormal * dot(input.tangentWS, macroNormal),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 bitangent = safeNormalize3(cross(macroNormal, tangent), vec3(0.0, 0.0, 1.0));
        vec3 tangentNormal = sampleDetailNormal(input.worldPosition.xz, input.worldPosition, elapsedTime);
        vec3 detailNormal = safeNormalize3(
          tangent * tangentNormal.x + bitangent * tangentNormal.y + macroNormal * tangentNormal.z,
          macroNormal
        );
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, vec3(0.0, 1.0, 0.0));
        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;
        float surfaceEyeDepth = -input.positionVS.z;
        float centeredDepthRaw = texture2D(camera_DepthTexture, screenUv).r;
        float centeredEyeDepth = remapDepthBufferEyeDepth(centeredDepthRaw);
        float centeredDepthAvailable = material_CameraFeaturesAvailable
          * step(surfaceEyeDepth + 0.0001, centeredEyeDepth)
          * step(centeredDepthRaw, 0.999999);
        float centeredViewDepth = max(centeredEyeDepth - surfaceEyeDepth, 0.0) * centeredDepthAvailable;
        vec3 centeredOpaquePosition = reconstructOpaquePositionWS(screenUv, centeredEyeDepth);

        detailNormal = waterConnectionNormal(input.worldPosition.xz, detailNormal);
        vec3 cameraForwardWS = safeNormalize3(
          -camera_ViewInvMat[2].xyz,
          safeNormalize3(input.worldPosition - camera_Position, vec3(0.0, 0.0, -1.0))
        );
        vec2 refractionOffset = physicalRefractionOffset(
          screenUv,
          cameraForwardWS,
          detailNormal,
          material_RefractionEnabled * material_RefractionStrength * material_AppearanceV2RefractionUvScale
        ) / max(abs(input.clipPosition.w), 1.0);
        vec2 requestedDisplacedUv = screenUv + refractionOffset;
        float refractionScreenInterior = screenInterior(requestedDisplacedUv);
        vec2 requestedDepthUv = mix(screenUv, requestedDisplacedUv, refractionScreenInterior);
        float requestedDisplacedDepthRaw = texture2D(camera_DepthTexture, requestedDepthUv).r;
        float requestedDisplacedEyeDepth = remapDepthBufferEyeDepth(requestedDisplacedDepthRaw);
        float refractionValidity = material_CameraFeaturesAvailable
          * refractionScreenInterior
          * step(surfaceEyeDepth + 0.0001, requestedDisplacedEyeDepth)
          * step(requestedDisplacedDepthRaw, 0.999999);
        refractionOffset *= refractionValidity;
        vec2 displacedUv = screenUv + refractionOffset;
        float displacedDepthRaw = mix(centeredDepthRaw, requestedDisplacedDepthRaw, refractionValidity);
        float displacedEyeDepth = remapDepthBufferEyeDepth(displacedDepthRaw);
        float displacedDepthAvailable = material_CameraFeaturesAvailable
          * step(surfaceEyeDepth + 0.0001, displacedEyeDepth)
          * step(displacedDepthRaw, 0.999999);
        // Preserve the centered scene for boundary composition; the shared resolver
        // selects between actual centered/displaced facts after validity gating.
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 refractedSceneColor = texture2D(camera_OpaqueTexture, displacedUv).rgb;
        float fallbackViewDepth = mix(verticalDepth, centeredViewDepth, centeredDepthAvailable);
        float viewDepth = mix(
          fallbackViewDepth,
          max(displacedEyeDepth - surfaceEyeDepth, 0.0),
          displacedDepthAvailable
        );
        float sceneRayEyeScale = surfaceEyeDepth / max(length(camera_Position - input.worldPosition), 0.001);
        vec3 fieldViewDirection = viewDirection;
#ifdef CAMERA_ORTHOGRAPHIC
        sceneRayEyeScale = 1.0;
        fieldViewDirection = cameraForwardWS;
#endif
        float fallbackRayDistance = waterSurfaceDerivedSceneRayDepth(verticalDepth, waterSurface_macroNormalWS, fieldViewDirection);
        float sceneRayDepth = mix(fallbackRayDistance, viewDepth / max(sceneRayEyeScale, 0.001), max(centeredDepthAvailable, displacedDepthAvailable));
        vec3 refractedOpaquePosition = reconstructOpaquePositionWS(displacedUv, displacedEyeDepth);
        vec3 authoredOpaquePosition = input.worldPosition - vec3(0.0, verticalDepth, 0.0);
        vec3 opaquePosition = mix(authoredOpaquePosition, centeredOpaquePosition, centeredDepthAvailable);
        opaquePosition = mix(opaquePosition, refractedOpaquePosition, displacedDepthAvailable);
        float exactSurfaceNormalDepth = abs(dot(
          input.worldPosition - opaquePosition,
          normalize(waterSurface_macroNormalWS)
        ));
        float sampledSurfaceNormalDepth = mix(
          verticalDepth,
          exactSurfaceNormalDepth,
          max(centeredDepthAvailable, displacedDepthAvailable)
        );
        float grazingCorrection = pow(
          1.0 - clamp(dot(viewDirection, waterSurface_macroNormalWS), 0.0, 1.0),
          64.0
        );
        float surfaceNormalDepth = mix(sampledSurfaceNormalDepth, viewDepth, grazingCorrection);

        float centeredDepthBehind = smoothstep(0.03, 0.22, centeredViewDepth);
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = 1.0;
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
        float appearanceBoundaryField0 = waterSurface_horizontalShoreDistance;
        float appearanceBoundaryRawNormalized0 = appearanceBoundaryField0
          / max(material_AppearanceV2Boundary0Range, 0.0001);
        float appearanceBoundaryNormalized0 = clamp(
          appearanceBoundaryRawNormalized0,
          0.0,
          1.0
        );
        float appearanceBoundaryMask0 = smoothstep(0.0, 1.0, appearanceBoundaryNormalized0);
        appearanceBoundaryMask0 = 1.0 - appearanceBoundaryMask0;


        appearanceBoundaryMask0 *= 1.0;
        appearanceBoundaryRefractionSuppression = max(
          appearanceBoundaryRefractionSuppression,
          appearanceBoundaryMask0
            * material_AppearanceV2Boundary0RefractionSuppression
            * material_AppearanceV2BoundaryMaterialEnabled
        );
#endif

        float effectiveSurfaceRoughness = clamp(
          material_Roughness + appearanceBoundaryRoughness,
          0.045,
          1.0
        );
#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_0_INCLUDED
        float appearanceDepthTerm0 = max(viewDepth, 0.0)
          * material_AppearanceV2DepthCoefficient0;
        float appearanceDepthTerm1 = max(surfaceNormalDepth, 0.0)
          * material_AppearanceV2DepthCoefficient1;
        float appearanceDepthTintFactor = waterSurfaceCompositeExponentialDensity(
          appearanceDepthTerm0,
          appearanceDepthTerm1
        );
        vec3 appearanceDepthShallowColor = material_AppearanceV2DepthShallowColor.rgb;
        vec3 appearanceDepthTintColor = material_AppearanceV2DepthDeepColor.rgb;
        appearanceDepthTintColor = appearanceDepthTintColor * (1.0 - appearanceBoundaryAlbedoWeight) + appearanceBoundaryAlbedo;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + appearanceBoundaryAlbedoWeight, 0.0, 1.0);
#endif

        float waterDensity = appearanceDepthTintFactor;
        vec4 baseColor = mix(material_AppearanceV2DepthShallowColor, material_AppearanceV2DepthDeepColor, waterDensity);
        float waterFog = waterDensity * baseColor.a;

        vec2 offsetVector = clamp(vec2(input.waveOffsetY) + detailNormal.xz, vec2(0.0), vec2(1.0));
        float verticalIntersectionGradient = 1.0 - clamp(
          exp(surfaceNormalDepth) / material_OceanIntersectionParameters.y,
          0.0,
          1.0
        );
        float shoreIntersectionGradient = appearanceBoundaryMask0;
        float intersectionGradient = max(verticalIntersectionGradient, shoreIntersectionGradient) * coverage;
        float intersectionDistance = clamp(
          intersectionGradient / material_OceanIntersectionParameters.z,
          0.0,
          1.0
        );
        float intersection = 0.0;
        if (material_OceanIntersectionParameters.x > 0.0) {
          if (intersectionDistance > 0.0) {
            vec2 intersectionTime = vec2(-elapsedTime) * material_OceanIntersectionMotion.x;
            vec2 intersectionUv = (
              input.worldPosition.xz + offsetVector * material_OceanIntersectionMotion.z
            ) * material_OceanIntersectionParameters.w + intersectionTime;
            float intersectionNoise = texture2D(material_IntersectionNoiseTexture, intersectionUv).r;
            float intersectionSine = sin(
              intersectionTime.y * 10.0 - intersectionGradient * material_OceanIntersectionMotion.w
            ) * material_OceanIntersectionRippleStrength;
            intersectionNoise = clamp(
              (intersectionNoise + intersectionSine) * intersectionDistance + intersectionDistance,
              0.0,
              1.0
            );
            intersection = step(material_OceanIntersectionMotion.y, intersectionNoise)
              * coverage * material_OceanIntersectionParameters.x;
          } else if (material_OceanIntersectionMotion.y <= 0.0) {
            intersection = coverage * material_OceanIntersectionParameters.x;
          }
        }

        // Non-River Ocean keeps water.slope at zero; vertex alpha is absent on this generated mesh.
        float baseFoam = clamp(material_OceanSurfaceFoamParameters.y, 0.0, 1.0);
        float foamMask = clamp(1.0 - baseFoam, 0.0, 1.0);
        vec4 foamUv = packedUv(
          input.worldPosition.xz + offsetVector * material_OceanSurfaceFoamMapping.y,
          material_OceanSurfaceFoamMapping.zw,
          vec2(-elapsedTime),
          material_OceanSurfaceFoamParameters.w,
          material_OceanSurfaceFoamParameters.z,
          material_OceanSurfaceFoamMapping.x
        );
        float foamTexture = clamp(
          texture2D(material_FoamTexture, foamUv.xy).r
            + texture2D(material_FoamTexture, foamUv.zw).r,
          0.0,
          1.0
        );
        float surfaceFoam = smoothstep(foamMask, foamMask + 1.0, foamTexture)
          * material_OceanSurfaceFoamColor.a * material_OceanSurfaceFoamParameters.x;
        float flattening = clamp(max(intersection, surfaceFoam), 0.0, 1.0);
        detailNormal = safeNormalize3(mix(detailNormal, macroNormal, flattening), macroNormal);

        float horizonFactor = pow(1.0 - clamp(dot(viewDirection, vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 8.0) * material_OceanHorizonColor.a;
        vec3 lightDirectionVector = -scene_SunlightDirection;
        float sunlightAvailable = step(0.00000001, dot(lightDirectionVector, lightDirectionVector));
        vec3 lightDirection = safeNormalize3(lightDirectionVector, vec3(0.0, 1.0, 0.0));
        vec3 unshadowedSunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * sunlightAvailable;
        float cloudShadowAttenuation = sampleVolumetricCloudShadow(input.worldPosition);
        vec3 sunlightColor = unshadowedSunlightColor * cloudShadowAttenuation;
        vec3 diffuseNormal = safeNormalize3(
          mix(macroNormal, detailNormal, material_OceanNormalParameters.x),
          macroNormal
        );
        vec3 ambientDiffuse = waterSurfaceAmbientDiffuseRadiance(diffuseNormal);
        WaterSurfaceResolvedLightingV2 lighting = waterSurfaceCreateResolvedLightingV2(ambientDiffuse);
        lighting = waterSurfaceAccumulateDirectLightingV2(lighting, sunlightColor,
          clamp(dot(diffuseNormal, viewDirection), 0.0, 1.0), max(dot(diffuseNormal, lightDirection), 0.0),
          0.0, 0.0, 0.02, material_Roughness, 3.0, 0.0);
        vec3 diffuseLighting = lighting.diffuseRadiance;

        vec3 reflectionNormal = safeNormalize3(mix(macroNormal, detailNormal, material_OceanReflectionNormalBlend), macroNormal);
        vec3 analyticReflection = waterSurfaceResolveAnalyticReflectionFallbackV2(reflectionNormal.y, material_Roughness, 1.0);
        vec3 reflectionDirection = reflect(-viewDirection, reflectionNormal);
        float reflectionNormalDotView = clamp(dot(reflectionNormal, viewDirection), 0.0, 1.0);
        float reflectionSamplingRoughness = material_Roughness;
        if (farFieldWeight > 0.0) {
          // Converge the sampling facts before blending the remaining near-only
          // depth/foam/transmission contributions into the far closure.
          reflectionDirection = safeNormalize3(mix(
            reflectionDirection, oceanFarReflectionDirection(viewDirection), farFieldWeight
          ), vec3(0.0, 1.0, 0.0));
          reflectionNormalDotView = mix(
            reflectionNormalDotView, oceanFarReflectionNormalDotView(viewDirection), farFieldWeight
          );
          reflectionSamplingRoughness = mix(material_Roughness, material_OceanFarReflectionFilter.x, farFieldWeight);
        }
        vec3 environmentReflection;
        float environmentValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(reflectionDirection, waterSurface_positionWS, reflectionSamplingRoughness, environmentReflection, environmentValidity);
        vec3 sunReflection = waterSurfaceDirectionalHighlightV2(
          sunlightColor, lightDirection, viewDirection, macroNormal, detailNormal,
          material_AppearanceV2DirectionalHighlightDistortion, material_AppearanceV2DirectionalHighlightExponent,
          material_AppearanceV2DirectionalHighlightStrength, material_AppearanceV2DirectionalHighlightSharp
        );
        float edgeFade = clamp(surfaceNormalDepth / 0.187, 0.0, 1.0);
        float causticsMask = clamp(
          (1.0 - waterFog) - intersection - surfaceFoam,
          0.0,
          1.0
        ) * coverage;
        float mainLightIntensity = dot(unshadowedSunlightColor, vec3(0.3, 0.59, 0.11));
        float causticsWeight = causticsMask * material_OceanCausticsParameters.y
          * mainLightIntensity * cloudShadowAttenuation * material_OceanCausticsParameters.x;
        vec3 caustics = vec3(0.0);
        if (causticsWeight > 0.0) {
          vec2 causticsTime = vec2(-elapsedTime) * material_OceanCausticsMotion.x;
          vec2 causticsBase = opaquePosition.xz
            + mix(macroNormal, detailNormal, material_OceanCausticsParameters.w).xz;
          vec3 causticsA = texture2D(
            material_CausticsTexture,
            causticsBase * material_OceanCausticsMotion.y + causticsTime
          ).rgb;
          vec3 causticsB = texture2D(
            material_CausticsTexture,
            causticsBase * material_OceanCausticsMotion.y * 0.8 - causticsTime
          ).rgb;
          caustics = min(causticsA, causticsB) * 2.0;
          caustics = mix(caustics.rrr, caustics, material_OceanCausticsParameters.z) * causticsWeight;
        }

        vec3 translucencyRadiance = waterSurfaceBoundedTranslucency(
          material_AppearanceV2DepthShallowColor.rgb, sunlightColor, lightDirection, viewDirection,
          safeNormalize3(macroNormal + detailNormal * 0.1, macroNormal),
          material_OceanTranslucencyParameters.y, material_OceanTranslucencyParameters.z,
          material_OceanTranslucencyParameters.w, material_OceanTranslucencyCurvatureMask,
          clamp(waterFog + edgeFade, 0.0, 1.0) * material_OceanTranslucencyParameters.x
        );
        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredSceneColor;
        rawRefractionFacts.displacedSceneSample = refractedSceneColor;
        rawRefractionFacts.displacedSampleValidity = refractionValidity;
        rawRefractionFacts.depthWeight = 1.0 - waterFog;
        rawRefractionFacts.shoreValidity = edgeFade;
        rawRefractionFacts.coverage = waterSurface_coverage;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = analyticReflection;
        rawReflectionFacts.environmentSample = environmentReflection;
        rawReflectionFacts.environmentValidity = environmentValidity;
        rawReflectionFacts.ssrPremultipliedSample = vec3(0.0);
        rawReflectionFacts.ssrValidity = 0.0;
        WaterSurfaceRawFoamFactsV2 rawFoamFacts;
        rawFoamFacts.surfaceSignal = surfaceFoam;
        rawFoamFacts.shoreSignal = intersection;
        rawFoamFacts.crestSignal = 0.0;
        rawFoamFacts.currentSignal = 0.0;
        rawFoamFacts.wakeSignal = 0.0;
        rawFoamFacts.contactSignal = 0.0;
        rawFoamFacts.localSignal = 0.0;
        rawFoamFacts.motionScale = 1.0;
        rawFoamFacts.enabled = material_OceanFoamEnabled;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 3.0;
        rawContributionPolicy.refractionEnabled = material_RefractionEnabled;
        rawContributionPolicy.clarity = 1.0;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = 1.0;
        rawContributionPolicy.ssrCompositeIntensity = 0.0;
        rawContributionPolicy.foamIntensity = material_OceanFoamIntensity;
        rawContributionPolicy.calibrationMode = 0.0;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(rawRefractionFacts, rawReflectionFacts, rawFoamFacts, rawContributionPolicy);
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.additionalTransmissionRadiance = (caustics + translucencyRadiance) * waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = mix(material_AppearanceV2DepthShallowColor.rgb, material_OceanHorizonColor.rgb, horizonFactor);
        closureInput.depthColor = mix(appearanceDepthTintColor, material_OceanHorizonColor.rgb, horizonFactor);
        closureInput.depthFactor = appearanceDepthTintFactor;
        closureInput.diffuseLighting = diffuseLighting;
        closureInput.primaryColorClosureModel = 3.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = min(viewDepth, material_MaximumSurfaceOpticalDistance);
        closureInput.refractionColor = resolvedContributions.refractionSceneColor;
        closureInput.refractionWeight = resolvedContributions.refractionWeight;
        closureInput.reflectionRadiance = resolvedContributions.reflectionRadiance;
        closureInput.fresnelF0 = pow((material_IndexOfRefraction - 1.0) / (material_IndexOfRefraction + 1.0), 2.0);
        closureInput.perceptualRoughness = effectiveSurfaceRoughness;
        closureInput.normalDotView = reflectionNormalDotView;
        closureInput.transmissionFresnelWeight = 1.0;
        closureInput.reflectionIntensity = material_ReflectionIntensity;
        closureInput.directSpecularRadiance = sunReflection;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = mix(material_OceanSurfaceFoamColor.rgb, material_OceanIntersectionColor.rgb, intersection);
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = 1.0;
        closureInput.clarity = 1.0;
        closureInput.calibrationMode = 0.0;
        closureInput.coastalAlpha = edgeFade * appearanceCoastalAlpha;
        closureInput.coastalAlphaWeight = 1.0;
        closureInput.coverage = waterSurface_coverage;
        closureInput.compositionSceneColor = centeredSceneColor;
        closureInput.precomposedReplace = 1.0;
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        vec4 resolvedWaterClosure = waterSurfaceEvaluateFinalClosureV2(closureInput, resolvedContributions.foamWeight, baseColor.a);
        vec3 finalColor = resolvedWaterClosure.rgb;
        float finalAlpha = resolvedWaterClosure.a;

        if (farFieldWeight > 0.0 && material_DebugView < 0.5 && material_LodDebug < 0.5) {
          finalColor = mix(finalColor, oceanFarFieldRadiance(input.worldPosition), farFieldWeight);
          finalAlpha = mix(finalAlpha, coverage, farFieldWeight);
        }

        if (material_DebugView > 0.5 && material_DebugView < 1.5) finalColor = macroNormal * 0.5 + 0.5;
        else if (material_DebugView < 2.5 && material_DebugView > 1.5) finalColor = detailNormal * 0.5 + 0.5;
        else if (material_DebugView < 3.5 && material_DebugView > 2.5) finalColor = oceanDepthDensityColor(waterDensity);
        else if (material_DebugView < 4.5 && material_DebugView > 3.5) finalColor = vec3(
          clamp(shoreDistance / max(material_NearshoreDecode.y, 0.001) * 0.5 + 0.5, 0.0, 1.0)
        );
        else if (material_DebugView < 5.5 && material_DebugView > 4.5) finalColor = refractedSceneColor;
        else if (material_DebugView < 6.5 && material_DebugView > 5.5) finalColor = environmentReflection;
        else if (material_DebugView < 7.5 && material_DebugView > 6.5) finalColor = vec3(max(surfaceFoam, intersection));
        else if (material_DebugView < 8.5 && material_DebugView > 7.5) finalColor = caustics;
        else if (material_DebugView < 9.5 && material_DebugView > 8.5) finalColor = diffuseLighting;
        else if (material_DebugView > 9.5) finalColor = vec3(coverage);
        if (material_DebugView > 0.5) {
          finalColor = mix(finalColor, oceanFarFieldDiagnostic(material_DebugView, input.worldPosition, coverage, shoreDistance), farFieldWeight);
          finalAlpha = coverage;
        }
        if (material_LodDebug > 0.5) {
          vec3 lodColor = input.lod < 0.5
            ? vec3(0.16, 0.92, 0.7)
            : (input.lod < 1.5 ? vec3(0.98, 0.7, 0.16) : vec3(0.92, 0.24, 0.18));
          finalColor = mix(finalColor, lodColor, 0.82);
        }
        if (material_DebugView < 0.5) {
#if SCENE_FOG_MODE != 0
        {
          finalColor = waterOceanApplySceneFog(
            vec4(finalColor, 1.0),
            input.positionVS
          ).rgb;
        }
#endif

        }
          resolvedWaterClosure = vec4(finalColor, finalAlpha);
gl_FragColor = waterSurfaceOutputWithPick(resolvedWaterClosure);
        }
      }

    }
  }
}
