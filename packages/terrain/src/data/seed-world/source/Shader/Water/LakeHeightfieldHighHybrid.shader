
Shader "AIWorld/HeightfieldWaterSurfaceAppearanceV2ed93d4a81a01602dHybridHigh0" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }
      Bool blendEnabled;
      Bool depthWriteEnabled;
      BlendState customBlendState {
        Enabled = blendEnabled;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = depthWriteEnabled;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ViewMat;
      // Depth reconstruction needs the inverse view for scene depth and orthographic fallback.
      mat4 camera_ViewInvMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      ivec4 renderer_Layer;
      #ifndef GRAPHICS_API_WEBGL2
        bool waterSurfaceLightLayerBitSet(float value, float mask, float bitIndex) {
          return mod(floor(value / pow(2.0, bitIndex)), 2.0) == 1.0
            && mod(floor(mask / pow(2.0, bitIndex)), 2.0) == 1.0;
        }
      #endif

      bool waterSurfaceIsRendererCulledByLight(ivec2 rendererLayer, ivec2 lightCullingMask) {
        #ifdef GRAPHICS_API_WEBGL2
          return !(
            (rendererLayer.x & lightCullingMask.x) != 0
              || (rendererLayer.y & lightCullingMask.y) != 0
          );
        #else
          for (int layerBit = 0; layerBit < 16; layerBit++) {
            if (
              waterSurfaceLightLayerBitSet(
                float(rendererLayer.x),
                float(lightCullingMask.x),
                float(layerBit)
              )
                || waterSurfaceLightLayerBitSet(
                  float(rendererLayer.y),
                  float(lightCullingMask.y),
                  float(layerBit)
                )
            ) {
              return false;
            }
          }
          return true;
        #endif
      }

      #ifdef SCENE_DIRECT_LIGHT_COUNT
        struct WaterSurfaceDirectLight {
          vec3 color;
          vec3 direction;
        };
        ivec2 scene_DirectLightCullingMask[SCENE_DIRECT_LIGHT_COUNT];
        vec3 scene_DirectLightColor[SCENE_DIRECT_LIGHT_COUNT];
        vec3 scene_DirectLightDirection[SCENE_DIRECT_LIGHT_COUNT];
        #ifdef GRAPHICS_API_WEBGL2
          WaterSurfaceDirectLight getWaterSurfaceDirectLight(int index) {
            WaterSurfaceDirectLight light;
            light.color = scene_DirectLightColor[index];
            light.direction = scene_DirectLightDirection[index];
            return light;
          }
        #endif
      #endif
      struct WaterSurfaceEnvironmentLight {
        vec3 diffuse;
        float mipMapLevel;
        float diffuseIntensity;
        float specularIntensity;
      };
      WaterSurfaceEnvironmentLight scene_EnvMapLight;
      #ifdef SCENE_USE_SH
        vec3 scene_EnvSH[9];
      #endif
      vec3 scene_WindVelocity;
      vec3 material_WindVelocity;
      float material_WindVelocityOverride;
      highp sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      vec4 camera_ProjectionParams;
      vec4 camera_DepthBufferParams;
      sampler2D material_LocalMapTexture;
#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;

      sampler2D material_AppearanceV2Detail0Texture;
      vec4 material_AppearanceV2Detail0Transform;
      vec2 material_AppearanceV2Detail0Rotation;
      float material_AppearanceV2Detail0Strength;
      sampler2D material_AppearanceV2Detail1Texture;
      vec4 material_AppearanceV2Detail1Transform;
      vec2 material_AppearanceV2Detail1Rotation;
      float material_AppearanceV2Detail1Strength;

      float material_AppearanceV2DepthDistance;
      float material_AppearanceV2DepthExponent;
      vec4 material_AppearanceV2DepthColor;

      float material_AppearanceV2Boundary0Range;
      float material_AppearanceV2Boundary0Alpha;

      float material_AppearanceV2Boundary1Range;
      vec3 material_AppearanceV2Boundary1Color;
      float material_AppearanceV2Boundary1Roughness;
      float material_AppearanceV2Boundary1PatternWorldScale;
      float material_AppearanceV2Boundary1PatternTimeRate;
      float material_AppearanceV2Boundary1PatternOpacity;
      vec3 material_AppearanceV2Boundary1PatternWeights;
      float material_AppearanceV2Boundary1PatternLacunarity;
      float material_AppearanceV2Boundary1PatternExponent;



      float material_AppearanceDirectSpecularEnabled;
#endif

      vec4 material_LocalMapWorldToUv;
      vec4 material_WaterWorldToLocalPlanar;
      vec4 renderer_AtlasUvRect;
      vec4 material_LocalMapDecode;
      vec4 material_ShallowColor;
      vec4 material_DeepColor;
      float material_Alpha;
      float material_Clarity;
      float material_TimeScale;
      float material_WaveStrength;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_RefractionEnabled;
      float material_CompositionMode;
      float material_WavesEnabled;
      float material_MicroNormalsEnabled;
#ifdef MATERIAL_WATER_PRESENTATION_REVEAL
      float material_PresentationRevealProgress;
      float material_PresentationRevealBand;
      vec2 material_PresentationRevealRepeat;
#endif
      float material_MaxVerticalDisplacement;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_FresnelF0;
      float material_RefractionStrength;
      float material_Roughness;
      float material_ReflectionIntensity;
      float material_ReflectionSource;
      float material_WaterScreenSpaceReflectionCompositeIntensity;
      samplerCube material_ReflectionCubeTexture;
      sampler2D camera_ScreenSpaceReflectionTexture;
      float camera_ScreenSpaceReflectionIntensity;
      float camera_ScreenSpaceReflectionMaxRoughness;
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

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec2 TEXCOORD_0;
      };
      struct Varyings {
        vec3 worldPosition;
        vec3 objectPosition;
        vec2 meshUv;
        vec3 baseNormalWS;
        vec3 macroNormalWS;
        vec3 tangentWS;
        vec2 atlasUv;
        float waveOffset;
        float surfaceEyeDepth;
        float shoreDamping;
        vec4 clipPosition;
      };



      vec2 waterLocalDirectionToWorldXZ(vec2 localDirection) {
        return vec2(
          localDirection.x * material_WaterWorldToLocalPlanar.x
            + localDirection.y * material_WaterWorldToLocalPlanar.y,
          -localDirection.x * material_WaterWorldToLocalPlanar.y
            + localDirection.y * material_WaterWorldToLocalPlanar.x
        );
      }

#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED

      vec4 scene_WeatherState;
      float scene_WeatherTime;
      sampler2D scene_SurfaceRippleNormalAtlas;

      vec3 rainRippleSafeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 rainRippleDecodeNormal(vec3 encodedNormal) {
        vec3 normal = encodedNormal * 2.0 - 1.0;
        return rainRippleSafeNormalize3(vec3(normal.xy, max(normal.z, 0.08)), vec3(0.0, 0.0, 1.0));
      }

      vec3 rainRippleSampleFrame(vec2 localUv, float frame) {
        vec2 frameCell = vec2(mod(frame, 8.0), floor(frame * 0.125));
        vec2 frameUv = (
          frameCell + mix(vec2(0.04), vec2(0.96), clamp(localUv, 0.0, 1.0))
        ) * 0.125;
        return rainRippleDecodeNormal(
          texture2D(scene_SurfaceRippleNormalAtlas, frameUv).xyz
        );
      }

      vec2 rainRippleField(
        vec2 fieldUv,
        float weatherTime,
        float frameOffset,
        float rainStrength
      ) {
        float frameRate = mix(8.0, 24.0, clamp(rainStrength, 0.0, 1.0));
        float frame = floor(mod(weatherTime * frameRate + frameOffset, 64.0));
        return rainRippleSampleFrame(fract(fieldUv), frame).xy;
      }

      float rainRippleDensityWeight(vec2 rippleSlope, float rainAmount) {
        float minimumSlope = mix(0.14, 0.025, rainAmount);
        float feather = mix(0.07, 0.025, rainAmount);
        return smoothstep(
          minimumSlope,
          minimumSlope + feather,
          length(rippleSlope)
        );
      }

      vec3 rainRippleApplyNormal(
        vec3 surfaceNormalWS,
        vec3 macroNormalWS,
        vec2 rippleSlope
      ) {
        vec3 worldRippleSlope = vec3(rippleSlope.x, 0.0, rippleSlope.y);
        vec3 tangentRippleSlope = worldRippleSlope
          - macroNormalWS * dot(worldRippleSlope, macroNormalWS);
        return rainRippleSafeNormalize3(surfaceNormalWS + tangentRippleSlope, macroNormalWS);
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

#ifndef WATER_SURFACE_APPEARANCE_INCLUDED
#define WATER_SURFACE_APPEARANCE_INCLUDED

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
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



#endif

float waterSurfaceAppearanceDepthTintFactor(
  float sceneDepthDelta,
  float distance,
  float exponent
) {
  return pow(
    clamp(sceneDepthDelta / max(distance, 0.0001), 0.0, 1.0),
    max(exponent, 0.0001)
  );
}




#endif

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

#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED


#endif

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }
      #include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"
