/** Dedicated heightfield-water shader: curved base surface, packed local map, waves, optics, and debug views. */
import { Engine, Material, Shader, Texture2D } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import { WATER_WAVE_PACKED_FLOATS_PER_WAVE } from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterMaterialConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import {
  applyWaterSurfaceOpticsBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import {
  WaterOpticsDebugView,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode
} from "./HeightfieldWaterRuntimeEnums";
import {
  DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
  type HeightfieldWaterReflectionSamplingConfig,
  type HeightfieldWaterReflectionSamplingFallbackReason,
  type HeightfieldWaterReflectionSamplingReadback
} from "./HeightfieldWaterReflectionSampling";
import {
  DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK,
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TUNING,
  HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS,
  HEIGHTFIELD_WATER_WAVE_TIME_SCALE
} from "./constants";
import { getHeightfieldWaterSurfaceTexture } from "./HeightfieldWaterSurfaceTextureFactory";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterLocalFoamMask,
  HeightfieldWaterMaterialState,
  HeightfieldWaterOpticsCalibrationReadback,
  MutableHeightfieldWaterSurfaceOpticsBinding
} from "./types";

const ZERO_WAVE = new Vector4(0, 0, 0, 0);

type MutableHeightfieldReflectionReadback = {
  -readonly [Property in keyof HeightfieldWaterReflectionSamplingReadback]: HeightfieldWaterReflectionSamplingReadback[Property];
};

type MutableHeightfieldWaterOpticsCalibrationReadback = {
  -readonly [Property in keyof HeightfieldWaterOpticsCalibrationReadback]: HeightfieldWaterOpticsCalibrationReadback[Property];
};

function resolveHeightfieldOpticsTier(quality: WaterQualityTier, requestedTier: WaterOpticsTier): WaterOpticsTier {
  if (quality !== WaterQualityTier.High) return "medium";
  return requestedTier === "experimental" ? "experimental" : "high";
}

function createHeightfieldReflectionReadback(quality: WaterQualityTier): MutableHeightfieldReflectionReadback {
  return Object.seal({
    ...DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
    quality,
    requestedSource: "sky",
    bindingResolvedSource: "sky",
    effectiveSource: "sky",
    fallbackReason: undefined,
    textureWidth: 0,
    textureHeight: 0,
    filterSampleCount: 1
  });
}

function createHeightfieldWaterOpticsCalibrationReadback(): MutableHeightfieldWaterOpticsCalibrationReadback {
  return Object.seal({
    mode: HeightfieldWaterOpticsCalibrationMode.None,
    referenceCompositionEnabled: false,
    effectiveFresnelOverride: undefined
  });
}

function mapHeightfieldReflectionFallback(
  fallbackReason: WaterSurfaceOpticsReflectionReadback["fallbackReason"]
): HeightfieldWaterReflectionSamplingFallbackReason | undefined {
  switch (fallbackReason) {
    case "water-optics-probe-texture-unavailable":
      return "heightfield-probe-texture-unavailable";
    case "water-optics-planar-texture-unavailable":
      return "heightfield-planar-texture-unavailable";
    case "water-optics-planar-texture-size-invalid":
      return "heightfield-planar-texture-size-invalid";
    case "water-optics-planar-view-projection-unavailable":
      return "heightfield-planar-view-projection-unavailable";
    case "water-optics-planar-view-projection-invalid":
      return "heightfield-planar-view-projection-invalid";
    default:
      return fallbackReason;
  }
}

function updateHeightfieldReflectionReadback(
  state: HeightfieldWaterMaterialState,
  sharedReadback: Readonly<WaterSurfaceOpticsReflectionReadback>,
  requestedBinding: Readonly<WaterReflectionBinding> | undefined
): void {
  const readback = state.heightfieldReflectionReadback as MutableHeightfieldReflectionReadback;
  const lowUnsupported =
    state.quality === WaterQualityTier.Low && (requestedBinding?.resolvedSource ?? "sky") !== "sky";
  readback.distortionStrength = sharedReadback.distortionStrength;
  readback.edgeFadeTexels = sharedReadback.edgeFadeTexels;
  readback.minimumClipW = sharedReadback.minimumClipW;
  readback.planeDistanceFadeStart = sharedReadback.planeDistanceFadeStart;
  readback.planeDistanceFadeEnd = sharedReadback.planeDistanceFadeEnd;
  readback.viewAngleFadeStart = sharedReadback.viewAngleFadeStart;
  readback.viewAngleFadeEnd = sharedReadback.viewAngleFadeEnd;
  readback.roughnessFootprintTexels = sharedReadback.roughnessFootprintTexels;
  readback.highFilterSampleCount = sharedReadback.highFilterSampleCount;
  readback.quality = state.quality;
  readback.requestedSource = requestedBinding?.requestedSource ?? "sky";
  readback.bindingResolvedSource = requestedBinding?.resolvedSource ?? "sky";
  readback.effectiveSource = lowUnsupported ? "sky" : sharedReadback.effectiveSource;
  readback.fallbackReason = lowUnsupported
    ? "heightfield-reflection-quality-unsupported"
    : mapHeightfieldReflectionFallback(sharedReadback.fallbackReason ?? requestedBinding?.fallbackReason);
  readback.textureWidth = lowUnsupported ? 0 : sharedReadback.textureWidth;
  readback.textureHeight = lowUnsupported ? 0 : sharedReadback.textureHeight;
  readback.filterSampleCount = lowUnsupported ? 1 : sharedReadback.filterSampleCount;
}

