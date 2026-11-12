
Shader "AIWorld/OceanFar" {
  SubShader "Default" {
    Pass "Forward" {
      Bool material_DepthWriteEnabled;
      BlendState farBlend {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState farDepth {
        Enabled = true;
        WriteEnabled = material_DepthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState farRaster { CullMode = CullMode.Back; }
      BlendState = farBlend;
      DepthState = farDepth;
      RasterState = farRaster;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
            #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"

      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
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

      sampler2D material_NearshoreTexture;
      vec4 material_NearshoreWorldToUv;
      vec4 material_NearshoreDecode;
      vec4 material_NearshoreOutsidePolicy;
      vec2 material_NearshoreCellSize;
      float material_WaterLevel;
      vec4 material_OceanFarProjection;
      float material_OceanFarLodDebug;
      float material_DebugView;
      vec4 material_OceanDeepColor;
      vec4 material_OceanHorizonColor;
      vec2 material_OceanFarReflectionFilter;
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


      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings {
        vec3 worldPosition;
        vec3 positionVS;
      };

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
vec4 waterSurfaceOutputWithPick(vec4 color) {
#ifdef RENDERER_WORLD_PICK
  if (color.a <= 0.001) discard;
  float id = floor(renderer_WorldPickBase + 0.5);
  #ifdef RENDERER_WORLD_PICK_DEPTH
    id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
  #endif
  return vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
#else
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


      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 localWorldPosition = renderer_ModelMat * attributes.POSITION;
        localWorldPosition.y += material_WaterLevel;
        float outerVertex = step(0.5, attributes.TEXCOORD_0.x);
        float viewportHeight = max(material_OceanFarProjection.x, 1.0);
        float projectionScaleY = max(abs(camera_ProjMat[1][1]), 0.0001);
        float cameraHeight = max(camera_Position.y - localWorldPosition.y, 0.0);
        float projectionDistance = cameraHeight * viewportHeight * projectionScaleY
          / 1.0;
        projectionDistance = clamp(
          projectionDistance,
          material_OceanFarProjection.y,
          10000000.0
        );
        vec2 outerDirection = normalize(attributes.POSITION.xz);
        vec2 projectedWorldXZ = camera_Position.xz + outerDirection * projectionDistance;
        vec4 projectedWorldPosition = vec4(projectedWorldXZ.x, localWorldPosition.y, projectedWorldXZ.y, 1.0);
        vec4 surfaceWorldPosition = mix(localWorldPosition, projectedWorldPosition, outerVertex);
        vec4 clipPosition = camera_VPMat * surfaceWorldPosition;
        clipPosition.z = mix(clipPosition.z, clipPosition.w * 0.99999, outerVertex);
        output.worldPosition = surfaceWorldPosition.xyz;
        output.positionVS = (camera_ViewMat * surfaceWorldPosition).xyz;
        gl_Position = clipPosition;
        return output;
      }

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
        float sampledShoreDistance = waterSpatialFieldDecodeSignedDistance(
          nearshoreSample.a,
          2.0078740157480315,
          -1.0078740157480315,
          material_NearshoreDecode.y
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

        vec3 finalColor;
        if (material_DebugView > 0.5) {
          finalColor = oceanFarFieldDiagnostic(material_DebugView, input.worldPosition, coverage, shoreDistance);
        } else {
          finalColor = oceanFarFieldRadiance(input.worldPosition);
        }
        if (material_OceanFarLodDebug > 0.5) finalColor = vec3(0.92, 0.24, 0.18);
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
        vec4 resolvedWaterClosure = vec4(finalColor, coverage);
gl_FragColor = waterSurfaceOutputWithPick(resolvedWaterClosure);
      }

    }
  }
}