#ifndef WATER_ANIMATED_VORONOI_F1_INCLUDED
#define WATER_ANIMATED_VORONOI_F1_INCLUDED

bool waterAnimatedVoronoiF1IsFinite(float value) {
  return value == value && abs(value) < 1.0e20;
}

vec2 waterAnimatedVoronoiF1Hash(vec2 cell) {
  vec2 projected = vec2(
    dot(cell, vec2(127.1, 311.7)),
    dot(cell, vec2(269.5, 183.3))
  );
  return fract(sin(projected) * 43758.5453);
}

float waterAnimatedVoronoiF1Candidate(
  vec2 cell,
  vec2 localPosition,
  vec2 cellOffset,
  float time
) {
  vec2 randomOffset = waterAnimatedVoronoiF1Hash(cell + cellOffset);
  vec2 animatedOffset = sin(time + randomOffset * 6.2831) * 0.5 + 0.5;
  vec2 delta = localPosition - cellOffset - animatedOffset;
  return dot(delta, delta);
}

float waterAnimatedVoronoiF1(vec2 position, float time) {
  vec2 cell = floor(position);
  vec2 localPosition = fract(position);
  // Compare squared distances before the single square root per octave.
  float f1 = 128.0;
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, -1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 0.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(-1.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(0.0, 1.0), time));
  f1 = min(f1, waterAnimatedVoronoiF1Candidate(cell, localPosition, vec2(1.0, 1.0), time));
  return clamp(0.707 * sqrt(f1), 0.0, 1.0);
}

float evaluateWaterAnimatedVoronoiF1(
  vec2 worldPositionXz,
  float surfaceTime,
  float worldScale,
  float timeRate,
  vec3 octaveWeights,
  float lacunarity
) {
    if (
      !waterAnimatedVoronoiF1IsFinite(worldPositionXz.x)
      || !waterAnimatedVoronoiF1IsFinite(worldPositionXz.y)
      || !waterAnimatedVoronoiF1IsFinite(surfaceTime)
      || !waterAnimatedVoronoiF1IsFinite(worldScale)
      || !waterAnimatedVoronoiF1IsFinite(timeRate)
      || !waterAnimatedVoronoiF1IsFinite(lacunarity)
      || worldScale <= 0.0
      || timeRate <= 0.0
      || lacunarity <= 0.0
      || !(waterAnimatedVoronoiF1IsFinite(octaveWeights.x) && octaveWeights.x >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.y) && octaveWeights.y >= 0.0
        && waterAnimatedVoronoiF1IsFinite(octaveWeights.z) && octaveWeights.z >= 0.0)
    ) {
      return 0.0;
    }
  float animatedTime = surfaceTime * timeRate;
  if (!waterAnimatedVoronoiF1IsFinite(animatedTime)) return 0.0;
  float safeWorldScale = worldScale;
  float safeLacunarity = lacunarity;
    float weightSum = octaveWeights.x + octaveWeights.y + octaveWeights.z;
  if (!(weightSum > 0.0) || !waterAnimatedVoronoiF1IsFinite(weightSum)) return 0.0;
  float weightedPattern = 0.0;
  weightedPattern += waterAnimatedVoronoiF1(
    worldPositionXz * safeWorldScale * 1.0,
    animatedTime
  ) * octaveWeights.x;
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity,
      animatedTime
    ) * octaveWeights.y;
    weightedPattern += waterAnimatedVoronoiF1(
      worldPositionXz * safeWorldScale * safeLacunarity * safeLacunarity,
      animatedTime
    ) * octaveWeights.z;
  return clamp(weightedPattern / weightSum, 0.0, 1.0);
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


struct WaterSurfaceRawContributionPolicyV2 {
  float primaryColorClosureModel;
  float refractionEnabled;
  float clarity;
  float boundaryRefractionSuppression;
  float reflectionSource;
  float ssrCompositeIntensity;

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
  float foamWeight,
  WaterSurfaceRawContributionPolicyV2 policy
) {
  WaterSurfaceResolvedRawContributionsV2 resolved;
  resolved.foamWeight = clamp(foamWeight, 0.0, 1.0);

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
    return closureModel > 1.5
      ? litScene
      : (closureModel > 0.5 ? stylized : surfaceColor);
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

  float coastalAlpha,
  float coastalAlphaWeight
) {
  float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clamp(clarity, 0.0, 1.0)) * max(opticalDepth, 0.0));
  float alpha = baseAlpha * mix(0.18, 0.94, absorptionAlpha);
  alpha += clamp(fresnel, 0.0, 1.0) * (1.0 - alpha) * 0.48;
  alpha += clamp(foamWeight, 0.0, 1.0) * 0.3;
  alpha = mix(alpha, coastalAlpha, clamp(coastalAlphaWeight, 0.0, 1.0));
  return clamp(alpha, 0.0, 1.0);
}

struct WaterSurfaceFinalClosureV2Input {
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
  color *= mix(
    1.0,
    1.0 - fresnel,
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

  float alpha = waterSurfaceResolveAlphaV2(
    closure.baseAlpha,
    closure.clarity,
    closure.opticalDepth,
    fresnel,
    closure.foamWeight,
    closure.coastalAlpha,
    closure.coastalAlphaWeight
  ) * clamp(closure.coverage, 0.0, 1.0);
  float replace = step(0.5, closure.precomposedReplace);
    color = mix(color, mix(closure.compositionSceneColor, color, alpha), replace);
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

      const float WATER_SURFACE_PI = 3.141592653589793;

      vec3 waterSurfaceLightingSafeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 waterSurfaceAppearanceAmbientIrradiance(vec3 normalWS) {
        vec3 ambientIrradiance = scene_EnvMapLight.diffuse * WATER_SURFACE_PI;
        #ifdef SCENE_USE_SH
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
        return ambientIrradiance * max(scene_EnvMapLight.diffuseIntensity, 0.0);
      }

      void evaluateWaterSurfaceDirectionalLighting(
        vec3 positionWS,
        vec3 normalWS,
        vec3 viewDirection,
        float normalDotView,
        float fresnelF0,
        float roughness,
        float litSceneColorSpecular,
        out vec3 directDiffuseRadiance,
        out vec3 directSpecularRadiance
      ) {
        WaterSurfaceResolvedLightingV2 resolvedLighting = waterSurfaceCreateResolvedLightingV2(vec3(0.0));
        #ifdef SCENE_DIRECT_LIGHT_COUNT
          for (int lightIndex = 0; lightIndex < SCENE_DIRECT_LIGHT_COUNT; lightIndex++) {
            if (!waterSurfaceIsRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[lightIndex])) {
              #ifdef GRAPHICS_API_WEBGL2
                WaterSurfaceDirectLight directionalLight = getWaterSurfaceDirectLight(lightIndex);
              #else
                WaterSurfaceDirectLight directionalLight;
                directionalLight.color = scene_DirectLightColor[lightIndex];
                directionalLight.direction = scene_DirectLightDirection[lightIndex];
              #endif
              vec3 lightDirection = -directionalLight.direction;
              float lightDirectionLengthSquared = dot(lightDirection, lightDirection);
              if (lightDirectionLengthSquared > 0.000001) {
                lightDirection *= inversesqrt(lightDirectionLengthSquared);
                float lightAttenuation = 1.0;
                if (lightIndex == 0) {
                  lightAttenuation *= sampleVolumetricCloudShadow(positionWS);
                }
                vec3 lightRadiance = max(directionalLight.color, vec3(0.0)) * lightAttenuation;
                float normalDotLight = saturate(dot(normalWS, lightDirection));
                vec3 halfDirection = waterSurfaceLightingSafeNormalize3(
                  viewDirection + lightDirection,
                  lightDirection
                );
                float normalDotHalf = saturate(dot(normalWS, halfDirection));
                float lightDotHalf = saturate(dot(lightDirection, halfDirection));
                resolvedLighting = waterSurfaceAccumulateDirectLightingV2(
                  resolvedLighting,
                  lightRadiance,
                  normalDotView,
                  normalDotLight,
                  normalDotHalf,
                  lightDotHalf,
                  fresnelF0,
                  roughness,
                  saturate(litSceneColorSpecular) * 2.0,
                  1.0
                );
              }
            }
          }
        #endif
        directDiffuseRadiance = resolvedLighting.diffuseRadiance;
        directSpecularRadiance = resolvedLighting.directSpecularRadiance;
      }

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
      vec3 waterWindVelocity() {
        return mix(
          scene_WindVelocity,
          material_WindVelocity,
          clamp(material_WindVelocityOverride, 0.0, 1.0)
        );
      }

