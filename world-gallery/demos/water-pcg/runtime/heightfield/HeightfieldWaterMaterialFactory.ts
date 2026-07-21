/** Dedicated heightfield-water shader: curved base surface, packed local map, waves, optics, and debug views. */
import { Engine, Material, Shader, Texture2D } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import { WATER_WAVE_PACKED_FLOATS_PER_WAVE } from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterMaterialConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { HeightfieldWaterDebugMode } from "./HeightfieldWaterRuntimeEnums";
import {
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TUNING,
  HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS,
  HEIGHTFIELD_WATER_WAVE_TIME_SCALE
} from "./constants";
import { getHeightfieldWaterSurfaceTexture } from "./HeightfieldWaterSurfaceTextureFactory";
import type { HeightfieldWaterFeatureFlags, HeightfieldWaterMaterialState } from "./types";

const ZERO_WAVE = new Vector4(0, 0, 0, 0);

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
  return `        vec3 baseNormalVS = normalize(mat3(camera_ViewMat) * input.baseNormalWS);
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * surfaceNormalWS);
        vec2 refractionNormalDelta = surfaceNormalVS.xy - baseNormalVS.xy;
        float refractionDepthWeight = smoothstep(
          ${glsl(tuning.refractionDepthStart)},
          ${glsl(tuning.refractionDepthEnd)},
          opticalDepth
        );
        vec2 displacedScreenUv = screenUv
          + refractionNormalDelta * ${glsl(uvScale)} * refractionDepthWeight;
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
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDepth);
        float refractionSampleValidity = refractionScreenInterior
          * refractionDepthContinuity
          * refractedGeometryBehindSurface;
        vec3 centeredSceneColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedSceneColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        vec3 refractedSceneColor = mix(
          centeredSceneColor,
          displacedSceneColor,
          refractionSampleValidity
        );
        vec3 refractionTint = mix(vec3(0.82, 0.95, 0.97), vec3(0.63, 0.84, 0.88), depthRatio);
        float refractionAmount = ${glsl(refractionMix)}
          * clarity
          * transmittance.g
          * refractionDepthWeight
          * smoothstep(0.12, 0.72, input.shoreDamping)
          * (1.0 - foamTint * ${glsl(tuning.refractionFoamSuppression)});
        waterColor = mix(waterColor, refractedSceneColor * refractionTint, refractionAmount);
`;
}

/** Creates a fixed 2/6/12-wave variant without dynamic shader loops. */
export function createHeightfieldWaterShaderSource(quality: WaterQualityTier, waveCount: number): string {
  const useSceneDepth = quality !== WaterQualityTier.Low;
  const qualityName = quality[0].toUpperCase() + quality.slice(1);
  return `
Shader "AIWorld/HeightfieldWater${qualityName}${waveCount}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState { WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
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
      float material_WavesEnabled;
      float material_MicroNormalsEnabled;
      float material_FoamEnabled;
      float material_MaxVerticalDisplacement;
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
        float fresnel = ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.fresnelF0)}
          + (1.0 - ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.fresnelF0)})
            * pow(1.0 - normalDotView, ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.fresnelPower)});
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
        float foamMotionScale = mix(
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.stillFoamScale)},
          1.0,
          flowWeight
        );
        float foam = saturate(
          max(max(shoreFoam, crestFoam * 0.68 + currentFoam * 0.32), wakeFoam)
        ) * material_FoamIntensity * material_FoamEnabled * foamMotionScale;

        float depthColorMix = 1.0 - exp(-opticalDepth * 0.72);
        vec3 volumeColor = mix(material_ShallowColor.rgb, material_DeepColor.rgb, depthColorMix);
        float clarity = saturate(material_Clarity);
        vec3 absorption = mix(vec3(0.52, 0.24, 0.12), vec3(0.21, 0.085, 0.04), clarity);
        vec3 transmittance = exp(-absorption * opticalDepth);
        vec3 waterColor = volumeColor * mix(0.78, 1.05, transmittance.g);
        vec3 softFoamColor = mix(volumeColor * 1.18, material_FoamColor.rgb, 0.78);
        float foamTint = smoothstep(0.02, 0.78, foam);
${sceneColorRefraction(quality)}
        vec3 skyReflection = mix(
          vec3(0.075, 0.16, 0.21),
          vec3(0.32, 0.48, 0.57),
          saturate(surfaceNormalWS.y * 0.5 + 0.5)
        );
        waterColor = mix(waterColor, skyReflection, fresnel * 0.72);
        float sparkleMask = mix(0.72, 1.28, flowSurface.w);
        waterColor += vec3(0.34, 0.42, 0.45) * broadSpecular * 0.24;
        waterColor += vec3(1.0, 0.96, 0.84) * tightSpecular * sparkleMask * 0.62;
        waterColor = mix(waterColor, softFoamColor, foamTint);

        float absorptionAlpha = 1.0 - exp(-mix(0.48, 0.13, clarity) * opticalDepth);
        float alpha = material_Alpha * mix(0.18, 0.94, absorptionAlpha);
        alpha += fresnel * (1.0 - alpha) * 0.48;
        alpha += foamTint * 0.3;
        alpha = clamp(
          alpha,
          0.0,
          ${glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.maximumAlpha)}
        ) * coverage;

        if (material_DebugMode > ${HeightfieldWaterDebugMode.Final + 0.5}) {
          if (material_DebugMode < ${HeightfieldWaterDebugMode.BaseNormal - 0.5}) {
            waterColor = vec3(fract(abs(input.baseSurfaceHeight) * 0.1));
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.SignedDistance - 0.5}) {
            waterColor = normalize(input.baseNormalWS) * 0.5 + 0.5;
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.Depth - 0.5}) {
            waterColor = signedDistance >= 0.0
              ? vec3(0.1, clamp(signedDistance / max(material_LocalMapDecode.z, 0.001), 0.0, 1.0), 1.0)
              : vec3(1.0, 0.1, 0.1);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.Flow - 0.5}) {
            waterColor = vec3(depthRatio);
          } else if (material_DebugMode < ${HeightfieldWaterDebugMode.WaveDisplacement - 0.5}) {
            waterColor = vec3(flowDirection * 0.5 + 0.5, clamp(length(flowXZ), 0.0, 1.0));
          } else {
            float normalizedWave = input.waveOffset / max(material_MaxVerticalDisplacement, 0.0001) * 0.5 + 0.5;
            waterColor = vec3(normalizedWave, 0.2, 1.0 - normalizedWave);
          }
          alpha = 0.92;
        }
        gl_FragColor = vec4(waterColor, alpha);
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
  const state = Object.freeze({ material, quality, waveSet });
  updateHeightfieldWaterMaterial(state, config, atlas);
  setHeightfieldWaterDebugMode(state, HeightfieldWaterDebugMode.Final);
  setHeightfieldWaterFeatureFlags(state, { waves: true, microNormals: true, foam: true });
  setHeightfieldWaterSurfaceTimeOverride(state);
  return state;
}

export function setHeightfieldWaterDebugMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterDebugMode
): void {
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.debugMode, mode);
}

export function setHeightfieldWaterFeatureFlags(
  state: HeightfieldWaterMaterialState,
  flags: HeightfieldWaterFeatureFlags
): void {
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.wavesEnabled, flags.waves ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.microNormalsEnabled, flags.microNormals ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.foamEnabled, flags.foam ? 1 : 0);
}

export function setHeightfieldWaterSurfaceTimeOverride(
  state: HeightfieldWaterMaterialState,
  elapsedTime?: number
): void {
  const value = elapsedTime === undefined ? -1 : Math.max(0, elapsedTime);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTimeOverride, value);
}