function applyCachedHeightfieldWaterSurfaceOpticsBinding(
  state: HeightfieldWaterMaterialState
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const cachedBinding = state.surfaceOpticsBinding;
  const requestedReflection = cachedBinding.reflection;
  if (state.quality === WaterQualityTier.Low) cachedBinding.reflection = undefined;
  let readback: Readonly<WaterSurfaceOpticsBindingReadback>;
  try {
    readback = applyWaterSurfaceOpticsBinding(state.material.shaderData, state, cachedBinding);
  } finally {
    cachedBinding.reflection = requestedReflection;
  }
  updateHeightfieldReflectionReadback(state, readback, requestedReflection);
  return readback;
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function surfaceLayerCount(quality: WaterQualityTier): number {
  switch (quality) {
    case WaterQualityTier.Low:
      return 1;
    case WaterQualityTier.Medium:
      return 2;
    case WaterQualityTier.High:
      return 3;
  }
}

function flowSurfaceLayerStatements(quality: WaterQualityTier): string {
  const layerCount = surfaceLayerCount(quality);
  const {
    layerScales,
    layerRates,
    layerWeights,
    layerOffsets,
    layerCycleJumps,
    layerSpatialPhaseVectors,
    stillWaterDirections
  } = HEIGHTFIELD_WATER_SURFACE_TUNING;
  let statements = "";
  for (let index = 0; index < layerCount; index++) {
    const offset = layerOffsets[index];
    const cycleJump = layerCycleJumps[index];
    const spatialPhaseVector = layerSpatialPhaseVectors[index];
    const stillDirection = stillWaterDirections[index];
    statements += `        vec2 layerFlowDirection${index} = safeNormalize2(
          mix(
            vec2(${glsl(stillDirection[0])}, ${glsl(stillDirection[1])}),
            flowDirection,
            flowWeight
          ),
          flowDirection
        );
        vec4 flowSurface${index} = sampleFlowSurface(
          baseWorldPosition.xz,
          layerFlowDirection${index},
          flowSpeed,
          elapsedTime * material_TimeScale,
          ${glsl(layerScales[index])},
          ${glsl(layerRates[index])},
          vec2(${glsl(offset[0])}, ${glsl(offset[1])}),
          vec2(${glsl(cycleJump[0])}, ${glsl(cycleJump[1])}),
          vec2(${glsl(spatialPhaseVector[0])}, ${glsl(spatialPhaseVector[1])})
        );\n`;
  }
  const weightedTerms: string[] = [];
  let weightSum = 0;
  for (let index = 0; index < layerCount; index++) {
    const weight = layerWeights[index];
    weightedTerms.push(`flowSurface${index} * ${glsl(weight)}`);
    weightSum += weight;
  }
  statements += `        vec4 flowSurface = (${weightedTerms.join(" + ")}) / ${glsl(weightSum)};\n`;
  return statements;
}

function wakeFoamStatements(quality: WaterQualityTier): string {
  if (quality === WaterQualityTier.Low) return "        float wakeFoam = 0.0;";
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  const tapDistances =
    quality === WaterQualityTier.Medium ? [tuning.mediumWakeTapDistance] : [...tuning.highWakeTapDistances];
  let statements = "        vec2 wakeLateralDirection = vec2(-flowDirection.y, flowDirection.x);\n";
  for (let index = 0; index < tapDistances.length; index++) {
    statements += `        vec2 upstreamAtlasUvRaw${index} = input.atlasUv
          - flowDirection * material_LocalMapWorldToUv.xy * ${glsl(tapDistances[index])};
        float upstreamAtlasInterior${index} = step(0.001, upstreamAtlasUvRaw${index}.x)
          * step(upstreamAtlasUvRaw${index}.x, 0.999)
          * step(0.001, upstreamAtlasUvRaw${index}.y)
          * step(upstreamAtlasUvRaw${index}.y, 0.999);
        vec2 upstreamAtlasUv${index} = clamp(upstreamAtlasUvRaw${index}, vec2(0.001), vec2(0.999));
        float upstreamSignedDistance${index} = (
          texture2D(material_LocalMapTexture, upstreamAtlasUv${index}).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        vec2 upstreamLateralUvRawA${index} = upstreamAtlasUvRaw${index}
          + wakeLateralDirection * material_LocalMapWorldToUv.xy * ${glsl(tuning.wakeLateralProbeDistance)};
        vec2 upstreamLateralUvRawB${index} = upstreamAtlasUvRaw${index}
          - wakeLateralDirection * material_LocalMapWorldToUv.xy * ${glsl(tuning.wakeLateralProbeDistance)};
        float upstreamLateralInteriorA${index} = step(0.001, upstreamLateralUvRawA${index}.x)
          * step(upstreamLateralUvRawA${index}.x, 0.999)
          * step(0.001, upstreamLateralUvRawA${index}.y)
          * step(upstreamLateralUvRawA${index}.y, 0.999);
        float upstreamLateralInteriorB${index} = step(0.001, upstreamLateralUvRawB${index}.x)
          * step(upstreamLateralUvRawB${index}.x, 0.999)
          * step(0.001, upstreamLateralUvRawB${index}.y)
          * step(upstreamLateralUvRawB${index}.y, 0.999);
        float upstreamLateralSignedDistanceA${index} = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawA${index}, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamLateralSignedDistanceB${index} = (
          texture2D(
            material_LocalMapTexture,
            clamp(upstreamLateralUvRawB${index}, vec2(0.001), vec2(0.999))
          ).a * 2.0 - 1.0
        ) * material_LocalMapDecode.z;
        float upstreamObstacleGate${index} = min(
          smoothstep(
            ${glsl(tuning.wakeLateralWetSdfStart)},
            ${glsl(tuning.wakeLateralWetSdfEnd)},
            upstreamLateralSignedDistanceA${index}
          ) * upstreamLateralInteriorA${index},
          smoothstep(
            ${glsl(tuning.wakeLateralWetSdfStart)},
            ${glsl(tuning.wakeLateralWetSdfEnd)},
            upstreamLateralSignedDistanceB${index}
          ) * upstreamLateralInteriorB${index}
        );
        float upstreamDryness${index} = (
          1.0 - smoothstep(
            ${glsl(tuning.wakeDrySdfStart)},
            ${glsl(tuning.wakeDrySdfEnd)},
            upstreamSignedDistance${index}
          )
        ) * upstreamAtlasInterior${index} * upstreamObstacleGate${index};
`;
  }
  const combinedDryness =
    tapDistances.length === 1
      ? "upstreamDryness0"
      : `max(upstreamDryness0, upstreamDryness1 * ${glsl(tuning.highWakeSecondaryWeight)})`;
  statements += `        float wakeDryness = ${combinedDryness};
        float wakeInterior = smoothstep(
          ${glsl(tuning.wakeInteriorSdfStart)},
          ${glsl(tuning.wakeInteriorSdfEnd)},
          signedDistance
        );
        float wakeDetail = smoothstep(
          ${glsl(tuning.wakeDetailNoiseStart)},
          ${glsl(tuning.wakeDetailNoiseEnd)},
          foamNoise + abs(flowSurface.x) * 0.12
        );
        float wakeFoam = wakeDryness
          * wakeInterior
          * flowWeight
          * wakeDetail
          * ${glsl(tuning.wakeFoamStrength)};`;
  return statements;
}

function waveUniformDeclarations(waveCount: number): string {
  let declarations = "";
  for (let index = 0; index < waveCount; index++) {
    declarations += `      vec4 ${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index};\n`;
    declarations += `      vec4 ${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index};\n`;
  }
  return declarations;
}

function waveApplyStatements(waveCount: number): string {
  let statements = "";
  for (let index = 0; index < waveCount; index++) {
    statements += `        applyHeightfieldWave(
          ${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index},
          ${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index},
          baseWorldPosition.xz,
          elapsedTime,
          computedBaseTangentWS,
          computedBaseBitangentWS,
          flowDirection,
          macroFlowAlignment,
          macroAmplitudeScale,
          waveRateScale,
          shoreDamping,
          waveOffset,
          tangentSlope,
          bitangentSlope
        );\n`;
  }
  return statements;
}

function sceneDepthDeclarations(useSceneDepth: boolean): string {
  return useSceneDepth
    ? `      sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      vec4 camera_ProjectionParams;
      vec4 camera_DepthBufferParams;`
    : "";
}

function opticalDepthCalculation(useSceneDepth: boolean): string {
  if (!useSceneDepth) {
    return "        float opticalDepth = authoredDepth;";
  }
  return `        vec2 screenUv = (input.clipPosition.xy / input.clipPosition.w) * 0.5 + 0.5;
        float sceneEyeDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, screenUv).r);
        float sampledOpticalDepth = max(sceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float opticalDepth = min(sampledOpticalDepth, authoredDepth);`;
}

function sceneDepthFunction(useSceneDepth: boolean): string {
  if (!useSceneDepth) return "";
  return `      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }`;
}

function sceneColorRefraction(quality: WaterQualityTier): string {
  if (quality === WaterQualityTier.Low) return "";
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  const uvScale = quality === WaterQualityTier.High ? tuning.highRefractionUvScale : tuning.mediumRefractionUvScale;
  const refractionMix = quality === WaterQualityTier.High ? tuning.highRefractionMix : tuning.mediumRefractionMix;
  return `        float refractionFeatureWeight = step(0.5, material_RefractionEnabled);
        vec3 baseNormalVS = normalize(mat3(camera_ViewMat) * input.baseNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec2 refractionNormalDelta = surfaceNormalVS.xy - baseNormalVS.xy;
        refractionDepthWeight = smoothstep(
          ${glsl(tuning.refractionDepthStart)},
          ${glsl(tuning.refractionDepthEnd)},
          opticalDepth
        );
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta
            * ${glsl(uvScale)}
            * material_RefractionStrength
            * refractionFeatureWeight
            * refractionDepthWeight;
        float refractionScreenInterior = step(0.002, displacedScreenUv.x)
          * step(displacedScreenUv.x, 0.998)
          * step(0.002, displacedScreenUv.y)
          * step(displacedScreenUv.y, 0.998);
        vec2 refractedScreenUv = clamp(displacedScreenUv, vec2(0.002), vec2(0.998));
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDepth = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float refractionDepthTolerance = max(
          ${glsl(tuning.refractionDepthToleranceMinimum)},
          opticalDepth * ${glsl(tuning.refractionDepthToleranceScale)}
        );
        refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth);
        refractionSampleValidity = refractionScreenInterior
          * refractionDepthContinuity
          * refractedGeometryBehindSurface;
        refractionUvDelta = refractedScreenUv - screenUv;
        centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        refractedSceneColor = mix(
          centeredOpaqueColor,
          displacedOpaqueColor,
          refractionSampleValidity
        );
        vec3 refractionTint = mix(vec3(0.82, 0.95, 0.97), vec3(0.63, 0.84, 0.88), depthRatio);
        // The coastline gate must be evaluated per fragment. Large water
        // triangles can have only boundary vertices, making the interpolated
        // vertex shore damping zero even while this fragment is well inside.
        float fragmentShoreDamping = smoothstep(
          0.0,
          max(material_ShoreDampingWidth, 0.0001),
          signedDistance
        );
        refractionShoreWeight = smoothstep(0.12, 0.72, fragmentShoreDamping);
        refractionAmount = ${glsl(refractionMix)}
          * clarity
          * transmittance.g
          * refractionDepthWeight
          * refractionFeatureWeight
          * refractionShoreWeight
          * (1.0 - foamTint * ${glsl(tuning.refractionFoamSuppression)})
          * (1.0 - localFoamMask);
        if (material_OpticsCalibrationMode < 0.5) {
          waterColor = mix(waterColor, refractedSceneColor * refractionTint, refractionAmount);
        }
`;
}

function reflectionUniformDeclarations(quality: WaterQualityTier): string {
  if (quality === WaterQualityTier.Low) return "";
  return `      float material_ReflectionSource;
      samplerCube material_ReflectionCubeTexture;
      sampler2D material_PlanarReflectionTexture;
      mat4 material_PlanarReflectionVP;
      vec4 material_PlanarReflectionTextureSize;
      vec4 material_PlanarReflectionSampling;
      vec4 material_PlanarReflectionFade;
      float material_PlanarReflectionRoughnessFootprint;`;
}

function planarFilterSampleStatements(quality: WaterQualityTier): string {
  if (quality !== WaterQualityTier.High) {
    return `            vec3 sampledPlanarReflection = texture2D(
              material_PlanarReflectionTexture,
              planarSampleUv
            ).rgb;`;
  }
  return `            vec3 sampledPlanarReflection = texture2D(
              material_PlanarReflectionTexture,
              planarSampleUv
            ).rgb;
            if (material_PlanarReflectionSampling.w > 3.0) {
              float planarRoughness = saturate(material_Roughness);
              float filterRadiusTexels = mix(
                0.5,
                max(material_PlanarReflectionRoughnessFootprint, 0.5),
                planarRoughness
              );
              vec2 filterOffset = planarTexelSize * filterRadiusTexels;
              vec3 crossAverage = (
                texture2D(
                  material_PlanarReflectionTexture,
                  clamp(planarSampleUv + vec2(filterOffset.x, 0.0), planarInteriorMin, planarInteriorMax)
                ).rgb
                + texture2D(
                  material_PlanarReflectionTexture,
                  clamp(planarSampleUv - vec2(filterOffset.x, 0.0), planarInteriorMin, planarInteriorMax)
                ).rgb
                + texture2D(
                  material_PlanarReflectionTexture,
                  clamp(planarSampleUv + vec2(0.0, filterOffset.y), planarInteriorMin, planarInteriorMax)
                ).rgb
                + texture2D(
                  material_PlanarReflectionTexture,
                  clamp(planarSampleUv - vec2(0.0, filterOffset.y), planarInteriorMin, planarInteriorMax)
                ).rgb
              ) * 0.25;
              sampledPlanarReflection = mix(
                sampledPlanarReflection,
                crossAverage,
                mix(0.15, 0.55, planarRoughness)
              );
            }`;
}

function surfaceReflectionStatements(quality: WaterQualityTier): string {
  const analyticSky = `        vec3 skyReflection = mix(
          vec3(0.075, 0.16, 0.21),
          vec3(0.32, 0.48, 0.57),
          mix(saturate(surfaceNormalWS.y * 0.5 + 0.5), 0.5, saturate(material_Roughness))
        );`;
  if (quality === WaterQualityTier.Low) {
    return `${analyticSky}
        vec3 reflectionColor = skyReflection;
        vec3 reflectionSourceDebug = vec3(0.1, 0.3, 1.0);
        vec2 planarReflectionUvDebug = vec2(0.5);
        float planarClipSideDebug = 0.0;
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
        if (material_OpticsCalibrationMode < 0.5) {
          waterColor = mix(waterColor, reflectionColor, saturate(fresnel * 0.72 * reflectionIntensity));
        }`;
  }
  return `${analyticSky}
        vec3 reflectionColor = skyReflection;
        vec3 reflectionSourceDebug = vec3(0.1, 0.3, 1.0);
        vec2 planarReflectionUvDebug = vec2(0.5);
        float planarClipSideDebug = 0.0;
        if (material_ReflectionSource > 1.5) {
          reflectionSourceDebug = vec3(1.0, 0.3, 0.1);
          vec4 reflectionClip = material_PlanarReflectionVP * vec4(input.worldPosition, 1.0);
          float minimumClipW = max(material_PlanarReflectionSampling.z, 0.000001);
          planarClipSideDebug = step(minimumClipW, reflectionClip.w);
          if (reflectionClip.w > minimumClipW) {
            // The binding VP already contains the render-target Y flip. Do not flip UV.y here.
            vec2 projectedPlanarUv = reflectionClip.xy / reflectionClip.w * 0.5 + 0.5;
            vec3 planarBitangentWS = safeNormalize3(
              cross(input.baseNormalWS, input.tangentWS),
              vec3(0.0, 0.0, 1.0)
            );
            vec3 microNormalDeltaWS = surfaceNormalWS - input.macroNormalWS;
            vec2 planarMicroSlope = vec2(
              dot(microNormalDeltaWS, input.tangentWS),
              dot(microNormalDeltaWS, planarBitangentWS)
            );
            vec2 distortedPlanarUv = projectedPlanarUv
              + planarMicroSlope * max(material_PlanarReflectionSampling.x, 0.0);
            planarReflectionUvDebug = distortedPlanarUv;
            bool planarInsideScreen = all(greaterThanEqual(distortedPlanarUv, vec2(0.0)))
              && all(lessThanEqual(distortedPlanarUv, vec2(1.0)));
            if (planarInsideScreen) {
              vec2 planarTexelSize = max(
                material_PlanarReflectionTextureSize.zw,
                vec2(0.000001)
              );
              vec2 planarInteriorMin = planarTexelSize * 0.5;
              vec2 planarInteriorMax = vec2(1.0) - planarInteriorMin;
              vec2 planarSampleUv = clamp(
                distortedPlanarUv,
                planarInteriorMin,
                planarInteriorMax
              );
              float edgeDistanceUv = min(
                min(distortedPlanarUv.x, 1.0 - distortedPlanarUv.x),
                min(distortedPlanarUv.y, 1.0 - distortedPlanarUv.y)
              );
              float edgeDistanceTexels = edgeDistanceUv / max(
                max(planarTexelSize.x, planarTexelSize.y),
                0.000001
              );
              float screenInteriorFade = smoothstep(
                0.0,
                max(material_PlanarReflectionSampling.y, 1.0),
                edgeDistanceTexels
              );
              float clipWFade = smoothstep(minimumClipW, minimumClipW * 4.0, reflectionClip.w);
              float localPlaneDistance = abs(dot(
                camera_Position - input.worldPosition,
                input.baseNormalWS
              ));
              float planeDistanceFade = smoothstep(
                material_PlanarReflectionFade.x,
                material_PlanarReflectionFade.y,
                localPlaneDistance
              );
              float viewAngleFade = smoothstep(
                material_PlanarReflectionFade.z,
                material_PlanarReflectionFade.w,
                saturate(dot(input.baseNormalWS, viewDirection))
              );
${planarFilterSampleStatements(quality)}
              float planarValidity = screenInteriorFade
                * clipWFade
                * planeDistanceFade
                * viewAngleFade;
              reflectionColor = mix(skyReflection, sampledPlanarReflection, saturate(planarValidity));
            }
          }
        } else if (material_ReflectionSource > 0.5) {
          reflectionSourceDebug = vec3(0.2, 1.0, 0.3);
          vec3 probeDirection = safeNormalize3(
            reflect(-viewDirection, surfaceNormalWS),
            input.baseNormalWS
          );
          reflectionColor = textureCube(material_ReflectionCubeTexture, probeDirection).rgb;
        }
        float reflectionIntensity = max(material_ReflectionIntensity, 0.0);
        if (material_OpticsCalibrationMode < 0.5) {
          waterColor = mix(waterColor, reflectionColor, saturate(fresnel * 0.72 * reflectionIntensity));
        }`;
}

/** Creates a fixed 2/6/12-wave variant without dynamic shader loops. */
export function createHeightfieldWaterShaderSource(quality: WaterQualityTier, waveCount: number): string {
  const useSceneDepth = quality !== WaterQualityTier.Low;
  const qualityName = quality[0].toUpperCase() + quality.slice(1);
  return `
Shader "AIWorld/HeightfieldWater${qualityName}${waveCount}" {
  SubShader "Default" {
    Pass "Forward" {
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

      mat4 renderer_MVPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;
      mat4 camera_ViewMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
${sceneDepthDeclarations(useSceneDepth)}
      sampler2D material_LocalMapTexture;
      sampler2D material_SurfaceTexture;
      vec4 material_LocalMapWorldToUv;
      vec4 renderer_AtlasUvRect;
      vec4 material_LocalMapDecode;
      vec4 material_ShallowColor;
      vec4 material_DeepColor;
      vec4 material_FoamColor;
      float material_Alpha;
      float material_Clarity;
      float material_TimeScale;
      float material_WaveStrength;
      float material_MicroNormalStrength;
      float material_FoamIntensity;
      float material_ShoreDampingWidth;
      float material_SurfaceTimeOverride;
      float material_DebugMode;
      float material_RefractionEnabled;
      float material_CompositionMode;
      float material_OpticsCalibrationMode;
      float material_WavesEnabled;
      float material_MicroNormalsEnabled;
      float material_FoamEnabled;
      float material_LocalFoamMaskEnabled;
      vec4 material_LocalFoamMaskCenterHalfSize;
      float material_LocalFoamMaskFeather;
      float material_MaxVerticalDisplacement;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_RefractionStrength;
      float material_Roughness;
      float material_ReflectionIntensity;
${reflectionUniformDeclarations(quality)}
${waveUniformDeclarations(waveCount)}
      struct Attributes {
        vec4 POSITION;
        vec3 NORMAL;
        vec4 TANGENT;
        vec2 TEXCOORD_0;
      };
      struct Varyings {
        vec3 worldPosition;
        vec3 baseNormalWS;
        vec3 macroNormalWS;
        vec3 tangentWS;
        vec2 atlasUv;
        float baseSurfaceHeight;
        float waveOffset;
        float surfaceEyeDepth;
        float shoreDamping;
        vec4 clipPosition;
      };

      float surfaceTime() {
        float selected = material_SurfaceTimeOverride >= 0.0
          ? material_SurfaceTimeOverride
          : scene_ElapsedTime.x;
        return mod(max(selected, 0.0), ${HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS.toFixed(1)});
      }

      vec2 safeNormalize2(vec2 value, vec2 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      vec3 safeNormalize3(vec3 value, vec3 fallbackValue) {
        float lengthSquared = dot(value, value);
        return lengthSquared > 0.000001 ? value * inversesqrt(lengthSquared) : fallbackValue;
      }

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      vec4 sampleFlowSurface(
        vec2 worldXZ,
        vec2 flowDirection,
        float flowSpeed,
        float elapsedTime,
        float scale,
        float rate,
        vec2 layerOffset,
        vec2 cycleJump,
        vec2 spatialPhaseDirection
      ) {
        float flowWeight = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42)},
          flowSpeed
        );
        float normalizedSpeed = saturate(
          flowSpeed / ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed)}
        );
        float cycleRate = ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.phaseRate)} * rate
          * mix(
            ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillCycleRateScale)},
            ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.flowingCycleRateBase)}
              + normalizedSpeed * ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.flowingCycleRateSpeedScale)},
            flowWeight
          );
        float spatialPhase = dot(worldXZ, spatialPhaseDirection);
        float cycle = elapsedTime * cycleRate + spatialPhase;
        float progressA = fract(cycle);
        float progressB = fract(cycle + 0.5);
        float weightA = 1.0 - abs(progressA * 2.0 - 1.0);
        float weightB = 1.0 - abs(progressB * 2.0 - 1.0);
        float travel = ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.phaseTravel)}
          * mix(
            ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillPhaseTravelScale)},
            ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.flowingPhaseTravelBase)}
              + normalizedSpeed * ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.flowingPhaseTravelSpeedScale)},
            flowWeight
          );
        vec2 baseUv = worldXZ * scale + layerOffset;
        vec4 sampleA = texture2D(
          material_SurfaceTexture,
          baseUv
            - flowDirection * ((progressA - 0.5) * travel)
            + (cycle - progressA) * cycleJump
        );
        vec4 sampleB = texture2D(
          material_SurfaceTexture,
          baseUv
            - flowDirection * ((progressB - 0.5) * travel)
            + vec2(
              ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.phaseBOffset[0])},
              ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.phaseBOffset[1])}
            )
            + (cycle - progressB) * cycleJump
        );
        vec4 decodedA = vec4(sampleA.rg * 2.0 - 1.0, sampleA.ba);
        vec4 decodedB = vec4(sampleB.rg * 2.0 - 1.0, sampleB.ba);
        return (decodedA * weightA + decodedB * weightB) / max(weightA + weightB, 0.001);
      }

${sceneDepthFunction(useSceneDepth)}

      void applyHeightfieldWave(
        vec4 waveA,
        vec4 waveB,
        vec2 restXZ,
        float elapsedTime,
        vec3 tangentWS,
        vec3 bitangentWS,
        vec2 localFlowDirection,
        float flowAlignment,
        float macroAmplitudeScale,
        float waveRateScale,
        float shoreDamping,
        inout float displacement,
        inout float tangentSlope,
        inout float bitangentSlope
      ) {
        float angularRate = waveB.x * material_TimeScale * waveRateScale;
        float wavePeriod = 6.28318531 / max(abs(angularRate), 0.000001);
        float wrappedTime = mod(elapsedTime, wavePeriod);
        vec2 tangentXZ = safeNormalize2(tangentWS.xz, vec2(1.0, 0.0));
        vec2 authoredDirection = safeNormalize2(waveA.xy, tangentXZ);
        vec2 waveDirection = safeNormalize2(
          mix(authoredDirection, localFlowDirection, flowAlignment),
          authoredDirection
        );
        float theta = waveA.w * dot(waveDirection, restXZ) - angularRate * wrappedTime + waveB.z;
        float amplitude = waveA.z
          * material_WaveStrength
          * material_WavesEnabled
          * macroAmplitudeScale;
        float sine = sin(theta);
        float cosine = cos(theta);
        vec2 bitangentXZ = safeNormalize2(bitangentWS.xz, vec2(0.0, 1.0));
        float slope = amplitude * waveA.w * cosine * shoreDamping;
        displacement += amplitude * sine * shoreDamping;
        tangentSlope += slope * dot(waveDirection, tangentXZ);
        bitangentSlope += slope * dot(waveDirection, bitangentXZ);
      }

      VertexShader = vert;
      FragmentShader = frag;

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
        float authoredDepth = localMap.b * material_LocalMapDecode.y;
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        float shoreDamping = smoothstep(0.0, max(material_ShoreDampingWidth, 0.0001), signedDistance);
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42)},
          flowSpeed
        );
        vec2 flowDirection = safeNormalize2(flowXZ, vec2(-0.36, -0.9329523));
        float macroFlowAlignment = flowWeight * ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.macroFlowAlignment)};
        float macroAmplitudeScale = mix(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillMacroAmplitudeScale)},
          1.0,
          flowWeight
        );
        float waveRateScale = mix(
          0.82,
          1.0 + saturate(flowSpeed / ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed)}) * 0.28,
          flowWeight
        );
        float elapsedTime = surfaceTime();
        float waveOffset = 0.0;
        float tangentSlope = 0.0;
        float bitangentSlope = 0.0;
${waveApplyStatements(waveCount)}
        vec3 computedMacroNormalWS = normalize(
          computedBaseNormalWS
            - computedBaseTangentWS * tangentSlope
            - computedBaseBitangentWS * bitangentSlope
        );
        vec3 displacedWorldPosition = baseWorldPosition.xyz + computedBaseNormalWS * waveOffset;
        vec4 localPosition = attr.POSITION + vec4(attr.NORMAL * waveOffset, 0.0);
        vec4 computedClipPosition = renderer_MVPMat * localPosition;
        gl_Position = computedClipPosition;
        output.worldPosition = displacedWorldPosition;
        output.baseNormalWS = computedBaseNormalWS;
        output.macroNormalWS = computedMacroNormalWS;
        output.tangentWS = computedBaseTangentWS;
        output.atlasUv = computedAtlasUv;
        output.baseSurfaceHeight = baseWorldPosition.y;
        output.waveOffset = waveOffset;
        output.surfaceEyeDepth = -(camera_ViewMat * vec4(displacedWorldPosition, 1.0)).z;
        output.shoreDamping = shoreDamping;
        output.clipPosition = computedClipPosition;
        return output;
      }

      void frag(Varyings input) {
        float elapsedTime = surfaceTime();
        vec4 localMap = texture2D(material_LocalMapTexture, input.atlasUv);
        vec2 flowXZ = (localMap.rg * 2.0 - 1.0) * material_LocalMapDecode.x;
        float authoredDepth = max(localMap.b * material_LocalMapDecode.y, 0.0);
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
        float coverage = smoothstep(-0.08, 0.08, signedDistance);
${opticalDepthCalculation(useSceneDepth)}
        opticalDepth = min(opticalDepth, max(material_MaximumSurfaceOpticalDistance, 0.0));
        float depthRatio = saturate(opticalDepth / max(material_LocalMapDecode.y, 0.0001));
        float flowSpeed = length(flowXZ);
        float flowWeight = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42)},
          flowSpeed
        );
        vec2 stillWaterDirection = vec2(-0.36, -0.9329523);
        vec2 flowDirection = safeNormalize2(
          mix(stillWaterDirection, safeNormalize2(flowXZ, stillWaterDirection), flowWeight * ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.flowingDirectionWeight)}),
          stillWaterDirection
        );
        vec3 baseWorldPosition = input.worldPosition - input.baseNormalWS * input.waveOffset;
${flowSurfaceLayerStatements(quality)}
        float detailStrength = max(
          material_MicroNormalStrength,
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.minimumNormalStrength)}
        ) * material_MicroNormalsEnabled * mix(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillMicroNormalScale)},
          1.0,
          flowWeight
        );
        vec3 worldDetailSlope = vec3(flowSurface.x, 0.0, flowSurface.y);
        vec3 tangentDetailSlope = worldDetailSlope
          - input.macroNormalWS * dot(worldDetailSlope, input.macroNormalWS);
        vec3 surfaceNormalWS = safeNormalize3(
          input.macroNormalWS + tangentDetailSlope * detailStrength,
          input.macroNormalWS
        );
        vec3 viewDirection = safeNormalize3(camera_Position - input.worldPosition, input.baseNormalWS);
        float normalFacing = step(0.0, dot(surfaceNormalWS, viewDirection)) * 2.0 - 1.0;
        surfaceNormalWS *= normalFacing;
        float normalDotView = saturate(dot(surfaceNormalWS, viewDirection));
        float indexOfRefraction = clamp(material_IndexOfRefraction, 1.0, 4.0);
        float fresnelRatio = (1.0 - indexOfRefraction) / (1.0 + indexOfRefraction);
        float fresnelF0 = fresnelRatio * fresnelRatio;
        float fresnel = fresnelF0
          + (1.0 - fresnelF0)
            * pow(1.0 - normalDotView, ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.fresnelPower)});
        float effectiveFresnel = material_OpticsCalibrationMode > 1.5 ? 0.0 : fresnel;
        vec3 lightDirection = normalize(vec3(-0.32, 0.86, 0.39));
        vec3 halfDirection = safeNormalize3(viewDirection + lightDirection, lightDirection);
        float normalDotLight = saturate(dot(surfaceNormalWS, lightDirection));
        float normalDotHalf = saturate(dot(surfaceNormalWS, halfDirection));
        float broadSpecular = pow(
          normalDotHalf,
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.broadSpecularPower)}
        ) * normalDotLight;
        float tightSpecular = pow(
          normalDotHalf,
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.tightSpecularPower)}
        ) * normalDotLight;
        float shoreEnvelope = 1.0 - smoothstep(
          0.0,
          max(
            material_ShoreDampingWidth * ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamWidthScale)},
            0.0001
          ),
          max(signedDistance, 0.0)
        );
        float foamNoise = saturate(flowSurface.z * 0.62 + flowSurface.w * 0.38);
        float foamBreakup = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamNoiseStart)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamNoiseEnd)},
          foamNoise + (1.0 - abs(flowSurface.z - flowSurface.w)) * 0.08
        );
        float shoreFoam = shoreEnvelope * foamBreakup;
        float macroSlope = 1.0 - saturate(dot(input.baseNormalWS, input.macroNormalWS));
        float crestFoam = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.crestFoamStart)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.crestFoamEnd)},
          macroSlope + max(input.waveOffset, 0.0) * 0.22
        ) * smoothstep(0.49, 0.78, foamNoise);
        float currentFoam = smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamSpeedStart)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamSpeedEnd)},
          flowSpeed
        ) * smoothstep(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamNoiseStart)},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamNoiseEnd)},
          flowSurface.w
        ) * input.shoreDamping;
${wakeFoamStatements(quality)}
        vec2 localFoamMaskDelta = abs(
          input.worldPosition.xz - material_LocalFoamMaskCenterHalfSize.xy
        ) - material_LocalFoamMaskCenterHalfSize.zw;
        float localFoamMaskSignedDistance = max(localFoamMaskDelta.x, localFoamMaskDelta.y);
        // The local mask is a real foam feature, not an independent invisible
        // refraction kill switch. Disabling the master foam feature therefore
        // disables both its visible contribution and its refraction suppression.
        float localFoamMask = material_LocalFoamMaskEnabled * material_FoamEnabled * (
          1.0 - smoothstep(
            -max(material_LocalFoamMaskFeather, 0.0001),
            max(material_LocalFoamMaskFeather, 0.0001),
            localFoamMaskSignedDistance
          )
        );
        float foamMotionScale = mix(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillFoamScale)},
          1.0,
          flowWeight
        );
        float proceduralFoam = saturate(
          max(max(shoreFoam, crestFoam * 0.68 + currentFoam * 0.32), wakeFoam)
        ) * material_FoamIntensity * foamMotionScale;
        float foam = saturate(max(proceduralFoam, localFoamMask)) * material_FoamEnabled;

        float depthColorMix = 1.0 - exp(-opticalDepth * 0.72);
        vec3 volumeColor = mix(material_ShallowColor.rgb, material_DeepColor.rgb, depthColorMix);
        float clarity = saturate(material_Clarity);
        // Clarity remains an explicit legacy art multiplier. At clarity=1 the
        // physical profile coefficient is used directly; the opaque endpoint
        // preserves the authored heightfield baseline.
        vec3 absorption = mix(
          vec3(0.52, 0.24, 0.12),
          max(material_AbsorptionCoefficient, vec3(0.0)),
          clarity
        );
        vec3 transmittance = exp(-absorption * opticalDepth);
        vec3 waterColor = volumeColor * mix(0.78, 1.05, transmittance.g);
        float profileScatteringWeight = 1.0 - exp(
          -max(material_ScatteringCoefficient, 0.0) * opticalDepth
        );
        vec3 profileScattering = max(material_ScatteringColor, vec3(0.0)) * profileScatteringWeight;
        float legacyScatteringWeight = 1.0 - exp(
          -${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.legacyScatteringCoefficient)} * opticalDepth
        );
        vec3 legacyScattering = vec3(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.legacyScatteringColor[0])},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.legacyScatteringColor[1])},
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.legacyScatteringColor[2])}
        ) * legacyScatteringWeight;
        waterColor = max(waterColor + profileScattering - legacyScattering, vec3(0.0));
        vec3 softFoamColor = mix(volumeColor * 1.18, material_FoamColor.rgb, 0.78);
        float foamTint = smoothstep(0.02, 0.78, foam);
        vec3 centeredOpaqueColor = waterColor;
        vec3 displacedOpaqueColor = waterColor;
        vec3 refractedSceneColor = waterColor;
        vec2 refractionUvDelta = vec2(0.0);
        float refractionDepthContinuity = 1.0;
        float refractionSampleValidity = 0.0;
        float refractionDepthWeight = 0.0;
        float refractionShoreWeight = 0.0;
        float refractionAmount = 0.0;
${sceneColorRefraction(quality)}
${surfaceReflectionStatements(quality)}
        if (material_OpticsCalibrationMode > 0.5) {
          // Calibration bypasses artistic tint/partial mixing, sun glints, and foam.
          vec3 referenceSourceColor = clamp(refractedSceneColor, vec3(0.0), vec3(65504.0));
          vec3 referenceReflectionColor = clamp(reflectionColor, vec3(0.0), vec3(65504.0));
          vec3 referenceTransmittance = exp(
            -max(material_AbsorptionCoefficient, vec3(0.0)) * opticalDepth
          );
          vec3 referenceTransmittedColor = clamp(
            referenceSourceColor * referenceTransmittance + profileScattering,
            vec3(0.0),
            vec3(65504.0)
          );
          vec3 referenceSurfaceColor = clamp(
            referenceTransmittedColor * (1.0 - effectiveFresnel)
              + referenceReflectionColor * (effectiveFresnel * reflectionIntensity),
            vec3(0.0),
            vec3(65504.0)
          );
          waterColor = referenceSurfaceColor;
        } else {
          float sparkleMask = mix(0.72, 1.28, flowSurface.w);
          waterColor += vec3(0.34, 0.42, 0.45) * broadSpecular * 0.24 * reflectionIntensity;
          waterColor += vec3(1.0, 0.96, 0.84) * tightSpecular * sparkleMask * 0.62 * reflectionIntensity;
          waterColor = mix(waterColor, softFoamColor, foamTint);
        }

        float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clarity) * opticalDepth);
        float alpha = material_Alpha * mix(0.18, 0.94, absorptionAlpha);
        alpha += effectiveFresnel * (1.0 - alpha) * 0.48;
        alpha += foamTint * 0.3 * (1.0 - step(0.5, material_OpticsCalibrationMode));
        alpha = clamp(
          alpha,
          0.0,
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumAlpha)}
        ) * coverage;

        // C and A are retained independently so framebuffer analysis can prove
        // whether the legacy transparent path applies the opaque background twice.
        vec3 shaderCompositedColor = waterColor;
        float surfaceAlpha = alpha;
        vec3 fragmentColor = shaderCompositedColor;
        float fragmentAlpha = surfaceAlpha;
        if (material_DebugMode > ${HeightfieldWaterDebugMode.Final + 0.5}) {
          if (material_DebugMode < ${HeightfieldWaterDebugMode.BaseHeight + 0.5}) {
            fragmentColor = vec3(fract(abs(input.baseSurfaceHeight) * 0.1));
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.BaseNormal + 0.5}) {
            fragmentColor = normalize(input.baseNormalWS) * 0.5 + 0.5;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.SignedDistance + 0.5}) {
            fragmentColor = signedDistance >= 0.0
              ? vec3(0.1, clamp(signedDistance / max(material_LocalMapDecode.z, 0.001), 0.0, 1.0), 1.0)
              : vec3(1.0, 0.1, 0.1);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.Depth + 0.5}) {
            fragmentColor = vec3(depthRatio);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.Flow + 0.5}) {
            fragmentColor = vec3(flowDirection * 0.5 + 0.5, clamp(length(flowXZ), 0.0, 1.0));
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.WaveDisplacement + 0.5}) {
            float normalizedWave = input.waveOffset / max(material_MaxVerticalDisplacement, 0.0001) * 0.5 + 0.5;
            fragmentColor = vec3(normalizedWave, 0.2, 1.0 - normalizedWave);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.CenteredOpaqueColor + 0.5}) {
            fragmentColor = centeredOpaqueColor;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.DisplacedOpaqueColor + 0.5}) {
            fragmentColor = displacedOpaqueColor;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.RefractionUvDelta + 0.5}) {
            // Signed UV delta: neutral is 0.5 in RG; +/- 1/64 screen maps to [0, 1].
            fragmentColor = vec3(
              clamp(refractionUvDelta * 32.0 + 0.5, vec2(0.0), vec2(1.0)),
              0.5
            );
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.OpticalDepth + 0.5}) {
            fragmentColor = vec3(depthRatio);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.DepthContinuity + 0.5}) {
            fragmentColor = vec3(refractionDepthContinuity);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.SampleValidity + 0.5}) {
            fragmentColor = vec3(refractionSampleValidity);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.Fresnel + 0.5}) {
            fragmentColor = vec3(effectiveFresnel);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.ShaderCompositedColor + 0.5}) {
            fragmentColor = shaderCompositedColor;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.SurfaceAlpha + 0.5}) {
            fragmentColor = vec3(surfaceAlpha);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.ReflectionSource + 0.5}) {
            fragmentColor = reflectionSourceDebug;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.PlanarUv + 0.5}) {
            fragmentColor = vec3(clamp(planarReflectionUvDebug, vec2(0.0), vec2(1.0)), 0.5);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.ClipSide + 0.5}) {
            fragmentColor = vec3(planarClipSideDebug);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.RefractionAmount + 0.5}) {
            fragmentColor = vec3(refractionAmount);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.RefractionGates + 0.5}) {
            // R/G/B isolate the depth, shore, and Beer-Lambert transmission gates.
            fragmentColor = vec3(refractionDepthWeight, refractionShoreWeight, transmittance.g);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.ReflectionColor + 0.5}) {
            fragmentColor = reflectionColor;
          } else {
            fragmentColor = vec3(normalDotView);
          }
          // Debug outputs are diagnostic values, not another alpha-composited water layer.
          fragmentAlpha = 1.0;
        }
        if (material_CompositionMode > ${HeightfieldWaterCompositionMode.LegacyAlpha + 0.5}) {
          if (coverage <= 0.001) discard;
          // Precomposed-replace writes complete C. Blend is disabled by the
          // matching material render-state binding, so B is not consumed again.
          fragmentAlpha = 1.0;
        }
        gl_FragColor = vec4(fragmentColor, fragmentAlpha);
      }
    }
  }
}`;
}

export const heightfieldWaterLowShaderSource = createHeightfieldWaterShaderSource(WaterQualityTier.Low, 2);
export const heightfieldWaterMediumShaderSource = createHeightfieldWaterShaderSource(WaterQualityTier.Medium, 6);
export const heightfieldWaterHighShaderSource = createHeightfieldWaterShaderSource(WaterQualityTier.High, 12);

function shaderSourceForQuality(quality: WaterQualityTier): string {
  switch (quality) {
    case WaterQualityTier.Low:
      return heightfieldWaterLowShaderSource;
    case WaterQualityTier.Medium:
      return heightfieldWaterMediumShaderSource;
    case WaterQualityTier.High:
      return heightfieldWaterHighShaderSource;
  }
}

function expectedWaveCount(quality: WaterQualityTier): number {
  switch (quality) {
    case WaterQualityTier.Low:
      return 2;
    case WaterQualityTier.Medium:
      return 6;
    case WaterQualityTier.High:
      return 12;
  }
}

function bindWaves(material: Material, waveSet: CompiledWaterWaveSet, slotCount: number): void {
  const packed = waveSet.packedShaderData.toTypedArray();
  for (let index = 0; index < slotCount; index++) {
    const offset = index * WATER_WAVE_PACKED_FLOATS_PER_WAVE;
    if (index >= waveSet.activeWaveCount) {
      material.shaderData.setVector4(`${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index}`, ZERO_WAVE);
      material.shaderData.setVector4(`${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index}`, ZERO_WAVE);
      continue;
    }
    material.shaderData.setVector4(
      `${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix}${index}`,
      new Vector4(packed[offset], packed[offset + 1], packed[offset + 2], packed[offset + 3])
    );
    material.shaderData.setVector4(
      `${HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix}${index}`,
      new Vector4(packed[offset + 4], packed[offset + 5], packed[offset + 6], packed[offset + 7])
    );
  }
}

export function updateHeightfieldWaterMaterial(
  state: HeightfieldWaterMaterialState,
  config: HeightfieldWaterMaterialConfig,
  atlas: HeightfieldWaterLocalMapAtlas
): void {
  const shaderData = state.material.shaderData;
  shaderData.setColor(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.shallowColor,
    new Color(config.shallowColor[0], config.shallowColor[1], config.shallowColor[2], config.shallowColor[3])
  );
  shaderData.setColor(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.deepColor,
    new Color(config.deepColor[0], config.deepColor[1], config.deepColor[2], config.deepColor[3])
  );
  shaderData.setColor(HEIGHTFIELD_WATER_SHADER_PROPERTY.foamColor, new Color(0.91, 0.98, 1, 1));
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.alpha, config.opacity);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.clarity, 0.7);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.timeScale, HEIGHTFIELD_WATER_WAVE_TIME_SCALE);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.waveStrength, config.waveStrength);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.microNormalStrength, config.microNormalStrength);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.foamIntensity, 0.82);
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.shoreDampingWidth, config.shoreFoamWidth);
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapDecode,
    new Vector4(atlas.flowDecodeScale, atlas.maxDepth, atlas.signedDistanceRange, 0)
  );
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapWorldToUv,
    new Vector4(atlas.worldToUv[0], atlas.worldToUv[1], atlas.worldToUv[2], atlas.worldToUv[3])
  );
}