      float surfaceTime() {
        float selected = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        return mod(max(selected, 0.0), 4096.0);
      }

      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }





      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }

      Varyings vert(Attributes attr) {
        Varyings output;
        vec4 baseWorldPosition = renderer_ModelMat * attr.POSITION;
        vec3 computedBaseNormalWS = normalize(mat3(renderer_ModelMat) * attr.NORMAL);
        vec3 computedBaseTangentWS = normalize(mat3(renderer_ModelMat) * attr.TANGENT.xyz);
        vec3 computedBaseBitangentWS = normalize(
          cross(computedBaseNormalWS, computedBaseTangentWS) * attr.TANGENT.w
        );
        vec2 computedAtlasUv = attr.TEXCOORD_0;
        vec4 localMap = texture2D(material_LocalMapTexture, computedAtlasUv);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float authoredDepth = waterSpatialFieldDecodeDepth(
          localMap.b,
          material_LocalMapDecode.y
        );
        float signedDistance =
          waterSpatialFieldDecodeSignedDistance(
            localMap.a,
            2.0,
            -1.0,
            material_LocalMapDecode.z
          );

        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float shoreDamping = smoothstep(0.0, max(material_ShoreDampingWidth, 0.0001), signedDistance);
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          0.055,
          0.756,
          flowSpeed
        );
        vec2 flowDirection = safeNormalize2(flowXZ, vec2(-0.36, -0.9329523));
        float macroFlowAlignment = flowWeight * 0.72;
        float macroAmplitudeScale = mix(
          0.3,
          1.0,
          flowWeight
        );
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;

        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        waveOffset *= waterConnectionFacts(baseWorldPosition.xz).x;
        vec3 displacedWorldPosition = baseWorldPosition.xyz + computedBaseNormalWS * waveOffset;
        vec4 localPosition = attr.POSITION + vec4(attr.NORMAL * waveOffset, 0.0);
        vec4 computedClipPosition = renderer_MVPMat * localPosition;
        gl_Position = computedClipPosition;
        output.worldPosition = displacedWorldPosition;
        output.objectPosition = attr.POSITION.xyz;
        output.meshUv = attr.TEXCOORD_0;
        output.baseNormalWS = computedBaseNormalWS;
        output.macroNormalWS = computedMacroNormalWS;
        output.tangentWS = computedBaseTangentWS;
        output.atlasUv = computedAtlasUv;
        output.waveOffset = waveOffset;
        output.surfaceEyeDepth = -(camera_ViewMat * vec4(displacedWorldPosition, 1.0)).z;
        output.shoreDamping = shoreDamping;
        output.clipPosition = computedClipPosition;
        return output;
      }

      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;

        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float authoredDepth = max(
          waterSpatialFieldDecodeDepth(
            localMap.b,
            material_LocalMapDecode.y
          ),
          0.0
        );
        float signedDistance =
          waterSpatialFieldDecodeSignedDistance(
            localMap.a,
            2.0,
            -1.0,
            material_LocalMapDecode.z
          );

        signedDistance = waterConnectionShore(input.worldPosition.xz, signedDistance);
        // Keep the shoreline transition wider than both one screen-space
        // derivative and one RGBA8 signed-distance decode step. A fixed 8cm
        // threshold becomes a hard staircase once a large Lake is capped to a
        // multi-metre Coverage texel size.
        float coverageHalfWidth = max(
          0.08,
          max(
            fwidth(signedDistance) * 1.25,
            material_LocalMapDecode.z * (2.0 / 255.0)
          )
        );
        float coverage = smoothstep(-coverageHalfWidth, coverageHalfWidth, signedDistance);
        float elapsedTime = surfaceTime();
        vec3 fieldViewDirection = safeNormalize3(camera_Position - input.worldPosition, input.macroNormalWS);
        float sceneRayEyeScale = input.surfaceEyeDepth / max(length(camera_Position - input.worldPosition), 0.001);
        float orthographicProjection = 0.0;
#ifdef CAMERA_ORTHOGRAPHIC
        fieldViewDirection = safeNormalize3((camera_ViewInvMat * vec4(0.0, 0.0, -1.0, 0.0)).xyz, input.macroNormalWS);
        sceneRayEyeScale = 1.0;
        orthographicProjection = 1.0;
#endif
        float fallbackSceneRayDepth = waterSurfaceDerivedSceneRayDepth(authoredDepth, input.macroNormalWS, fieldViewDirection);
        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
        float sceneDepthBufferSample = texture2D(camera_DepthTexture, screenUv).r;
        float sceneEyeDepthSample = remapDepthBufferEyeDepth(sceneDepthBufferSample);
        float centeredSceneDepthAvailable = waterSurfaceDepthSampleValidity(sceneDepthBufferSample, sceneEyeDepthSample, input.surfaceEyeDepth);
        float sceneEyeDepth = mix(input.surfaceEyeDepth + fallbackSceneRayDepth * sceneRayEyeScale, sceneEyeDepthSample, centeredSceneDepthAvailable);
        float sceneDepthDelta = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float sceneRayDepth = sceneDepthDelta / max(sceneRayEyeScale, 0.001);
        vec3 opaquePositionWS = waterSurfaceReconstructOpaquePositionWS(input.worldPosition, camera_Position, camera_ViewInvMat, input.surfaceEyeDepth, sceneEyeDepth, orthographicProjection);
        float exactSurfaceNormalDepth = waterSurfaceNormalDepth(input.worldPosition, opaquePositionWS, input.macroNormalWS);
        float surfaceNormalDepth = mix(authoredDepth, exactSurfaceNormalDepth, centeredSceneDepthAvailable);
        float sampledOpticalDepth = sceneRayDepth;
        float opticalDepth = min(sampledOpticalDepth, authoredDepth);
        float centeredDepthBehind = centeredSceneDepthAvailable * step(0.000001, sceneDepthDelta);

        opticalDepth = min(opticalDepth, max(material_MaximumSurfaceOpticalDistance, 0.0));
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          0.055,
          0.756,
          flowSpeed
        );
        float sceneWindSpeed = length(waterWindVelocity().xz);
        vec2 stillWaterDirection = sceneWindSpeed > 0.0001
          ? waterWindVelocity().xz / sceneWindSpeed
          : vec2(-0.36, -0.9329523);
        vec2 flowDirection = safeNormalize2(
          mix(stillWaterDirection, safeNormalize2(flowXZ, stillWaterDirection), flowWeight * 0.88),
          stillWaterDirection
        );
        vec3 baseWorldPosition = input.worldPosition - input.baseNormalWS * input.waveOffset;
        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float heightfieldObstacleContact = opticalDepth;
#ifndef WATER_SURFACE_GEOMETRY_BRIDGE_INCLUDED
#define WATER_SURFACE_GEOMETRY_BRIDGE_INCLUDED

vec3 waterSurface_positionWS = input.worldPosition;
vec3 waterSurface_macroNormalWS = input.macroNormalWS;
vec3 waterSurface_tangentWS = input.tangentWS;
vec3 waterSurface_bitangentWS = safeNormalize3(cross(input.macroNormalWS, input.tangentWS), vec3(0.0, 0.0, 1.0));
vec2 waterSurface_meshUv = input.atlasUv;
vec2 waterSurface_flowWS = waterLocalDirectionToWorldXZ(flowXZ);
float waterSurface_coverage = coverage;
float waterSurface_verticalDepth = authoredDepth;
float waterSurface_horizontalShoreDistance = signedDistance;
float waterSurface_obstacleContact = heightfieldObstacleContact;
float waterSurface_waveCrest = max(input.waveOffset, 0.0);

#endif

        vec3 surfaceNormalWS = safeNormalize3(input.macroNormalWS, input.macroNormalWS);
#ifndef WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
        vec3 appearanceNormalTS = vec3(0.0, 0.0, 1.0);

        vec2 appearanceLayerCoordinate0 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled0 = appearanceLayerCoordinate0 * material_AppearanceV2Detail0Transform.xy;
        vec2 appearanceLayerUv0 = vec2(
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.x - appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.y,
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.y + appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.x
        ) + material_AppearanceV2Detail0Transform.zw;
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail0Texture, appearanceLayerUv0),
          material_AppearanceV2Detail0Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal0);

        vec2 appearanceLayerCoordinate1 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled1 = appearanceLayerCoordinate1 * material_AppearanceV2Detail1Transform.xy;
        vec2 appearanceLayerUv1 = vec2(
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.x - appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.y,
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.y + appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.x
        ) + material_AppearanceV2Detail1Transform.zw;
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail1Texture, appearanceLayerUv1),
          material_AppearanceV2Detail1Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal1);

        appearanceNormalTS = normalize(mix(vec3(0.0, 0.0, 1.0), appearanceNormalTS, material_AppearanceV2DetailNormalStrength));
        vec3 appearanceTangentWS = safeNormalize3(
          input.tangentWS - input.macroNormalWS * dot(input.tangentWS, input.macroNormalWS),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 appearanceBitangentWS = safeNormalize3(
          cross(input.macroNormalWS, appearanceTangentWS),
          vec3(0.0, 0.0, 1.0)
        );
        vec3 appearanceSurfaceNormalWS = safeNormalize3(
          appearanceTangentWS * appearanceNormalTS.x
            + appearanceBitangentWS * appearanceNormalTS.y
            + input.macroNormalWS * appearanceNormalTS.z,
          input.macroNormalWS
        );
        surfaceNormalWS = safeNormalize3(
          mix(
            surfaceNormalWS,
            appearanceSurfaceNormalWS,
            material_AppearanceV2DetailEnabled * material_MicroNormalsEnabled
          ),
          input.macroNormalWS
        );
#endif

        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);
#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_LAYERED_STATEMENTS_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_LAYERED_STATEMENTS_INCLUDED

        float rainRate = clamp(scene_WeatherState.x, 0.0, 1.0)
          * material_MicroNormalsEnabled;
        float rainRippleUpwardCosine = clamp(input.macroNormalWS.y, 0.0, 1.0);
        float rainRippleUpwardFade = rainRippleUpwardCosine * smoothstep(
          0.2,
          0.55,
          rainRippleUpwardCosine
        );
        vec3 rainRippleCameraDelta = camera_Position - input.worldPosition;
        float rainRippleHorizontalDistance = length(rainRippleCameraDelta.xz);
        float rainRippleVerticalDistance = abs(rainRippleCameraDelta.y);
        float rainRippleDistance =
          rainRippleHorizontalDistance + rainRippleVerticalDistance * 0.25;
        float rainRippleDistanceFade = 1.0 - smoothstep(
          42.0,
          150.0,
          rainRippleDistance
        );
        float rainRipplePlaybackStrength = smoothstep(0.04, 0.72, rainRate);
        float rainRippleRainAmount = smoothstep(0.02, 1.0, rainRate);
        float rainRippleStormAmount = smoothstep(0.68, 1.0, rainRate);
        float rainRippleRainPresence = step(0.0001, rainRate);
        float rainRippleRingAmplitude = mix(0.82, 1.0, rainRippleStormAmount);
        float rainRippleVisibility = rainRippleRainPresence
          * rainRippleUpwardFade
          * rainRippleDistanceFade;
        float rainRippleContribution = rainRippleVisibility
          * rainRippleRingAmplitude;
        float rainRippleMask = 0.0;
        if (rainRippleContribution > 0.001) {
          vec2 rainRipplePrimarySample = rainRippleField(
            baseWorldPosition.xz * 0.68,
            scene_WeatherTime,
            0.0,
            rainRipplePlaybackStrength
          );
          float rainRipplePrimaryDensity = rainRippleDensityWeight(
            rainRipplePrimarySample,
            rainRippleRainAmount
          );
          vec2 rainRippleSlope = rainRipplePrimarySample
            * (0.28 * rainRipplePrimaryDensity);
          float rainRippleRawMask = length(rainRipplePrimarySample)
            * rainRipplePrimaryDensity;
          vec2 rotatedRainRippleXZ = vec2(
            baseWorldPosition.x * 0.8 - baseWorldPosition.z * 0.6,
            baseWorldPosition.x * 0.6 + baseWorldPosition.z * 0.8
          );
          vec2 rainRippleSecondarySample = rainRippleField(
            rotatedRainRippleXZ * 1.07 + vec2(0.37, 0.19),
            scene_WeatherTime,
            23.0,
            rainRipplePlaybackStrength
          );
          float rainRippleSecondaryDensity = rainRippleDensityWeight(
            rainRippleSecondarySample,
            rainRippleRainAmount
          );
          float rainRippleSecondaryAmount = smoothstep(0.35, 1.0, rainRate);
          float rainRippleSecondaryWeight = rainRippleSecondaryDensity
            * rainRippleSecondaryAmount;
          rainRippleSlope += rainRippleSecondarySample
            * (0.18 * rainRippleSecondaryWeight);
          rainRippleRawMask = max(
            rainRippleRawMask,
            length(rainRippleSecondarySample) * rainRippleSecondaryWeight
          );
          rainRippleMask = smoothstep(0.035, 0.24, rainRippleRawMask)
            * clamp(rainRippleContribution, 0.0, 1.0);
          surfaceNormalWS = rainRippleApplyNormal(
            surfaceNormalWS,
            input.macroNormalWS,
            rainRippleSlope * rainRippleContribution
          );
        }
        float rainRippleRoughnessResponse = mix(
          -0.018,
          0.08,
          rainRippleStormAmount
        );
        float rainRippleRoughnessFloor = max(
          material_Roughness * 0.88,
          material_Roughness - 0.02
        );
        float rainRippleSurfaceRoughness = clamp(
          material_Roughness + rainRippleMask * rainRippleRoughnessResponse,
          rainRippleRoughnessFloor,
          1.0
        );

#endif


        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.baseNormalWS);
        float normalFacing = step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= normalFacing;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
        // Water-owned normal depth projects to ray distance. Eye-Z remains a separate artistic field.
        float localBathymetryProjectionDenominator = 1.0;
#ifdef CAMERA_ORTHOGRAPHIC
        localBathymetryProjectionDenominator = abs((mat3(camera_ViewMat) * input.baseNormalWS).z);
#else
        localBathymetryProjectionDenominator = abs(dot(viewDirection, input.baseNormalWS));
#endif
        float localSceneRayDepth = min(authoredDepth / max(localBathymetryProjectionDenominator, 0.001), 1000000.0);
        float bodyBoundedSceneRayDepth = min(sceneRayDepth, localSceneRayDepth);
        sceneRayDepth = mix(localSceneRayDepth, bodyBoundedSceneRayDepth, centeredSceneDepthAvailable);
        sceneDepthDelta = sceneRayDepth * sceneRayEyeScale;
        centeredDepthBehind = max(centeredDepthBehind, (1.0 - centeredSceneDepthAvailable) * step(0.000001, authoredDepth));
        opticalDepth = min(sceneRayDepth, max(material_MaximumSurfaceOpticalDistance, 0.0));

        float fresnelF0 = clamp(material_FresnelF0, 0.0, 1.0);
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECTS_INCLUDED
        float contactFoamMask = 0.0;
        float appearanceCoastalAlpha = 0.0;
        vec3 appearanceBoundaryColor = vec3(0.0);
        vec3 appearanceBoundaryAlbedo = vec3(0.0);
        float appearanceBoundaryAlbedoWeight = 0.0;
        float appearanceBoundaryRoughness = 0.0;
        float appearanceBoundaryRefractionSuppression = 0.0;