/**
 * Applies the complete P1 contract through one stable caller-owned adapter/readback.
 * The material quality remains authoritative; Experimental can resolve only through a High material.
 */
export function setHeightfieldWaterSurfaceOpticsBinding(
  state: HeightfieldWaterMaterialState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const cachedBinding = state.surfaceOpticsBinding;
  cachedBinding.tier = resolveHeightfieldOpticsTier(state.quality, binding.tier);
  cachedBinding.opticalProfile = binding.opticalProfile;
  cachedBinding.refractionEnabled = binding.refractionEnabled;
  cachedBinding.reflection = binding.reflection;
  cachedBinding.reflectionSampling = binding.reflectionSampling;
  cachedBinding.debugView = binding.debugView;
  return applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

/** Legacy profile setter retained as a thin aggregate-binding adapter. */
export function setHeightfieldWaterOpticalProfile(
  state: HeightfieldWaterMaterialState,
  profile: WaterOpticalProfile
): void {
  state.surfaceOpticsBinding.opticalProfile = profile;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

/**
 * Applies one validated Probe/Planar binding and returns the exact shader-facing sampling state.
 * Missing or malformed resources are cleared and resolve to the legacy analytic sky.
 */
export function setHeightfieldWaterReflectionBinding(
  state: HeightfieldWaterMaterialState,
  binding?: Readonly<WaterReflectionBinding>,
  config: HeightfieldWaterReflectionSamplingConfig = DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS
): Readonly<HeightfieldWaterReflectionSamplingReadback> {
  state.surfaceOpticsBinding.reflection = binding;
  state.surfaceOpticsBinding.reflectionSampling = config;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
  return state.heightfieldReflectionReadback;
}

export function createHeightfieldWaterMaterial(
  engine: Engine,
  quality: WaterQualityTier,
  waveSet: CompiledWaterWaveSet,
  config: HeightfieldWaterMaterialConfig,
  atlas: HeightfieldWaterLocalMapAtlas,
  localMapTexture: Texture2D
): HeightfieldWaterMaterialState {
  const slotCount = expectedWaveCount(quality);
  if (waveSet.shaderWaveCount > slotCount) {
    throw new Error(
      `Heightfield water ${quality} shader has ${slotCount} wave slots, received ${waveSet.shaderWaveCount}.`
    );
  }
  const shaderName = `AIWorld/HeightfieldWater${quality[0].toUpperCase()}${quality.slice(1)}${slotCount}`;
  const shader = Shader.find(shaderName) ?? Shader.create(shaderSourceForQuality(quality));
  const material = new Material(engine, shader);
  material.shaderData.setTexture(HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapTexture, localMapTexture);
  material.shaderData.setTexture(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTexture,
    getHeightfieldWaterSurfaceTexture(engine)
  );
  material.shaderData.setFloat(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.maxVerticalDisplacement,
    waveSet.maxVerticalDisplacement
  );
  bindWaves(material, waveSet, slotCount);
  const surfaceOpticsBinding: MutableHeightfieldWaterSurfaceOpticsBinding = {
    tier: quality === WaterQualityTier.High ? "high" : "medium",
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: true,
    reflection: undefined,
    reflectionSampling: DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
    debugView: WaterOpticsDebugView.Final
  };
  const state = Object.freeze({
    material,
    quality,
    waveSet,
    ...createWaterSurfaceOpticsBindingState(),
    surfaceOpticsBinding: Object.seal(surfaceOpticsBinding),
    heightfieldReflectionReadback: createHeightfieldReflectionReadback(quality),
    opticsCalibrationReadback: createHeightfieldWaterOpticsCalibrationReadback()
  });
  updateHeightfieldWaterMaterial(state, config, atlas);
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
  setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.LegacyAlpha);
  setHeightfieldWaterOpticsCalibrationMode(state, HeightfieldWaterOpticsCalibrationMode.None);
  setHeightfieldWaterDepthWriteEnabled(state, false);
  setHeightfieldWaterFeatureFlags(state, { waves: true, microNormals: true, foam: true });
  setHeightfieldWaterLocalFoamMask(state, DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK);
  setHeightfieldWaterSurfaceTimeOverride(state);
  return state;
}

export function setHeightfieldWaterDebugMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterDebugMode
): void {
  state.surfaceOpticsBinding.debugView = mode;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

export function setHeightfieldWaterRefractionEnabled(state: HeightfieldWaterMaterialState, enabled: boolean): void {
  state.surfaceOpticsBinding.refractionEnabled = enabled;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

export function setHeightfieldWaterCompositionMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterCompositionMode
): void {
  const shaderData = state.material.shaderData;
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.compositionMode, mode);
  shaderData.setInt(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled,
    mode === HeightfieldWaterCompositionMode.LegacyAlpha ? 1 : 0
  );
}