#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_0_INCLUDED
        float appearanceBoundaryField0 = sceneDepthDelta;
        float appearanceBoundaryRawNormalized0 = appearanceBoundaryField0
          / max(material_AppearanceV2Boundary0Range, 0.0001);
        float appearanceBoundaryNormalized0 = clamp(
          appearanceBoundaryRawNormalized0,
          0.0,
          1.0
        );
        float appearanceBoundaryMask0 = appearanceBoundaryNormalized0;
        appearanceBoundaryMask0 = appearanceBoundaryMask0;


        appearanceBoundaryMask0 *= 1.0;
        appearanceCoastalAlpha = max(
          appearanceCoastalAlpha,
          appearanceBoundaryMask0 * material_AppearanceV2Boundary0Alpha
        );
#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_1_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_BOUNDARY_EFFECT_1_INCLUDED
        float appearanceBoundaryField1 = sceneDepthDelta;
        float appearanceBoundaryRawNormalized1 = appearanceBoundaryField1
          / max(material_AppearanceV2Boundary1Range, 0.0001);
        float appearanceBoundaryNormalized1 = clamp(
          appearanceBoundaryRawNormalized1,
          0.0,
          1.0
        );
        float appearanceBoundaryMask1 = appearanceBoundaryNormalized1;
        appearanceBoundaryMask1 = 1.0 - appearanceBoundaryMask1;

        float appearanceBoundaryPattern1 = evaluateWaterAnimatedVoronoiF1( input.worldPosition.xz, material_AppearanceV2Boundary1PatternTimeRate, material_AppearanceV2Boundary1PatternWorldScale, 1.0, material_AppearanceV2Boundary1PatternWeights, material_AppearanceV2Boundary1PatternLacunarity );

        float appearanceBoundaryPatternResponse1 = pow(max(abs(1.0 - appearanceBoundaryPattern1), 0.0001), material_AppearanceV2Boundary1PatternExponent);

        appearanceBoundaryMask1 = clamp(1.0 - appearanceBoundaryRawNormalized1 + appearanceBoundaryPatternResponse1, 0.0, 1.0) * material_AppearanceV2Boundary1PatternOpacity;

        appearanceBoundaryMask1 *= centeredDepthBehind;
        contactFoamMask = max(
          contactFoamMask,
          appearanceBoundaryMask1
            * material_AppearanceV2BoundaryMaterialEnabled
        );
        appearanceBoundaryColor += appearanceBoundaryMask1
          * material_AppearanceV2Boundary1Color
          * material_AppearanceV2BoundaryMaterialEnabled;
        appearanceBoundaryRoughness += appearanceBoundaryMask1
          * material_AppearanceV2Boundary1Roughness
          * material_AppearanceV2BoundaryMaterialEnabled;
#endif

        float effectiveSurfaceRoughness = clamp(
          material_Roughness + appearanceBoundaryRoughness,
          0.045,
          1.0
        );