export function setHeightfieldWaterOpticsCalibrationMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterOpticsCalibrationMode
): Readonly<HeightfieldWaterOpticsCalibrationReadback> {
  const resolvedMode =
    mode === HeightfieldWaterOpticsCalibrationMode.CpuReference ||
    mode === HeightfieldWaterOpticsCalibrationMode.PureTransmission
      ? mode
      : HeightfieldWaterOpticsCalibrationMode.None;
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.opticsCalibrationMode, resolvedMode);
  const readback = state.opticsCalibrationReadback as MutableHeightfieldWaterOpticsCalibrationReadback;
  readback.mode = resolvedMode;
  readback.referenceCompositionEnabled = resolvedMode !== HeightfieldWaterOpticsCalibrationMode.None;
  readback.effectiveFresnelOverride =
    resolvedMode === HeightfieldWaterOpticsCalibrationMode.PureTransmission ? 0 : undefined;
  return state.opticsCalibrationReadback;
}

export function setHeightfieldWaterDepthWriteEnabled(state: HeightfieldWaterMaterialState, enabled: boolean): void {
  state.material.shaderData.setInt(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, enabled ? 1 : 0);
}

export function setHeightfieldWaterFeatureFlags(
  state: HeightfieldWaterMaterialState,
  flags: HeightfieldWaterFeatureFlags
): void {
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.wavesEnabled, flags.waves ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.microNormalsEnabled, flags.microNormals ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.foamEnabled, flags.foam ? 1 : 0);
}

export function setHeightfieldWaterLocalFoamMask(
  state: HeightfieldWaterMaterialState,
  mask: Readonly<HeightfieldWaterLocalFoamMask>
): void {
  const values = [mask.centerXZ[0], mask.centerXZ[1], mask.halfSizeXZ[0], mask.halfSizeXZ[1], mask.featherMeters];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Heightfield local foam mask values must be finite.");
  }
  if (mask.halfSizeXZ[0] < 0 || mask.halfSizeXZ[1] < 0 || mask.featherMeters < 0) {
    throw new RangeError("Heightfield local foam mask extents and feather must be non-negative.");
  }
  const shaderData = state.material.shaderData;
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskEnabled, mask.enabled ? 1 : 0);
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskCenterHalfSize,
    new Vector4(mask.centerXZ[0], mask.centerXZ[1], mask.halfSizeXZ[0], mask.halfSizeXZ[1])
  );
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskFeather, mask.featherMeters);
}

export function setHeightfieldWaterSurfaceTimeOverride(
  state: HeightfieldWaterMaterialState,
  elapsedTime?: number
): void {
  const value = elapsedTime === undefined ? -1 : Math.max(0, elapsedTime);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTimeOverride, value);
}