#endif

        vec3 directDiffuseRadiance = vec3(0.0);
        vec3 directSpecularRadiance = vec3(0.0);
        evaluateWaterSurfaceDirectionalLighting(
          input.worldPosition,
          surfaceNormalWS,
          viewDirection,
          normalDotView,
          fresnelF0,
          effectiveSurfaceRoughness,
          1.0,
          directDiffuseRadiance,
          directSpecularRadiance
        );
        directSpecularRadiance *= material_AppearanceDirectSpecularEnabled;
        vec3 ambientDiffuse = waterSurfaceAppearanceAmbientIrradiance(surfaceNormalWS)
          / WATER_SURFACE_PI;
        vec3 waterDiffuseLighting = max(ambientDiffuse + directDiffuseRadiance, vec3(0.0));
        float clarity = saturate(material_Clarity);
        // Authored color is resolved only by the shared V2 Closure below.
        vec3 waterColor = material_ShallowColor.rgb;
        vec3 centeredOpaqueColor = waterColor;
        vec3 displacedOpaqueColor = waterColor;
        vec2 refractionUvDelta = vec2(0.0);
        float refractionDepthContinuity = 1.0;
        float refractionSampleValidity = 0.0;
        float refractionDepthWeight = 0.0;
        float refractionShoreWeight = 0.0;
        float refractionFeatureWeight = step(0.5, material_RefractionEnabled) * 1.0;
        vec3 baseNormalVS = normalize(mat3(camera_ViewMat) * input.baseNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec2 refractionNormalDelta = appearanceNormalTS.xy;
        refractionDepthWeight = smoothstep(
          0.04,
          1.15,
          opticalDepth
        );
        float fragmentShoreDamping = smoothstep(
          0.0,
          max(material_ShoreDampingWidth, 0.0001),
          signedDistance
        );
        refractionShoreWeight = 1.0;
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta
            * material_AppearanceV2RefractionUvScale
            * refractionFeatureWeight;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
        float refractedSceneDepthBufferSample = texture2D(
          camera_DepthTexture,
          refractedScreenUv
        ).r;
        float refractedSceneEyeDepthSample = remapDepthBufferEyeDepth(
          refractedSceneDepthBufferSample
        );
        bool refractedSceneDepthFinite = refractedSceneEyeDepthSample >= 0.0
          && refractedSceneEyeDepthSample <= 1000000.0;
        float refractedSceneDepthAvailable = refractedSceneDepthFinite
          && refractedSceneDepthBufferSample < 1.0
            ? 1.0
            : 0.0;
        float refractedSceneEyeDepth = refractedSceneDepthAvailable > 0.5
          ? refractedSceneEyeDepthSample
          : input.surfaceEyeDepth;
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        refractionDepthContinuity = 1.0;
        // Source-faithful shifted-depth validation: the displaced sample is
        // accepted only while its geometry remains behind the water surface.
        float refractedGeometryBehindSurface = step(
          0.000001,
          refractedSceneEyeDepth - input.surfaceEyeDepth
        ) * refractedSceneDepthAvailable;
        float localRefractedGeometryBehindSurface = coverage * step(0.000001, authoredDepth);
        refractionSampleValidity = refractionScreenInterior * max(
          refractedGeometryBehindSurface,
          (1.0 - refractedSceneDepthAvailable) * localRefractedGeometryBehindSurface
        );
        refractionUvDelta = refractedScreenUv - screenUv;
        centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;

#ifndef WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_DEPTH_RESPONSE_INCLUDED
        float appearanceDepthTintFactor = waterSurfaceAppearanceDepthTintFactor(
          authoredDepth,
          material_AppearanceV2DepthDistance,
          material_AppearanceV2DepthExponent
        );
        vec3 appearanceDepthTintColor = material_AppearanceV2DepthColor.rgb;
        appearanceDepthTintColor = appearanceDepthTintColor * (1.0 - appearanceBoundaryAlbedoWeight) + appearanceBoundaryAlbedo;
        appearanceDepthTintFactor = clamp(appearanceDepthTintFactor + appearanceBoundaryAlbedoWeight, 0.0, 1.0);
#endif

        vec3 probeDirection = safeNormalize3(
          reflect(-viewDirection, surfaceNormalWS),
          input.baseNormalWS
        );
        vec3 rawAnalyticReflectionSample = waterSurfaceResolveAnalyticReflectionFallbackV2(
          surfaceNormalWS.y,
          effectiveSurfaceRoughness,
          scene_EnvMapLight.specularIntensity
        );
        vec3 rawEnvironmentReflectionSample;
        float rawEnvironmentReflectionValidity;
        waterSurfaceSampleRawEnvironmentReflectionV2(
          probeDirection,
          input.worldPosition,
          effectiveSurfaceRoughness,
          rawEnvironmentReflectionSample,
          rawEnvironmentReflectionValidity
        );
        vec3 rawSsrReflectionPremultipliedSample = vec3(0.0);
        float rawSsrReflectionValidity = 0.0;
        if (
          material_ReflectionSource > 2.5 &&
          rainRippleSurfaceRoughness < camera_ScreenSpaceReflectionMaxRoughness
        ) {
          vec2 ssrScreenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
          vec4 ssrReflection = texture2D(camera_ScreenSpaceReflectionTexture, ssrScreenUv);
          float ssrGlobalIntensity = saturate(camera_ScreenSpaceReflectionIntensity);
          ssrGlobalIntensity *= waterConnectionFacts(input.worldPosition.xz).y;
          rawSsrReflectionPremultipliedSample = ssrReflection.rgb * ssrGlobalIntensity;
          rawSsrReflectionValidity = saturate(
            ssrReflection.a * ssrGlobalIntensity
          );
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);

        WaterSurfaceRawRefractionFactsV2 rawRefractionFacts;
        rawRefractionFacts.centeredSceneSample = centeredOpaqueColor;
        rawRefractionFacts.displacedSceneSample = displacedOpaqueColor;
        rawRefractionFacts.displacedSampleValidity = refractionSampleValidity;
        rawRefractionFacts.depthWeight = refractionDepthWeight;
        rawRefractionFacts.shoreValidity = refractionShoreWeight;
        rawRefractionFacts.coverage = coverage;
        WaterSurfaceRawReflectionFactsV2 rawReflectionFacts;
        rawReflectionFacts.analyticSample = rawAnalyticReflectionSample;
        rawReflectionFacts.environmentSample = rawEnvironmentReflectionSample;
        rawReflectionFacts.environmentValidity = rawEnvironmentReflectionValidity;
        rawReflectionFacts.ssrPremultipliedSample = rawSsrReflectionPremultipliedSample;
        rawReflectionFacts.ssrValidity = rawSsrReflectionValidity;
        WaterSurfaceRawContributionPolicyV2 rawContributionPolicy;
        rawContributionPolicy.primaryColorClosureModel = 2.0;
        rawContributionPolicy.refractionEnabled = step(0.5, material_RefractionEnabled) * 1.0;
        rawContributionPolicy.clarity = clarity;
        rawContributionPolicy.boundaryRefractionSuppression = appearanceBoundaryRefractionSuppression;
        rawContributionPolicy.reflectionSource = material_ReflectionSource;
        rawContributionPolicy.ssrCompositeIntensity = material_WaterScreenSpaceReflectionCompositeIntensity;
        WaterSurfaceResolvedRawContributionsV2 resolvedContributions = waterSurfaceResolveRawContributionsV2(
          rawRefractionFacts,
          rawReflectionFacts,
          contactFoamMask,
          rawContributionPolicy
        );
        WaterSurfaceFinalClosureV2Input closureInput;
        closureInput.primarySceneColor = resolvedContributions.refractionSceneColor;
        closureInput.surfaceColor = material_ShallowColor.rgb;
        closureInput.depthColor = appearanceDepthTintColor;
        closureInput.depthFactor = appearanceDepthTintFactor
          * material_AppearanceV2DepthResponseEnabled;
        closureInput.diffuseLighting = waterDiffuseLighting;
        closureInput.primaryColorClosureModel = 2.0;
        closureInput.absorptionCoefficient = material_AbsorptionCoefficient;
        closureInput.scatteringColor = material_ScatteringColor;
        closureInput.scatteringCoefficient = material_ScatteringCoefficient;
        closureInput.opticalDepth = opticalDepth;
        closureInput.refractionColor = resolvedContributions.refractionSceneColor;
        closureInput.refractionWeight = resolvedContributions.refractionWeight;
        closureInput.reflectionRadiance = resolvedContributions.reflectionRadiance;
        closureInput.fresnelF0 = fresnelF0;
        closureInput.perceptualRoughness = effectiveSurfaceRoughness;
        closureInput.normalDotView = normalDotView;
        closureInput.transmissionFresnelWeight = 1.0;
        closureInput.reflectionIntensity = reflectionIntensity;
        closureInput.directSpecularRadiance = directSpecularRadiance;
        closureInput.boundaryColor = appearanceBoundaryColor;
        closureInput.foamColor = appearanceBoundaryColor / max(contactFoamMask, 0.0001);
        closureInput.foamWeight = resolvedContributions.foamWeight;
        closureInput.baseAlpha = material_Alpha;
        closureInput.clarity = clarity;
        #ifndef WATER_SURFACE_APPEARANCE_V2_COMPOSITION_0_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_COMPOSITION_0_INCLUDED
closureInput.coastalAlpha = appearanceCoastalAlpha;
        closureInput.coastalAlphaWeight = material_AppearanceV2BoundaryAlphaEnabled;
#endif

        closureInput.coverage = coverage;
        closureInput.compositionSceneColor = centeredOpaqueColor;
        closureInput.precomposedReplace = 1.0;
        #ifdef MATERIAL_WATER_CONNECTIONS
        // Both sides approach clear, flat water before their authored optical response resumes.
        float connectionWeight = waterConnectionFacts(input.worldPosition.xz).x;
        closureInput.depthFactor *= connectionWeight;
        closureInput.opticalDepth *= connectionWeight;
        closureInput.directSpecularRadiance *= connectionWeight;
        closureInput.perceptualRoughness = mix(0.1, closureInput.perceptualRoughness, connectionWeight);
#endif
        vec4 resolvedWaterClosure = waterSurfaceEvaluateFinalClosureV2(closureInput, 0.0);

        // C and A are retained independently so framebuffer analysis can prove
        // whether the legacy transparent path applies the opaque background twice.
        vec3 shaderCompositedColor = resolvedWaterClosure.rgb;
        float surfaceAlpha = resolvedWaterClosure.a;
        vec3 fragmentColor = shaderCompositedColor;
        float fragmentAlpha = surfaceAlpha;
#ifdef MATERIAL_WATER_PRESENTATION_REVEAL
        float presentationBand = max(material_PresentationRevealBand, 0.0001);
        vec2 presentationTileUv = fract(input.atlasUv * max(material_PresentationRevealRepeat, vec2(1.0)));
        vec2 presentationGrid = vec2(64.0, 48.0);
        vec2 presentationNoisePosition = presentationTileUv * presentationGrid;
        vec2 presentationCell = floor(presentationNoisePosition);
        vec2 presentationCellUv = fract(presentationNoisePosition);
        presentationCellUv = presentationCellUv * presentationCellUv * (3.0 - 2.0 * presentationCellUv);
        float presentationCellNoise00 = fract(sin(dot(presentationCell, vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise10 = fract(sin(dot(presentationCell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise01 = fract(sin(dot(presentationCell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationCellNoise11 = fract(sin(dot(presentationCell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453123);
        float presentationNoise = mix(
          mix(presentationCellNoise00, presentationCellNoise10, presentationCellUv.x),
          mix(presentationCellNoise01, presentationCellNoise11, presentationCellUv.x),
          presentationCellUv.y
        );
        float presentationProgress = clamp(material_PresentationRevealProgress, 0.0, 1.0);
        float presentationVisibility = smoothstep(
          presentationNoise - presentationBand,
          presentationNoise + presentationBand,
          presentationProgress
        );
        if (presentationVisibility <= 0.001) discard;
        float presentationCrest = 1.0 - smoothstep(
          0.0,
          presentationBand * 1.8,
          abs(presentationProgress - presentationNoise)
        );
        vec3 presentationCrestColor = mix(
          vec3(0.18, 0.86, 1.0),
          vec3(0.72, 0.38, 1.0),
          presentationNoise
        );
        fragmentColor = mix(fragmentColor, presentationCrestColor, presentationCrest * 0.72);
        fragmentAlpha *= presentationVisibility;
#endif
        if (material_CompositionMode > 0.5) {
          if (coverage <= 0.001) discard;
          // Precomposed-replace writes complete C. Blend is disabled by the
          // matching material render-state binding, so B is not consumed again.
          fragmentAlpha = 1.0;
        }
          gl_FragColor = waterSurfaceOutputWithPick(vec4(fragmentColor, fragmentAlpha));
      }

    }

    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV2"
      }
      DepthState ssrSurfaceDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState ssrSurfaceRasterState { CullMode = CullMode.Off; }
      DepthState = ssrSurfaceDepthState;
      RasterState = ssrSurfaceRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"

      vec4 scene_ElapsedTime;
      vec3 scene_WindVelocity;
      vec3 material_WindVelocity;
      float material_WindVelocityOverride;
      sampler2D material_LocalMapTexture;
#ifndef WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_UNIFORMS_INCLUDED
      float material_AppearanceV2DetailEnabled;
      float material_AppearanceV2DetailNormalStrength;
      float material_AppearanceV2DepthResponseEnabled;
      float material_AppearanceV2BoundaryAlphaEnabled;
      float material_AppearanceV2BoundaryMaterialEnabled;
      float material_AppearanceV2RefractionUvScale;

      sampler2D material_AppearanceV2Detail0Texture;
      vec4 material_AppearanceV2Detail0Transform;
      vec2 material_AppearanceV2Detail0Rotation;
      float material_AppearanceV2Detail0Strength;
      sampler2D material_AppearanceV2Detail1Texture;
      vec4 material_AppearanceV2Detail1Transform;
      vec2 material_AppearanceV2Detail1Rotation;
      float material_AppearanceV2Detail1Strength;

      float material_AppearanceV2DepthDistance;
      float material_AppearanceV2DepthExponent;
      vec4 material_AppearanceV2DepthColor;

      float material_AppearanceV2Boundary0Range;
      float material_AppearanceV2Boundary0Alpha;

      float material_AppearanceV2Boundary1Range;
      vec3 material_AppearanceV2Boundary1Color;
      float material_AppearanceV2Boundary1Roughness;
      float material_AppearanceV2Boundary1PatternWorldScale;
      float material_AppearanceV2Boundary1PatternTimeRate;
      float material_AppearanceV2Boundary1PatternOpacity;
      vec3 material_AppearanceV2Boundary1PatternWeights;
      float material_AppearanceV2Boundary1PatternLacunarity;
      float material_AppearanceV2Boundary1PatternExponent;



      float material_AppearanceDirectSpecularEnabled;
#endif

      vec4 material_LocalMapDecode;
      vec4 material_WaterWorldToLocalPlanar;
      float material_TimeScale;
      float material_WaveStrength;
      float material_WavesEnabled;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_MicroNormalsEnabled;
      float material_Roughness;
      float material_ScreenSpaceReflectionMode;
      float material_ScreenSpaceReflectionIntensity;

      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec2 TEXCOORD_0;
      };
      struct Varyings {
        vec3 worldPosition;
        vec3 objectPosition;
        vec2 meshUv;
        vec3 macroNormalWS;
        vec3 baseNormalWS;
        vec3 tangentWS;
        vec2 atlasUv;
        float waveOffset;
      };
      struct HeightfieldScreenSpaceReflectionSurfaceOutput {
        layout(location = 0) vec4 geometry;
        layout(location = 1) vec4 responseColor;
      };





#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_INCLUDED

      vec4 scene_WeatherState;
      float scene_WeatherTime;
      sampler2D scene_SurfaceRippleNormalAtlas;

      vec3 rainRippleSafeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 rainRippleDecodeNormal(vec3 encodedNormal) {
        vec3 normal = encodedNormal * 2.0 - 1.0;
        return rainRippleSafeNormalize3(vec3(normal.xy, max(normal.z, 0.08)), vec3(0.0, 0.0, 1.0));
      }

      vec3 rainRippleSampleFrame(vec2 localUv, float frame) {
        vec2 frameCell = vec2(mod(frame, 8.0), floor(frame * 0.125));
        vec2 frameUv = (
          frameCell + mix(vec2(0.04), vec2(0.96), clamp(localUv, 0.0, 1.0))
        ) * 0.125;
        return rainRippleDecodeNormal(
          texture2D(scene_SurfaceRippleNormalAtlas, frameUv).xyz
        );
      }

      vec2 rainRippleField(
        vec2 fieldUv,
        float weatherTime,
        float frameOffset,
        float rainStrength
      ) {
        float frameRate = mix(8.0, 24.0, clamp(rainStrength, 0.0, 1.0));
        float frame = floor(mod(weatherTime * frameRate + frameOffset, 64.0));
        return rainRippleSampleFrame(fract(fieldUv), frame).xy;
      }

      float rainRippleDensityWeight(vec2 rippleSlope, float rainAmount) {
        float minimumSlope = mix(0.14, 0.025, rainAmount);
        float feather = mix(0.07, 0.025, rainAmount);
        return smoothstep(
          minimumSlope,
          minimumSlope + feather,
          length(rippleSlope)
        );
      }

      vec3 rainRippleApplyNormal(
        vec3 surfaceNormalWS,
        vec3 macroNormalWS,
        vec2 rippleSlope
      ) {
        vec3 worldRippleSlope = vec3(rippleSlope.x, 0.0, rippleSlope.y);
        vec3 tangentRippleSlope = worldRippleSlope
          - macroNormalWS * dot(worldRippleSlope, macroNormalWS);
        return rainRippleSafeNormalize3(surfaceNormalWS + tangentRippleSlope, macroNormalWS);
      }

#endif

#ifndef WATER_SURFACE_APPEARANCE_INCLUDED
#define WATER_SURFACE_APPEARANCE_INCLUDED

#ifndef WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
#define WATER_SURFACE_NORMAL_FUNCTIONS_INCLUDED
vec3 waterSurfaceAppearanceSafeNormalize3(vec3 value, vec3 fallbackValue) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.000001
    ? value * inversesqrt(lengthSquared)
    : fallbackValue;
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



#endif





#endif

#ifndef WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED


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
      vec3 waterWindVelocity() {
        return mix(
          scene_WindVelocity,
          material_WindVelocity,
          clamp(material_WindVelocityOverride, 0.0, 1.0)
        );
      }

      float surfaceTime() {
        float selected = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        return mod(max(selected, 0.0), 4096.0);
      }

      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }





      Varyings vert(Attributes attr) {
        Varyings varyings;
        vec4 baseWorldPosition = renderer_ModelMat * attr.POSITION;
        vec3 computedBaseNormalWS = normalize(mat3(renderer_ModelMat) * attr.NORMAL);
        vec3 computedBaseTangentWS = normalize(mat3(renderer_ModelMat) * attr.TANGENT.xyz);
        vec3 computedBaseBitangentWS = normalize(
          cross(computedBaseNormalWS, computedBaseTangentWS) * attr.TANGENT.w
        );
        vec4 localMap = texture2D(material_LocalMapTexture, attr.TEXCOORD_0);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        signedDistance = waterConnectionShore(baseWorldPosition.xz, signedDistance);
        float shoreDamping = smoothstep(0.0, max(material_ShoreDampingWidth, 0.0001), signedDistance);
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          0.055,
          0.756,
          flowSpeed
        );
        vec2 flowDirection = safeNormalize2(flowXZ, vec2(-0.36, -0.9329523));
        float macroFlowAlignment = flowWeight * 0.72;
        float macroAmplitudeScale = mix(
          0.3,
          1.0,
          flowWeight
        );
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;

        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        waveOffset *= waterConnectionFacts(baseWorldPosition.xz).x;
        vec4 localPosition = attr.POSITION + vec4(attr.NORMAL * waveOffset, 0.0);
        gl_Position = renderer_MVPMat * localPosition;
        varyings.worldPosition = baseWorldPosition.xyz + computedBaseNormalWS * waveOffset;
        varyings.objectPosition = attr.POSITION.xyz;
        varyings.meshUv = attr.TEXCOORD_0;
        varyings.macroNormalWS = computedMacroNormalWS;
        varyings.baseNormalWS = computedBaseNormalWS;
        varyings.tangentWS = computedBaseTangentWS;
        varyings.atlasUv = attr.TEXCOORD_0;
        varyings.waveOffset = waveOffset;
        return varyings;
      }

      HeightfieldScreenSpaceReflectionSurfaceOutput frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        if (
          material_ScreenSpaceReflectionMode < 1.5
            || material_ScreenSpaceReflectionMode > 2.5
        ) discard;
        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        signedDistance = waterConnectionShore(input.worldPosition.xz, signedDistance);
        if (smoothstep(-0.08, 0.08, signedDistance) <= 0.001) discard;
        float elapsedTime = surfaceTime();
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          0.055,
          0.756,
          flowSpeed
        );
        float sceneWindSpeed = length(waterWindVelocity().xz);
        vec2 stillWaterDirection = sceneWindSpeed > 0.0001
          ? waterWindVelocity().xz / sceneWindSpeed
          : vec2(-0.36, -0.9329523);
        vec2 flowDirection = safeNormalize2(
          mix(
            stillWaterDirection,
            safeNormalize2(flowXZ, stillWaterDirection),
            flowWeight * 0.88
          ),
          stillWaterDirection
        );
        vec3 baseWorldPosition = input.worldPosition - input.baseNormalWS * input.waveOffset;
        vec3 surfaceNormalWS = safeNormalize3(input.macroNormalWS, input.macroNormalWS);
#ifndef WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_NORMAL_DETAIL_INCLUDED
        vec3 appearanceNormalTS = vec3(0.0, 0.0, 1.0);

        vec2 appearanceLayerCoordinate0 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled0 = appearanceLayerCoordinate0 * material_AppearanceV2Detail0Transform.xy;
        vec2 appearanceLayerUv0 = vec2(
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.x - appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.y,
          appearanceLayerScaled0.x * material_AppearanceV2Detail0Rotation.y + appearanceLayerScaled0.y * material_AppearanceV2Detail0Rotation.x
        ) + material_AppearanceV2Detail0Transform.zw;
        vec3 appearanceLayerNormal0 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail0Texture, appearanceLayerUv0),
          material_AppearanceV2Detail0Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal0);

        vec2 appearanceLayerCoordinate1 = baseWorldPosition.xz;
        vec2 appearanceLayerScaled1 = appearanceLayerCoordinate1 * material_AppearanceV2Detail1Transform.xy;
        vec2 appearanceLayerUv1 = vec2(
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.x - appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.y,
          appearanceLayerScaled1.x * material_AppearanceV2Detail1Rotation.y + appearanceLayerScaled1.y * material_AppearanceV2Detail1Rotation.x
        ) + material_AppearanceV2Detail1Transform.zw;
        vec3 appearanceLayerNormal1 = waterSurfaceAppearanceDecodeTangentNormalPreserveSourceZ(
          texture2D(material_AppearanceV2Detail1Texture, appearanceLayerUv1),
          material_AppearanceV2Detail1Strength,
          0.0
        );
        appearanceNormalTS = waterSurfaceAppearanceBlendTangentNormalsPartialDerivative(appearanceNormalTS, appearanceLayerNormal1);

        appearanceNormalTS = normalize(mix(vec3(0.0, 0.0, 1.0), appearanceNormalTS, material_AppearanceV2DetailNormalStrength));
        vec3 appearanceTangentWS = safeNormalize3(
          input.tangentWS - input.macroNormalWS * dot(input.tangentWS, input.macroNormalWS),
          vec3(1.0, 0.0, 0.0)
        );
        vec3 appearanceBitangentWS = safeNormalize3(
          cross(input.macroNormalWS, appearanceTangentWS),
          vec3(0.0, 0.0, 1.0)
        );
        vec3 appearanceSurfaceNormalWS = safeNormalize3(
          appearanceTangentWS * appearanceNormalTS.x
            + appearanceBitangentWS * appearanceNormalTS.y
            + input.macroNormalWS * appearanceNormalTS.z,
          input.macroNormalWS
        );
        surfaceNormalWS = safeNormalize3(
          mix(
            surfaceNormalWS,
            appearanceSurfaceNormalWS,
            material_AppearanceV2DetailEnabled * material_MicroNormalsEnabled
          ),
          input.macroNormalWS
        );
#endif

#ifndef WATER_HEIGHTFIELD_RAIN_RIPPLE_LAYERED_STATEMENTS_INCLUDED
#define WATER_HEIGHTFIELD_RAIN_RIPPLE_LAYERED_STATEMENTS_INCLUDED

        float rainRate = clamp(scene_WeatherState.x, 0.0, 1.0)
          * material_MicroNormalsEnabled;
        float rainRippleUpwardCosine = clamp(input.macroNormalWS.y, 0.0, 1.0);
        float rainRippleUpwardFade = rainRippleUpwardCosine * smoothstep(
          0.2,
          0.55,
          rainRippleUpwardCosine
        );
        vec3 rainRippleCameraDelta = camera_Position - input.worldPosition;
        float rainRippleHorizontalDistance = length(rainRippleCameraDelta.xz);
        float rainRippleVerticalDistance = abs(rainRippleCameraDelta.y);
        float rainRippleDistance =
          rainRippleHorizontalDistance + rainRippleVerticalDistance * 0.25;
        float rainRippleDistanceFade = 1.0 - smoothstep(
          42.0,
          150.0,
          rainRippleDistance
        );
        float rainRipplePlaybackStrength = smoothstep(0.04, 0.72, rainRate);
        float rainRippleRainAmount = smoothstep(0.02, 1.0, rainRate);
        float rainRippleStormAmount = smoothstep(0.68, 1.0, rainRate);
        float rainRippleRainPresence = step(0.0001, rainRate);
        float rainRippleRingAmplitude = mix(0.82, 1.0, rainRippleStormAmount);
        float rainRippleVisibility = rainRippleRainPresence
          * rainRippleUpwardFade
          * rainRippleDistanceFade;
        float rainRippleContribution = rainRippleVisibility
          * rainRippleRingAmplitude;
        float rainRippleMask = 0.0;
        if (rainRippleContribution > 0.001) {
          vec2 rainRipplePrimarySample = rainRippleField(
            baseWorldPosition.xz * 0.68,
            scene_WeatherTime,
            0.0,
            rainRipplePlaybackStrength
          );
          float rainRipplePrimaryDensity = rainRippleDensityWeight(
            rainRipplePrimarySample,
            rainRippleRainAmount
          );
          vec2 rainRippleSlope = rainRipplePrimarySample
            * (0.28 * rainRipplePrimaryDensity);
          float rainRippleRawMask = length(rainRipplePrimarySample)
            * rainRipplePrimaryDensity;
          vec2 rotatedRainRippleXZ = vec2(
            baseWorldPosition.x * 0.8 - baseWorldPosition.z * 0.6,
            baseWorldPosition.x * 0.6 + baseWorldPosition.z * 0.8
          );
          vec2 rainRippleSecondarySample = rainRippleField(
            rotatedRainRippleXZ * 1.07 + vec2(0.37, 0.19),
            scene_WeatherTime,
            23.0,
            rainRipplePlaybackStrength
          );
          float rainRippleSecondaryDensity = rainRippleDensityWeight(
            rainRippleSecondarySample,
            rainRippleRainAmount
          );
          float rainRippleSecondaryAmount = smoothstep(0.35, 1.0, rainRate);
          float rainRippleSecondaryWeight = rainRippleSecondaryDensity
            * rainRippleSecondaryAmount;
          rainRippleSlope += rainRippleSecondarySample
            * (0.18 * rainRippleSecondaryWeight);
          rainRippleRawMask = max(
            rainRippleRawMask,
            length(rainRippleSecondarySample) * rainRippleSecondaryWeight
          );
          rainRippleMask = smoothstep(0.035, 0.24, rainRippleRawMask)
            * clamp(rainRippleContribution, 0.0, 1.0);
          surfaceNormalWS = rainRippleApplyNormal(
            surfaceNormalWS,
            input.macroNormalWS,
            rainRippleSlope * rainRippleContribution
          );
        }
        float rainRippleRoughnessResponse = mix(
          -0.018,
          0.08,
          rainRippleStormAmount
        );
        float rainRippleRoughnessFloor = max(
          material_Roughness * 0.88,
          material_Roughness - 0.02
        );
        float rainRippleSurfaceRoughness = clamp(
          material_Roughness + rainRippleMask * rainRippleRoughnessResponse,
          rainRippleRoughnessFloor,
          1.0
        );

#endif

        surfaceNormalWS = waterConnectionNormal(input.worldPosition.xz, surfaceNormalWS);

        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, vec3(0.0, 1.0, 0.0));
        surfaceNormalWS *= step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        vec3 viewNormal = safeNormalize3(
          mat3(camera_ViewMat) * surfaceNormalWS,
          vec3(0.0, 0.0, 1.0)
        );
        HeightfieldScreenSpaceReflectionSurfaceOutput surfaceOutput;
        surfaceOutput.geometry = packScreenSpaceReflectionSurface(
          viewNormal,
          rainRippleSurfaceRoughness,
          1.0
        );
        surfaceOutput.responseColor = vec4(vec3(material_ScreenSpaceReflectionIntensity), 1.0);
        return surfaceOutput;
      }

    }

  }
}
