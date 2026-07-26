/** Fixed-variant Gerstner material creation and binding for the Ocean preview. */
import { Engine, Material, Shader, type Texture2D } from "@galacean/engine-core";
import { Color, Vector2, Vector4 } from "@galacean/engine-math";
import {
  WATER_WAVE_EPSILON,
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_TWO_PI
} from "../../authoring/wave/constants/WaterWaveLimits";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { WATER_WAVE_SHADER_PROPERTY, WATER_WAVE_SHADER_TUNING } from "./constants/WaterWaveShaderConstants";
import { WaterWaveShaderVariant } from "./enums/WaterWaveShaderVariant";
import type {
  WaterFoamDetailTextureBinding,
  WaterSurfaceDetailConfig,
  WaterWaveMaterialConfig,
  WaterWaveMaterialState
} from "./WaterWaveRuntimeTypes";
import type { OceanNearshoreDebugView } from "../ocean/OceanNearshoreShaderTypes";
import { createOceanNearshoreWaveModifierGlsl } from "../ocean/OceanNearshoreWaveEvaluator";
import { createOceanAnalyticWhitecapGlsl } from "../ocean/OceanAnalyticWhitecapEvaluator";
import {
  WaterFoamDebugView,
  type WaterTemporalFoamBinding
} from "../interaction/WaterFoamTypes";
import { getWaterSurfaceDualSlopeTexture } from "./WaterSurfaceDetailTextureFactory";
import { getWaterFoamDetailTexture } from "./WaterFoamDetailTextureFactory";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../optics/WaterOpticalProfile";
import {
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import {
  WaterOpticsDebugView,
  type ResolvedWaterOpticsTier,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";

const WATER_WAVE_SHADER_NAME: Readonly<Record<WaterWaveShaderVariant, string>> = {
  [WaterWaveShaderVariant.None]: "AIWorld/WaterGerstnerNone",
  [WaterWaveShaderVariant.Low]: "AIWorld/WaterGerstner2",
  [WaterWaveShaderVariant.Medium]: "AIWorld/WaterGerstner6",
  [WaterWaveShaderVariant.High]: "AIWorld/WaterGerstner12"
};

const ZERO_WAVE_UNIFORM = new Vector4(0, 0, 0, 0);
const DEFAULT_SURFACE_DETAIL_WIND = Object.freeze([1, 0] as const);

interface NullableTextureShaderData {
  setTexture(propertyName: string, value: Texture2D | null): void;
}

/**
 * Validates one optional caller-owned foam detail binding before a runtime
 * changes any state.
 */
export function validateWaterFoamDetailTextureBinding(
  binding: Readonly<WaterFoamDetailTextureBinding> | undefined
): void {
  if (!binding) return;
  const texture = binding.texture;
  if (
    binding.ownership !== "borrowed" ||
    !Number.isFinite(binding.resourceBytes) ||
    binding.resourceBytes <= 0 ||
    !texture ||
    texture.destroyed ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    texture.width <= 0 ||
    texture.height <= 0
  ) {
    throw new Error(
      "Water foam detail texture binding is unavailable or has an invalid resource budget."
    );
  }
}

function resolveFoamDetailTexture(
  engine: Engine,
  config: Readonly<WaterWaveMaterialConfig>,
  enabled: boolean
): Texture2D | null {
  validateWaterFoamDetailTextureBinding(config.foamDetail);
  if (!enabled) return null;
  const binding = config.foamDetail;
  if (!binding) return getWaterFoamDetailTexture(engine);
  return binding.texture;
}

function glsl(value: number, digits = 8): string {
  return value.toFixed(digits);
}

function resolveVariant(activeWaveCount: number): WaterWaveShaderVariant {
  if (activeWaveCount === WaterWaveShaderVariant.None) return WaterWaveShaderVariant.None;
  if (activeWaveCount === WaterWaveShaderVariant.Low) return WaterWaveShaderVariant.Low;
  if (activeWaveCount === WaterWaveShaderVariant.Medium) return WaterWaveShaderVariant.Medium;
  if (activeWaveCount === WaterWaveShaderVariant.High) return WaterWaveShaderVariant.High;
  throw new Error(`Unsupported fixed water-wave shader count: ${activeWaveCount}.`);
}

function waveUniformDeclarations(waveCount: number): string {
  let declarations = "";
  for (let index = 0; index < waveCount; index++) {
    declarations += `      vec4 ${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index};\n`;
    declarations += `      vec4 ${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index};\n`;
  }
  return declarations;
}

function waveApplyStatements(waveCount: number): string {
  let statements = "";
  for (let index = 0; index < waveCount; index++) {
    statements += `        applyGerstnerWave(
      ${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index},
      ${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index},
      restXZ, elapsedTime,
      nearshoreDirectionBlend, nearshorePhaseSpeedScale,
      nearshoreWaveNumberScale, nearshoreAmplitudeScale,
      nearshoreHorizontalAmplitudeScale, nearshoreShoreNormal,
      displacedPosition.xyz, derivativeX, derivativeZ, crestAccumulation);\n`;
  }
  return statements;
}

function surfaceDetailLayerCount(variant: WaterWaveShaderVariant): 0 | 1 | 2 | 3 {
  if (variant === WaterWaveShaderVariant.None) return 0;
  if (variant === WaterWaveShaderVariant.Low) return 1;
  if (variant === WaterWaveShaderVariant.Medium) return 2;
  return 3;
}

function surfaceDetailStatements(variant: WaterWaveShaderVariant): string {
  const layerCount = surfaceDetailLayerCount(variant);
  if (layerCount === 0) return "";
  const tuning = WATER_WAVE_SHADER_TUNING;
  let statements = `        vec2 surfaceDetailSlope = vec2(0.0);
        if (material_SurfaceDetailEnabled > 0.5) {
          float surfaceDetailTime = mod(
            material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x,
            ${glsl(tuning.surfaceDetailTimePeriod, 1)}
          );
          vec2 surfaceDetailWind = material_SurfaceDetailWind;
          float surfaceDetailWindLength = length(surfaceDetailWind);
          surfaceDetailWind = surfaceDetailWindLength > 0.000001
            ? surfaceDetailWind / surfaceDetailWindLength
            : vec2(1.0, 0.0);
          vec2 surfaceDetailCrossWind = vec2(-surfaceDetailWind.y, surfaceDetailWind.x);
`;
  let weightSum = 0;
  const terms: string[] = [];
  for (let index = 0; index < layerCount; index++) {
    const scale = tuning.surfaceDetailLayerScales[index];
    const rate = tuning.surfaceDetailLayerRates[index];
    const weight = tuning.surfaceDetailLayerWeights[index];
    const crossWind = tuning.surfaceDetailCrossWind[index];
    const slopeExpression =
      index % 3 === 0
        ? `surfaceDetailSample${index}.rg`
        : index % 3 === 1
          ? `surfaceDetailSample${index}.ba`
          : `(surfaceDetailSample${index}.rg * 0.58 + surfaceDetailSample${index}.ba * 0.42)`;
    weightSum += weight;
    statements += `          vec2 surfaceDetailUv${index} = vec2(
            dot(input.worldPosition.xz, surfaceDetailWind),
            dot(input.worldPosition.xz, surfaceDetailCrossWind)
          ) * material_SurfaceDetailScale * ${glsl(scale)}
            + vec2(
              surfaceDetailTime * material_SurfaceDetailSpeed * ${glsl(rate)},
              ${glsl(crossWind)}
            );
          vec4 surfaceDetailSample${index} =
            texture2D(material_SurfaceDetailTexture, surfaceDetailUv${index});
          vec2 surfaceDetailEncodedSlope${index} =
            ${slopeExpression} * 2.0 - 1.0;
          vec2 surfaceDetailWorldSlope${index} =
            surfaceDetailWind * surfaceDetailEncodedSlope${index}.x
            + surfaceDetailCrossWind * surfaceDetailEncodedSlope${index}.y;
`;
    terms.push(`surfaceDetailWorldSlope${index} * ${glsl(weight)}`);
  }
  statements += `          surfaceDetailSlope = (${terms.join(" + ")}) / ${glsl(weightSum)};
        }
        normal = normalize(
          normal + vec3(surfaceDetailSlope.x, 0.0, surfaceDetailSlope.y)
            * material_SurfaceDetailStrength
            * material_SurfaceDetailEnabled
        );`;
  return statements;
}

function nearshoreSamplingStatements(): string {
  return `        vec2 nearshoreUv =
          input.worldPosition.xz * material_NearshoreWorldToUv.xy
          + material_NearshoreWorldToUv.zw;
        float nearshoreInside =
          step(0.0, nearshoreUv.x) * step(nearshoreUv.x, 1.0)
          * step(0.0, nearshoreUv.y) * step(nearshoreUv.y, 1.0);
        float nearshoreOutsideDeep = 1.0;
        float nearshoreWet = 1.0;
        float nearshoreStaticWet = 1.0;
        float nearshoreDynamicOccupancy = 0.0;
        float nearshoreBreaker = 0.0;
        float nearshoreThinFilm = 0.0;
        float nearshoreWetness = 0.0;
        float nearshoreDepthNormalized = 1.0;
        float nearshoreShoreDistance = material_NearshoreDecode.z;
        if (material_NearshoreEnabled > 0.5) {
          if (nearshoreInside > 0.5) {
            vec4 nearshoreStatic = texture2D(material_NearshoreTexture, nearshoreUv);
            nearshoreDepthNormalized = nearshoreStatic.b;
            nearshoreShoreDistance =
              ((nearshoreStatic.a * 255.0 - 128.0) / 127.0)
              * material_NearshoreDecode.z;
            nearshoreStaticWet = step(material_NearshoreDecode.w, nearshoreStatic.a);
            if (material_NearshoreStateEnabled > 0.5) {
              vec4 nearshoreState = texture2D(material_NearshoreStateTexture, nearshoreUv);
              nearshoreDynamicOccupancy = nearshoreState.g;
              nearshoreBreaker =
                nearshoreState.r * material_NearshoreBreakerEnabled;
              nearshoreWetness = texture2D(material_NearshoreWetnessTexture, nearshoreUv).r;
            }
            nearshoreThinFilm = (1.0 - nearshoreStaticWet) * nearshoreDynamicOccupancy;
            nearshoreWet = max(
              nearshoreStaticWet,
              step(
                material_NearshoreStateDecode.w,
                nearshoreDynamicOccupancy
              )
            );
            if (nearshoreWet < 0.5) discard;
          } else {
            if (nearshoreUv.x < 0.0) {
              nearshoreOutsideDeep *= material_NearshoreOutsidePolicy.x;
            }
            if (nearshoreUv.x > 1.0) {
              nearshoreOutsideDeep *= material_NearshoreOutsidePolicy.y;
            }
            if (nearshoreUv.y < 0.0) {
              nearshoreOutsideDeep *= material_NearshoreOutsidePolicy.z;
            }
            if (nearshoreUv.y > 1.0) {
              nearshoreOutsideDeep *= material_NearshoreOutsidePolicy.w;
            }
            nearshoreWet = nearshoreOutsideDeep;
            if (nearshoreOutsideDeep < 0.5) discard;
          }
        }`;
}

function nearshoreDebugApplication(): string {
  return `        if (material_NearshoreEnabled > 0.5 && material_NearshoreDebugView > 0.5) {
          if (material_NearshoreDebugView < 1.5) {
            waterColor = nearshoreInside > 0.5
              ? mix(vec3(0.93, 0.72, 0.18), vec3(0.03, 0.18, 0.72), nearshoreDepthNormalized)
              : vec3(0.01, 0.08, 0.32);
          } else if (material_NearshoreDebugView < 2.5) {
            float shoreDebug = clamp(
              nearshoreShoreDistance / max(material_NearshoreDecode.z, 0.000001) * 0.5 + 0.5,
              0.0,
              1.0
            );
            waterColor = nearshoreInside > 0.5
              ? vec3(1.0 - shoreDebug, shoreDebug, 0.08)
              : vec3(0.01, 0.08, 0.32);
          } else if (material_NearshoreDebugView < 3.5) {
            waterColor = vec3(nearshoreWet);
          } else if (material_NearshoreDebugView < 4.5) {
            waterColor = nearshoreInside > 0.5
              ? vec3(0.18, 0.72, 0.32)
              : (nearshoreOutsideDeep > 0.5
                ? vec3(0.08, 0.28, 0.92)
                : vec3(0.92, 0.22, 0.08));
          } else if (material_NearshoreDebugView < 5.5) {
            waterColor = vec3(nearshoreBreaker, nearshoreBreaker * 0.34, 0.0);
          } else if (material_NearshoreDebugView < 6.5) {
            waterColor = vec3(nearshoreThinFilm, nearshoreThinFilm * 0.7, 0.1);
          } else {
            waterColor = vec3(nearshoreWetness);
          }
        }`;
}

function foamSamplingStatements(): string {
  return `        vec2 temporalFoamUv =
          (input.worldPosition.xz - material_TemporalFoamRegion.xy)
          * material_TemporalFoamRegion.zw;
        float temporalFoamInside =
          step(0.0, temporalFoamUv.x) * step(temporalFoamUv.x, 1.0)
          * step(0.0, temporalFoamUv.y) * step(temporalFoamUv.y, 1.0);
        float temporalFoam = texture2D(
          material_TemporalFoamTexture,
          clamp(temporalFoamUv, vec2(0.0), vec2(1.0))
        ).r * temporalFoamInside * material_TemporalFoamEnabled;
        float debugTemporalFoam = temporalFoam;
        if (
          material_FoamDebugView > 0.5
          && temporalFoamInside > 0.5
        ) {
          vec2 debugTexel = material_TemporalFoamTexelSize;
          debugTemporalFoam = max(
            debugTemporalFoam,
            max(
              texture2D(
                material_TemporalFoamTexture,
                clamp(temporalFoamUv + vec2(debugTexel.x, 0.0), vec2(0.0), vec2(1.0))
              ).r,
              texture2D(
                material_TemporalFoamTexture,
                clamp(temporalFoamUv - vec2(debugTexel.x, 0.0), vec2(0.0), vec2(1.0))
              ).r
            )
          );
          debugTemporalFoam = max(
            debugTemporalFoam,
            max(
              texture2D(
                material_TemporalFoamTexture,
                clamp(temporalFoamUv + vec2(0.0, debugTexel.y), vec2(0.0), vec2(1.0))
              ).r,
              texture2D(
                material_TemporalFoamTexture,
                clamp(temporalFoamUv - vec2(0.0, debugTexel.y), vec2(0.0), vec2(1.0))
              ).r
            )
          );
          debugTemporalFoam = smoothstep(
            ${glsl(1 / 255)},
            0.22,
            debugTemporalFoam
          );
        }
        float analyticWhitecap =
          input.whitecap * material_AnalyticWhitecapEnabled;
        float foamCoarseBreakup = 0.5 + 0.5
          * sin(dot(input.worldPosition.xz, vec2(0.43, -0.31)) + 1.7)
          * sin(dot(input.worldPosition.xz, vec2(0.17, 0.59)) - 0.8);
        float foamFineBreakup = 0.5 + 0.5
          * sin(dot(input.worldPosition.xz, vec2(1.37, 0.91)) + 2.4);
        float foamCoverage = clamp(
          0.64
            + foamCoarseBreakup * 0.28
            + foamFineBreakup * 0.08,
          0.52,
          1.0
        );
        float analyticFoam = smoothstep(
          0.2,
          0.66,
          analyticWhitecap
            * material_CrestIntensity
            * foamCoverage
        );
        float boundedFoam = smoothstep(
          0.18,
          0.68,
          temporalFoam
            * material_CrestIntensity
            * foamCoverage
        );
        float macroFoam = pow(
          max(analyticFoam, boundedFoam),
          1.18
        );
        vec3 foamDetail = vec3(1.0);
        if (material_FoamDetailEnabled > 0.5) {
          float foamDetailTime = mod(
            material_SurfaceTimeOverride >= 0.0
              ? material_SurfaceTimeOverride
              : scene_ElapsedTime.x,
            ${glsl(WATER_WAVE_SHADER_TUNING.surfaceDetailTimePeriod, 1)}
          );
          vec2 foamDetailUvA =
            input.worldPosition.xz * vec2(0.082, 0.109)
            + vec2(foamDetailTime * 0.006, -foamDetailTime * 0.004);
          vec2 foamDetailUvB =
            input.worldPosition.zx * vec2(-0.173, 0.139)
            + vec2(-foamDetailTime * 0.009, foamDetailTime * 0.005);
          vec3 foamDetailA =
            texture2D(material_FoamDetailTexture, foamDetailUvA).rgb;
          vec3 foamDetailB =
            texture2D(material_FoamDetailTexture, foamDetailUvB).rgb;
          foamDetail = max(foamDetailA, foamDetailB * 0.82);
        }
        float thickFoamWeight =
          smoothstep(0.7, 0.96, macroFoam);
        float mediumFoamWeight = clamp(
          smoothstep(0.32, 0.8, macroFoam)
            - thickFoamWeight * 0.65,
          0.0,
          1.0
        );
        float lightFoamWeight = clamp(
          smoothstep(0.08, 0.48, macroFoam)
            - mediumFoamWeight * 0.45
            - thickFoamWeight * 0.25,
          0.0,
          1.0
        );
        vec3 foamLayerWeights = vec3(
          thickFoamWeight,
          mediumFoamWeight,
          lightFoamWeight
        );
        float foamWeightSum = max(
          dot(foamLayerWeights, vec3(1.0)),
          0.0001
        );
        float microFoamCoverage = smoothstep(
          0.28,
          0.72,
          clamp(
            dot(foamDetail, foamLayerWeights) / foamWeightSum,
            0.0,
            1.0
          )
        );
        float retainedFoamCoverage = max(
          microFoamCoverage,
          clamp(
            max(
              boundedFoam
                * ${glsl(WATER_WAVE_SHADER_TUNING.boundedFoamDetailRetention)},
              thickFoamWeight
                * ${glsl(WATER_WAVE_SHADER_TUNING.denseFoamDetailRetention)}
                + mediumFoamWeight
                  * ${glsl(WATER_WAVE_SHADER_TUNING.mediumFoamDetailRetention)}
            ),
            0.0,
            1.0
          )
        );
        float waterFoam = smoothstep(
          0.025,
          0.7,
          macroFoam * mix(0.008, 1.0, retainedFoamCoverage)
        );
        normal = normalize(mix(
          normal,
          vec3(0.0, 1.0, 0.0),
          waterFoam * 0.14
        ));
        normal = normalize(mix(
          normal,
          vec3(0.0, 1.0, 0.0),
          nearshoreThinFilm * 0.82
        ));`;
}

function foamDebugApplication(): string {
  return `        if (material_TemporalFoamEnabled > 0.5 && material_FoamDebugView > 0.5) {
          waterColor = vec3(debugTemporalFoam);
        }`;
}

function nearshoreVertexSamplingStatements(): string {
  return `        float nearshoreWaveInfluence = 0.0;
        float nearshoreDirectionBlend = 0.0;
        float nearshorePhaseSpeedScale = 1.0;
        float nearshoreWaveNumberScale = 1.0;
        float nearshoreAmplitudeScale = 1.0;
        float nearshoreHorizontalAmplitudeScale = 1.0;
        float nearshoreShoreDamping = 1.0;
        float nearshoreBreakerTendency = 0.0;
        vec2 nearshoreShoreNormal = vec2(0.0);
        if (material_NearshoreEnabled > 0.5) {
          vec2 nearshoreVertexUv =
            restXZ * material_NearshoreWorldToUv.xy
            + material_NearshoreWorldToUv.zw;
          float nearshoreVertexInside =
            step(0.0, nearshoreVertexUv.x) * step(nearshoreVertexUv.x, 1.0)
            * step(0.0, nearshoreVertexUv.y) * step(nearshoreVertexUv.y, 1.0);
          if (nearshoreVertexInside > 0.5) {
            vec4 nearshoreVertexStatic =
              texture2D(material_NearshoreTexture, nearshoreVertexUv);
            float nearshoreVertexStaticWet =
              step(material_NearshoreDecode.w, nearshoreVertexStatic.a);
            if (
              nearshoreVertexStaticWet > 0.5
              && material_NearshoreWaveEnabled > 0.5
            ) {
              float shoreNegativeX = decodeOceanNearshoreShoreDistance(
                texture2D(
                  material_NearshoreTexture,
                  nearshoreVertexUv - vec2(material_NearshoreGrid.x, 0.0)
                ).a
              );
              float shorePositiveX = decodeOceanNearshoreShoreDistance(
                texture2D(
                  material_NearshoreTexture,
                  nearshoreVertexUv + vec2(material_NearshoreGrid.x, 0.0)
                ).a
              );
              float shoreNegativeZ = decodeOceanNearshoreShoreDistance(
                texture2D(
                  material_NearshoreTexture,
                  nearshoreVertexUv - vec2(0.0, material_NearshoreGrid.y)
                ).a
              );
              float shorePositiveZ = decodeOceanNearshoreShoreDistance(
                texture2D(
                  material_NearshoreTexture,
                  nearshoreVertexUv + vec2(0.0, material_NearshoreGrid.y)
                ).a
              );
              vec2 shoreGradient = vec2(
                (shorePositiveX - shoreNegativeX)
                  / max(material_NearshoreGrid.z * 2.0, 0.000001),
                (shorePositiveZ - shoreNegativeZ)
                  / max(material_NearshoreGrid.w * 2.0, 0.000001)
              );
              nearshoreShoreNormal = length(shoreGradient) > 0.000001
                ? -normalize(shoreGradient)
                : vec2(0.0);
              resolveOceanNearshoreWaveModifier(
                nearshoreVertexStatic.b * material_NearshoreDecode.y,
                decodeOceanNearshoreShoreDistance(nearshoreVertexStatic.a),
                nearshoreShoreNormal,
                nearshoreWaveInfluence,
                nearshoreDirectionBlend,
                nearshorePhaseSpeedScale,
                nearshoreWaveNumberScale,
                nearshoreAmplitudeScale,
                nearshoreHorizontalAmplitudeScale,
                nearshoreShoreDamping,
                nearshoreBreakerTendency
              );
            } else if (material_NearshoreStateEnabled > 0.5) {
              vec4 nearshoreVertexState =
                texture2D(material_NearshoreStateTexture, nearshoreVertexUv);
              float nearshoreVertexOccupancy = smoothstep(
                0.08,
                0.92,
                nearshoreVertexState.g
              );
              if (nearshoreVertexOccupancy > 0.001) {
                float nearshoreFilmHeight = mix(
                  material_NearshoreStateDecode.x,
                  material_NearshoreStateDecode.y,
                  nearshoreVertexState.b
                );
                displacedPosition.y = mix(
                  displacedPosition.y,
                  nearshoreFilmHeight,
                  nearshoreVertexOccupancy
                );
                // The dry-side vertices still evaluate the same Ocean waves
                // until swash occupies them. Fading the displacement with the
                // continuous occupancy removes the one-triangle height jump
                // that previously read as crystalline spikes at the waterline.
                nearshoreAmplitudeScale *=
                  1.0 - nearshoreVertexOccupancy;
                nearshoreHorizontalAmplitudeScale *=
                  1.0 - nearshoreVertexOccupancy;
              }
            }
          }
        }`;
}

function waterSurfaceBrdfFunctions(): string {
  const tuning = WATER_WAVE_SHADER_TUNING;
  return `      float waterSurfaceSchlick(float f0, float f90, float dotLH) {
        return f0 + (f90 - f0) * pow(1.0 - clamp(dotLH, 0.0, 1.0), 5.0);
      }

      float waterSurfaceGgxDistribution(float alpha, float dotNH) {
        float alphaSquared = alpha * alpha;
        float denominator = dotNH * dotNH * (alphaSquared - 1.0) + 1.0;
        return 0.3183098861837907 * alphaSquared
          / max(denominator * denominator, ${glsl(tuning.brdfEpsilon)});
      }

      float waterSurfaceGgxSmithCorrelated(float alpha, float dotNL, float dotNV) {
        float alphaSquared = alpha * alpha;
        float gv = dotNL * sqrt(alphaSquared + (1.0 - alphaSquared) * dotNV * dotNV);
        float gl = dotNV * sqrt(alphaSquared + (1.0 - alphaSquared) * dotNL * dotNL);
        return 0.5 / max(gv + gl, ${glsl(tuning.brdfEpsilon)});
      }

      float waterSurfaceDirectSpecular(
        float f0,
        float perceptualRoughness,
        float dotNV,
        float dotNL,
        float dotNH,
        float dotLH
      ) {
        float alpha = perceptualRoughness * perceptualRoughness;
        float fresnel = waterSurfaceSchlick(f0, 1.0, dotLH);
        float distribution = waterSurfaceGgxDistribution(alpha, dotNH);
        float visibility = waterSurfaceGgxSmithCorrelated(alpha, dotNL, dotNV);
        return fresnel * distribution * visibility * dotNL * 3.141592653589793;
      }`;
}

function defaultOpticsTierForVariant(variant: WaterWaveShaderVariant): ResolvedWaterOpticsTier | undefined {
  if (variant === WaterWaveShaderVariant.Medium) return "medium";
  if (variant === WaterWaveShaderVariant.High) return "high";
  return undefined;
}

function resolveOpticsTier(
  variant: WaterWaveShaderVariant,
  requestedTier?: WaterOpticsTier
): ResolvedWaterOpticsTier | undefined {
  if (requestedTier) return requestedTier === "medium" ? "medium" : "high";
  return defaultOpticsTierForVariant(variant);
}

function shaderNameForVariant(
  variant: WaterWaveShaderVariant,
  opticsTier: ResolvedWaterOpticsTier | undefined
): string {
  const baseName = WATER_WAVE_SHADER_NAME[variant];
  return opticsTier === defaultOpticsTierForVariant(variant)
    ? baseName
    : `${baseName}Optics${opticsTier === "high" ? "High" : opticsTier === "medium" ? "Medium" : "Legacy"}`;
}

function sceneOpticsDeclarations(enabled: boolean): string {
  if (!enabled) return "";
  return `      vec4 camera_ProjectionParams;
      vec4 camera_DepthBufferParams;
      sampler2D camera_DepthTexture;
      sampler2D camera_OpaqueTexture;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumSurfaceOpticalDistance;
      float material_IndexOfRefraction;
      float material_RefractionStrength;
      float material_RefractionEnabled;`;
}

function sceneFogDeclarations(): string {
  return `#if SCENE_FOG_MODE != 0
      vec4 scene_FogColor;
      vec4 scene_FogParams;
#endif`;
}

function sceneFogApplication(): string {
  return `#if SCENE_FOG_MODE != 0
        float fogDepth = length(input.positionVS);
        #if SCENE_FOG_MODE == 1
          float fogIntensity = clamp(fogDepth * scene_FogParams.x + scene_FogParams.y, 0.0, 1.0);
        #elif SCENE_FOG_MODE == 2
          float fogIntensity = clamp(exp2(-fogDepth * scene_FogParams.z), 0.0, 1.0);
        #elif SCENE_FOG_MODE == 3
          float fogFactor = fogDepth * scene_FogParams.w;
          float fogIntensity = clamp(exp2(-fogFactor * fogFactor), 0.0, 1.0);
        #endif
        finalWaterColor.rgb = mix(scene_FogColor.rgb, finalWaterColor.rgb, fogIntensity);
#endif`;
}

function sceneDepthFunction(enabled: boolean): string {
  if (!enabled) return "";
  return `      float remapDepthBufferEyeDepth(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }`;
}

function fresnelCalculation(enabled: boolean): string {
  if (!enabled) {
    return `        float fresnelF0 = 0.02;
        float reflectionF90 = max(1.0 - perceptualRoughness, fresnelF0);
        float fresnel = fresnelF0
          + (reflectionF90 - fresnelF0) * pow(
            1.0 - facing,
            ${glsl(WATER_WAVE_SHADER_TUNING.fresnelPower, 1)}
          );`;
  }
  return `        float indexOfRefraction = clamp(material_IndexOfRefraction, 1.0, 4.0);
        float fresnelRatio = (1.0 - indexOfRefraction) / (1.0 + indexOfRefraction);
        float fresnelF0 = fresnelRatio * fresnelRatio;
        float reflectionF90 = max(1.0 - perceptualRoughness, fresnelF0);
        float fresnel = fresnelF0
          + (reflectionF90 - fresnelF0) * pow(
            1.0 - facing,
            ${glsl(WATER_WAVE_SHADER_TUNING.fresnelPower, 1)}
          );`;
}

function sceneColorRefraction(opticsTier: ResolvedWaterOpticsTier | undefined): string {
  if (!opticsTier) return "";
  const tuning = WATER_WAVE_SHADER_TUNING;
  const uvScale = opticsTier === "high" ? tuning.highRefractionUvScale : tuning.mediumRefractionUvScale;
  const refractionMix = opticsTier === "high" ? tuning.highRefractionMix : tuning.mediumRefractionMix;
  return `        vec2 screenUv = input.clipPosition.xy / input.clipPosition.w * 0.5 + 0.5;
        float sceneEyeDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, screenUv).r);
        float maximumOpticalDistance = max(material_MaximumSurfaceOpticalDistance, 0.000001);
        float opticalDistance = min(max(sceneEyeDepth - input.surfaceEyeDepth, 0.0), maximumOpticalDistance);
        float opticalDepthWeight = smoothstep(
          ${glsl(tuning.refractionDepthStart)},
          ${glsl(tuning.refractionDepthEnd)},
          opticalDistance
        );
        vec3 restNormalVS = normalize(mat3(camera_ViewMat) * vec3(0.0, 1.0, 0.0));
        vec3 surfaceNormalVS = normalize(mat3(camera_ViewMat) * normal);
        vec2 displacedScreenUv = screenUv
          + (surfaceNormalVS.xy - restNormalVS.xy)
            * ${glsl(uvScale)}
            * max(material_RefractionStrength, 0.0)
            * opticalDepthWeight;
        float refractionScreenInterior = step(${glsl(tuning.refractionEdgeInset)}, displacedScreenUv.x)
          * step(displacedScreenUv.x, ${glsl(1 - tuning.refractionEdgeInset)})
          * step(${glsl(tuning.refractionEdgeInset)}, displacedScreenUv.y)
          * step(displacedScreenUv.y, ${glsl(1 - tuning.refractionEdgeInset)});
        vec2 refractedScreenUv = clamp(
          displacedScreenUv,
          vec2(${glsl(tuning.refractionEdgeInset)}),
          vec2(${glsl(1 - tuning.refractionEdgeInset)})
        );
        float refractedSceneEyeDepth = remapDepthBufferEyeDepth(
          texture2D(camera_DepthTexture, refractedScreenUv).r
        );
        float refractedOpticalDistance = max(refractedSceneEyeDepth - input.surfaceEyeDepth, 0.0);
        float refractionDepthTolerance = max(
          ${glsl(tuning.refractionDepthToleranceMinimum)},
          opticalDistance * ${glsl(tuning.refractionDepthToleranceScale)}
        );
        float refractionDepthContinuity = 1.0 - smoothstep(
          refractionDepthTolerance,
          refractionDepthTolerance * 3.0 + 0.2,
          abs(refractedSceneEyeDepth - sceneEyeDepth)
        );
        float refractedGeometryBehindSurface = smoothstep(0.03, 0.22, refractedOpticalDistance);
        float refractionSampleValidity = refractionScreenInterior
          * refractionDepthContinuity
          * refractedGeometryBehindSurface;
        vec3 centeredOpaqueColor = texture2D(camera_OpaqueTexture, screenUv).rgb;
        vec3 displacedOpaqueColor = texture2D(camera_OpaqueTexture, refractedScreenUv).rgb;
        vec3 refractedSceneColor = mix(centeredOpaqueColor, displacedOpaqueColor, refractionSampleValidity);
        vec3 absorption = max(material_AbsorptionCoefficient, vec3(0.0));
        vec3 transmittance = exp(-absorption * opticalDistance);
        float scatteringWeight = 1.0 - exp(-max(material_ScatteringCoefficient, 0.0) * opticalDistance);
        vec3 transmittedColor = refractedSceneColor * transmittance
          + max(material_ScatteringColor, vec3(0.0)) * scatteringWeight;
        float refractionAmount = ${glsl(refractionMix)}
          * step(0.5, material_RefractionEnabled)
          * opticalDepthWeight
          * (1.0 - fresnel)
          * (1.0 - nearshoreThinFilm * 0.82)
          * (1.0 - waterFoam * 0.88);
        waterColor = mix(waterColor, transmittedColor, clamp(refractionAmount, 0.0, 1.0));`;
}

export function createWaterWaveShaderSource(
  variant: WaterWaveShaderVariant,
  requestedOpticsTier?: WaterOpticsTier
): string {
  const waveCount = Number(variant);
  const tuning = WATER_WAVE_SHADER_TUNING;
  const opticsTier = resolveOpticsTier(variant, requestedOpticsTier);
  const shaderName = shaderNameForVariant(variant, opticsTier);
  const sceneRefractionEnabled = opticsTier !== undefined;
  return `
Shader "${shaderName}" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState customBlendState {
        Enabled = ${sceneRefractionEnabled ? "false" : "true"};
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState customDepthState {
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState customRasterState { CullMode = CullMode.Off; }
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_ModelMat;
      mat4 camera_VPMat;
      mat4 camera_ViewMat;
      vec3 camera_Position;
      vec4 scene_ElapsedTime;
      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      vec4 material_BaseColor;
      vec4 material_DeepColor;
      float material_Alpha;
      float material_WaterLevel;
      float material_TimeScale;
      float material_CrestIntensity;
      float material_ReflectionIntensity;
      float material_ReflectionIntensityMultiplier;
      float material_Roughness;
      float material_ReflectionSource;
      float material_SurfaceTimeOverride;
      float material_MaxVerticalDisplacement;
      float renderer_OceanLod;
      float renderer_OceanLodDebug;
      samplerCube material_ReflectionCubeTexture;
      sampler2D material_PlanarReflectionTexture;
      mat4 material_PlanarReflectionVP;
      vec4 material_PlanarReflectionTextureSize;
      vec4 material_PlanarReflectionSampling;
      vec4 material_PlanarReflectionFade;
      float material_PlanarReflectionRoughnessFootprint;
      sampler2D material_SurfaceDetailTexture;
      float material_SurfaceDetailEnabled;
      float material_SurfaceDetailStrength;
      float material_SurfaceDetailScale;
      float material_SurfaceDetailSpeed;
      vec2 material_SurfaceDetailWind;
      sampler2D material_NearshoreTexture;
      float material_NearshoreEnabled;
      vec4 material_NearshoreWorldToUv;
      vec4 material_NearshoreDecode;
      vec4 material_NearshoreGrid;
      vec4 material_NearshoreOutsidePolicy;
      float material_NearshoreDebugView;
      float material_NearshoreWaveEnabled;
      sampler2D material_NearshoreStateTexture;
      sampler2D material_NearshoreWetnessTexture;
      float material_NearshoreStateEnabled;
      float material_NearshoreBreakerEnabled;
      vec4 material_NearshoreStateDecode;
      sampler2D material_TemporalFoamTexture;
      float material_TemporalFoamEnabled;
      sampler2D material_FoamDetailTexture;
      float material_FoamDetailEnabled;
      vec4 material_TemporalFoamRegion;
      vec2 material_TemporalFoamTexelSize;
      float material_FoamDebugView;
      float material_AnalyticWhitecapEnabled;
${sceneFogDeclarations()}
${sceneOpticsDeclarations(sceneRefractionEnabled)}
${waveUniformDeclarations(waveCount)}
      struct Attributes { vec4 POSITION; };
      struct Varyings {
        vec3 worldPosition;
        vec3 worldNormal;
        vec3 positionVS;
        float crest;
        float whitecap;
${sceneRefractionEnabled ? "        vec4 clipPosition;\n        float surfaceEyeDepth;" : ""}
      };

      void applyGerstnerWave(
        vec4 waveA,
        vec4 waveB,
        vec2 restXZ,
        float elapsedTime,
        float nearshoreDirectionBlend,
        float nearshorePhaseSpeedScale,
        float nearshoreWaveNumberScale,
        float nearshoreAmplitudeScale,
        float nearshoreHorizontalAmplitudeScale,
        vec2 nearshoreShoreNormal,
        inout vec3 displaced,
        inout vec3 derivativeX,
        inout vec3 derivativeZ,
        inout float crest
      ) {
        vec2 waveDirection = waveA.xy;
        if (nearshoreDirectionBlend > 0.0) {
          vec2 refractedDirection = mix(
            waveA.xy,
            nearshoreShoreNormal,
            nearshoreDirectionBlend
          );
          waveDirection = length(refractedDirection) > ${glsl(WATER_WAVE_EPSILON)}
            ? normalize(refractedDirection)
            : waveA.xy;
        }
        float waveNumber = waveA.w * nearshoreWaveNumberScale;
        float angularRate =
          waveB.x * material_TimeScale * nearshorePhaseSpeedScale;
        float wavePeriod = ${glsl(WATER_WAVE_TWO_PI)} / max(abs(angularRate), ${glsl(WATER_WAVE_EPSILON)});
        float wrappedTime = mod(elapsedTime, wavePeriod);
        float theta =
          waveNumber * dot(waveDirection, restXZ)
          - angularRate * wrappedTime
          + waveB.z;
        float sine = sin(theta);
        float cosine = cos(theta);
        float amplitude = waveA.z * nearshoreAmplitudeScale;
        float horizontalAmplitude =
          waveB.y * nearshoreHorizontalAmplitudeScale;
        float horizontalDerivative =
          horizontalAmplitude * waveNumber * sine;
        float verticalDerivative = amplitude * waveNumber * cosine;
        displaced.xz += waveDirection * horizontalAmplitude * cosine;
        displaced.y += amplitude * sine;
        derivativeX -= vec3(
          horizontalDerivative * waveDirection.x * waveDirection.x,
          -verticalDerivative * waveDirection.x,
          horizontalDerivative * waveDirection.x * waveDirection.y
        );
        derivativeZ -= vec3(
          horizontalDerivative * waveDirection.y * waveDirection.x,
          -verticalDerivative * waveDirection.y,
          horizontalDerivative * waveDirection.y * waveDirection.y
        );
        crest += max(sine, 0.0) * amplitude;
      }

      float decodeOceanNearshoreShoreDistance(float encoded) {
        return ((encoded * 255.0 - 128.0) / 127.0)
          * material_NearshoreDecode.z;
      }

${createOceanNearshoreWaveModifierGlsl()}
${createOceanAnalyticWhitecapGlsl()}
${sceneDepthFunction(sceneRefractionEnabled)}
${waterSurfaceBrdfFunctions()}

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        vec4 displacedPosition = renderer_ModelMat * attr.POSITION;
        vec2 restXZ = displacedPosition.xz;
        displacedPosition.y += material_WaterLevel;
        float elapsedTime = material_SurfaceTimeOverride >= 0.0 ? material_SurfaceTimeOverride : scene_ElapsedTime.x;
        vec3 derivativeX = vec3(1.0, 0.0, 0.0);
        vec3 derivativeZ = vec3(0.0, 0.0, 1.0);
        float crestAccumulation = 0.0;
${nearshoreVertexSamplingStatements()}
${waveApplyStatements(waveCount)}
        vec3 surfaceNormal = normalize(cross(derivativeZ, derivativeX));
        output.worldPosition = displacedPosition.xyz;
        output.worldNormal = surfaceNormal;
        output.positionVS = (camera_ViewMat * displacedPosition).xyz;
        output.crest = clamp(
          crestAccumulation / max(material_MaxVerticalDisplacement, 0.000001),
          0.0,
          1.0
        );
        float horizontalJacobianDeterminant =
          derivativeX.x * derivativeZ.z - derivativeX.z * derivativeZ.x;
        output.whitecap = evaluateOceanAnalyticWhitecap(
          horizontalJacobianDeterminant,
          output.crest
        );
        gl_Position = camera_VPMat * displacedPosition;
${
  sceneRefractionEnabled
    ? "        output.clipPosition = gl_Position;\n        output.surfaceEyeDepth = -output.positionVS.z;"
    : ""
}
        return output;
      }

      void frag(Varyings input) {
        vec3 normal = normalize(input.worldNormal);
${surfaceDetailStatements(variant)}
${nearshoreSamplingStatements()}
${foamSamplingStatements()}
        vec3 viewDirection = normalize(camera_Position - input.worldPosition);
        vec3 sunlightDirectionVector = -scene_SunlightDirection;
        float sunlightDirectionLengthSquared = dot(sunlightDirectionVector, sunlightDirectionVector);
        float sunlightAvailable = step(${glsl(tuning.brdfEpsilon)}, sunlightDirectionLengthSquared);
        vec3 lightDirection = sunlightDirectionVector
          / max(sqrt(sunlightDirectionLengthSquared), ${glsl(tuning.brdfEpsilon)});
        vec3 sunlightColor = max(scene_SunlightColor.rgb, vec3(0.0)) * sunlightAvailable;
        vec3 halfDirectionVector = viewDirection + lightDirection;
        vec3 halfDirection = halfDirectionVector
          / max(length(halfDirectionVector), ${glsl(tuning.brdfEpsilon)});
        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float perceptualRoughness = clamp(
          material_Roughness + waterFoam * 0.42,
          ${glsl(tuning.minimumPerceptualRoughness)},
          1.0
        );
${fresnelCalculation(sceneRefractionEnabled)}
        float normalDotLight = clamp(dot(normal, lightDirection), 0.0, 1.0);
        float normalDotHalf = clamp(dot(normal, halfDirection), 0.0, 1.0);
        float lightDotHalf = clamp(dot(lightDirection, halfDirection), 0.0, 1.0);
        float directSpecular = waterSurfaceDirectSpecular(
          fresnelF0,
          perceptualRoughness,
          facing,
          normalDotLight,
          normalDotHalf,
          lightDotHalf
        );
        float diffuse = ${glsl(tuning.diffuseFloor)} + max(normal.y, 0.0) * ${glsl(tuning.diffuseNormalWeight)};
        float slope = clamp((1.0 - normal.y) * ${glsl(tuning.slopeContrast, 1)}, 0.0, 1.0);
        vec2 lightHorizontal = lightDirection.xz;
        vec2 lightHorizontalDirection =
          lightHorizontal / max(length(lightHorizontal), ${glsl(tuning.brdfEpsilon)});
        float slopeDirection = dot(normal.xz, lightHorizontalDirection) * sunlightAvailable;
        vec3 waterColor = mix(material_DeepColor.rgb, material_BaseColor.rgb, diffuse);
        waterColor *= 1.0 + slopeDirection * slope * ${glsl(tuning.slopeDirectionalStrength)};
        float nearshoreShallowWeight =
          nearshoreInside * nearshoreWet * (1.0 - nearshoreDepthNormalized);
        vec3 nearshoreShallowColor =
          material_BaseColor.rgb * 1.06 + vec3(0.018, 0.03, 0.022);
        waterColor = mix(
          waterColor,
          nearshoreShallowColor,
          clamp(nearshoreShallowWeight * 0.38, 0.0, 0.38)
        );
${sceneColorRefraction(opticsTier)}
        float nearshoreDepthAlpha = mix(
          0.28,
          material_Alpha,
          smoothstep(0.015, 0.42, nearshoreDepthNormalized)
        );
        float openWaterAlpha = clamp(
          mix(
            material_Alpha,
            nearshoreDepthAlpha,
            nearshoreInside * nearshoreWet
          ) + waterFoam * 0.08,
          ${glsl(tuning.minimumAlpha)},
          ${glsl(tuning.maximumAlpha)}
        );
        float thinFilmCoverage = smoothstep(
          0.04,
          0.88,
          nearshoreThinFilm
        );
        float thinFilmAlpha = clamp(
          0.012
            + nearshoreDynamicOccupancy * 0.025
            + waterFoam * 0.08,
          0.012,
          0.12
        );
        float effectiveWaterAlpha = mix(
          openWaterAlpha,
          thinFilmAlpha,
          thinFilmCoverage
        );
${
  sceneRefractionEnabled
    ? `        vec3 centeredSurfaceBackground = texture2D(camera_OpaqueTexture, screenUv).rgb;
        float volumeOpticalCoverage = clamp(
          1.0 - transmittance.g + scatteringWeight,
          0.0,
          1.0
        );
        float volumeCompositionAlpha =
          effectiveWaterAlpha * volumeOpticalCoverage;
        waterColor = mix(
          centeredSurfaceBackground,
          waterColor,
          volumeCompositionAlpha
        );`
    : ""
}
        vec3 analyticHorizonColor =
          material_BaseColor.rgb * ${glsl(tuning.horizonColorScale)};
#if SCENE_FOG_MODE != 0
        analyticHorizonColor = mix(
          analyticHorizonColor,
          scene_FogColor.rgb * 0.86 + sunlightColor * 0.035,
          0.72
        );
#endif
        vec3 analyticSky = mix(
          material_DeepColor.rgb * 0.72,
          analyticHorizonColor,
          clamp(reflect(-viewDirection, normal).y * 0.5 + 0.5, 0.0, 1.0)
        );
        vec3 reflectionColor = analyticSky;
        if (material_ReflectionSource > 1.5) {
          vec4 reflectionClip = material_PlanarReflectionVP * vec4(input.worldPosition, 1.0);
          float minimumClipW = max(material_PlanarReflectionSampling.z, 0.000001);
          vec2 reflectionUv = reflectionClip.xy / max(abs(reflectionClip.w), minimumClipW) * 0.5 + 0.5;
          reflectionUv += normal.xz * material_PlanarReflectionSampling.x;
          vec2 clampedReflectionUv = clamp(reflectionUv, vec2(0.0), vec2(1.0));
          vec2 edgeDistanceTexels = min(clampedReflectionUv, vec2(1.0) - clampedReflectionUv)
            * max(material_PlanarReflectionTextureSize.xy, vec2(1.0));
          float edgeFade = smoothstep(
            0.0,
            max(material_PlanarReflectionSampling.y, 1.0),
            min(edgeDistanceTexels.x, edgeDistanceTexels.y)
          );
          float planeDistance = abs(camera_Position.y - material_WaterLevel);
          float planeDistanceFade = smoothstep(
            material_PlanarReflectionFade.x,
            max(material_PlanarReflectionFade.y, material_PlanarReflectionFade.x + 0.0001),
            planeDistance
          );
          float viewAngleFade = smoothstep(
            material_PlanarReflectionFade.z,
            max(material_PlanarReflectionFade.w, material_PlanarReflectionFade.z + 0.0001),
            facing
          );
          float uvInside = step(0.0, reflectionUv.x) * step(reflectionUv.x, 1.0)
            * step(0.0, reflectionUv.y) * step(reflectionUv.y, 1.0);
          float planarValidity = step(minimumClipW, reflectionClip.w)
            * uvInside
            * edgeFade
            * planeDistanceFade
            * viewAngleFade;
          vec3 planarColor = texture2D(material_PlanarReflectionTexture, clampedReflectionUv).rgb;
          if (material_PlanarReflectionSampling.w > 3.0) {
            vec2 filterOffset = material_PlanarReflectionTextureSize.zw
              * material_PlanarReflectionRoughnessFootprint
              * clamp(material_Roughness, 0.0, 1.0);
            planarColor = (
              planarColor
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv + vec2(filterOffset.x, 0.0), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv - vec2(filterOffset.x, 0.0), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv + vec2(0.0, filterOffset.y), vec2(0.0), vec2(1.0))).rgb
              + texture2D(material_PlanarReflectionTexture, clamp(clampedReflectionUv - vec2(0.0, filterOffset.y), vec2(0.0), vec2(1.0))).rgb
            ) * 0.2;
          }
          reflectionColor = mix(analyticSky, planarColor, planarValidity);
        } else if (material_ReflectionSource > 0.5) {
          reflectionColor = textureCube(material_ReflectionCubeTexture, reflect(-viewDirection, normal)).rgb;
        }
        waterColor = mix(
          waterColor,
          reflectionColor,
          clamp(
            fresnel
              * material_ReflectionIntensity
              * material_ReflectionIntensityMultiplier
              * (1.0 - nearshoreThinFilm * 0.82),
            0.0,
            1.0
          )
        );
        waterColor += sunlightColor
          * directSpecular
          * ${glsl(tuning.directSpecularStrength)}
          * (1.0 - nearshoreThinFilm * 0.72);
        waterColor = mix(
          waterColor,
          vec3(0.93, 0.91, 0.85),
          waterFoam * ${glsl(tuning.crestTintStrength)}
        );
        if (renderer_OceanLodDebug > 0.5) {
          vec3 lodColor = renderer_OceanLod < 0.5
            ? vec3(0.18, 0.92, 0.72)
            : (renderer_OceanLod < 1.5
              ? vec3(0.98, 0.74, 0.2)
              : (renderer_OceanLod < 2.5 ? vec3(0.96, 0.36, 0.24) : vec3(0.62, 0.36, 0.96)));
          waterColor = mix(waterColor, lodColor, 0.58);
        }
${nearshoreDebugApplication()}
${foamDebugApplication()}
        vec4 finalWaterColor = vec4(
          waterColor,
          ${
            sceneRefractionEnabled
              ? "1.0"
              : "effectiveWaterAlpha"
          }
        );
${sceneFogApplication()}
        gl_FragColor = finalWaterColor;
      }
    }
  }
}`;
}

function parseHexColor(hex: string, alpha: number): Color {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  if (!Number.isFinite(value) || normalized.length !== 6) return new Color(0.08, 0.5, 0.72, alpha);
  return new Color(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha);
}

interface ResolvedWaterSurfaceDetailConfig {
  readonly enabled: boolean;
  readonly strength: number;
  readonly scale: number;
  readonly speed: number;
  readonly windX: number;
  readonly windY: number;
}

function resolveSurfaceDetailConfig(
  config: Readonly<WaterSurfaceDetailConfig> | undefined,
  variant: WaterWaveShaderVariant
): Readonly<ResolvedWaterSurfaceDetailConfig> {
  if (!config || variant === WaterWaveShaderVariant.None) {
    return Object.freeze({
      enabled: false,
      strength: 0,
      scale: 1,
      speed: 0,
      windX: DEFAULT_SURFACE_DETAIL_WIND[0],
      windY: DEFAULT_SURFACE_DETAIL_WIND[1]
    });
  }
  const [windX, windY] = config.wind;
  if (
    !Number.isFinite(config.strength) ||
    !Number.isFinite(config.scale) ||
    !Number.isFinite(config.speed) ||
    !Number.isFinite(windX) ||
    !Number.isFinite(windY)
  ) {
    throw new Error("Water surface detail parameters must be finite.");
  }
  const strength = Math.min(4, Math.max(0, config.strength));
  const windLength = Math.hypot(windX, windY);
  return Object.freeze({
    enabled: strength > 0,
    strength,
    scale: Math.min(10, Math.max(0.001, config.scale)),
    speed: Math.min(10, Math.max(0, config.speed)),
    windX: windLength > WATER_WAVE_EPSILON ? windX / windLength : DEFAULT_SURFACE_DETAIL_WIND[0],
    windY: windLength > WATER_WAVE_EPSILON ? windY / windLength : DEFAULT_SURFACE_DETAIL_WIND[1]
  });
}

function bindWaterWaveMaterial(
  engine: Engine,
  material: Material,
  variant: WaterWaveShaderVariant,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): boolean {
  const tuning = WATER_WAVE_SHADER_TUNING;
  const baseColor = parseHexColor(config.baseColor, config.alpha);
  const deepColor = new Color(
    baseColor.r * tuning.deepColorScale,
    baseColor.g * tuning.deepColorScale,
    Math.min(1, baseColor.b * tuning.deepColorScale + tuning.deepColorBlueLift),
    config.alpha
  );
  material.shaderData.setColor(WATER_WAVE_SHADER_PROPERTY.baseColor, baseColor);
  material.shaderData.setColor(WATER_WAVE_SHADER_PROPERTY.deepColor, deepColor);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.alpha, config.alpha);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.waterLevel, config.waterLevel);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.timeScale, config.timeScale);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.crestIntensity, config.crestIntensity);
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.reflectionIntensityMultiplier,
    config.reflectionIntensity ?? tuning.fresnelStrength
  );
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.reflectionSource, 0);
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceTimeOverride,
    config.surfaceTimeOverride === undefined ? -1 : Math.max(0, config.surfaceTimeOverride)
  );
  const surfaceDetail = resolveSurfaceDetailConfig(config.surfaceDetail, variant);
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceDetailEnabled,
    surfaceDetail.enabled ? 1 : 0
  );
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.surfaceDetailStrength, surfaceDetail.strength);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.surfaceDetailScale, surfaceDetail.scale);
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.surfaceDetailSpeed, surfaceDetail.speed);
  material.shaderData.setVector2(
    WATER_WAVE_SHADER_PROPERTY.surfaceDetailWind,
    new Vector2(surfaceDetail.windX, surfaceDetail.windY)
  );
  const nullableTextureData = material.shaderData as unknown as NullableTextureShaderData;
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.surfaceDetailTexture,
    surfaceDetail.enabled
      ? getWaterSurfaceDualSlopeTexture(engine)
      : null
  );
  const nearshore = config.nearshore;
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreEnabled,
    nearshore ? 1 : 0
  );
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.nearshoreTexture,
    nearshore?.texture ?? null
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.nearshoreWorldToUv,
    nearshore
      ? new Vector4(...nearshore.worldToUv)
      : new Vector4(0, 0, 0, 0)
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.nearshoreDecode,
    nearshore ? new Vector4(...nearshore.decode) : new Vector4(1, 1, 1, 128.5 / 255)
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.nearshoreGrid,
    nearshore
      ? new Vector4(...nearshore.grid)
      : new Vector4(1, 1, 1, 1)
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.nearshoreOutsidePolicy,
    nearshore
      ? new Vector4(...nearshore.outsidePolicy)
      : new Vector4(1, 1, 1, 1)
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreDebugView,
    nearshore?.debugView ?? 0
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreWaveEnabled,
    nearshore?.waveEnabled === false ? 0 : nearshore ? 1 : 0
  );
  const nearshoreDynamic = nearshore?.dynamic;
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreStateEnabled,
    nearshoreDynamic ? 1 : 0
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreBreakerEnabled,
    nearshoreDynamic && config.nearshoreBreakerEnabled !== false ? 1 : 0
  );
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.nearshoreStateTexture,
    nearshoreDynamic?.stateTexture ?? null
  );
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.nearshoreWetnessTexture,
    nearshoreDynamic?.wetnessTexture ?? null
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.nearshoreStateDecode,
    nearshoreDynamic
      ? new Vector4(...nearshoreDynamic.decode)
      : new Vector4(0, 1, 1, 0.5)
  );
  const foam = config.foam;
  const foamDetailEnabled =
    foam !== undefined ||
    config.analyticWhitecapEnabled === true;
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.foamDetailTexture,
    resolveFoamDetailTexture(
      engine,
      config,
      foamDetailEnabled
    )
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDetailEnabled,
    foamDetailEnabled ? 1 : 0
  );
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamTexture,
    foam?.texture ?? null
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamEnabled,
    foam ? 1 : 0
  );
  material.shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamRegion,
    foam ? new Vector4(...foam.region) : new Vector4(0, 0, 1, 1)
  );
  material.shaderData.setVector2(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamTexelSize,
    foam ? new Vector2(...foam.texelSize) : new Vector2(1, 1)
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDebugView,
    foam?.debugView ?? WaterFoamDebugView.Final
  );
  material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.analyticWhitecapEnabled,
    config.analyticWhitecapEnabled === true ? 1 : 0
  );
  material.shaderData.setFloat(WATER_WAVE_SHADER_PROPERTY.maxVerticalDisplacement, waveSet.maxVerticalDisplacement);
  const packed = waveSet.packedShaderData.toTypedArray();
  for (let index = 0; index < waveSet.shaderWaveCount; index++) {
    const offset = index * WATER_WAVE_PACKED_FLOATS_PER_WAVE;
    if (index >= waveSet.activeWaveCount) {
      material.shaderData.setVector4(`${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index}`, ZERO_WAVE_UNIFORM);
      material.shaderData.setVector4(`${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index}`, ZERO_WAVE_UNIFORM);
      continue;
    }
    material.shaderData.setVector4(
      `${WATER_WAVE_SHADER_PROPERTY.waveAPrefix}${index}`,
      new Vector4(packed[offset], packed[offset + 1], packed[offset + 2], packed[offset + 3])
    );
    material.shaderData.setVector4(
      `${WATER_WAVE_SHADER_PROPERTY.waveBPrefix}${index}`,
      new Vector4(packed[offset + 4], packed[offset + 5], packed[offset + 6], packed[offset + 7])
    );
  }
  return surfaceDetail.enabled;
}

export function createWaterWaveMaterial(
  engine: Engine,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): WaterWaveMaterialState {
  const variant = resolveVariant(waveSet.shaderWaveCount);
  const opticsTier = resolveOpticsTier(variant, config.opticsTier);
  const shaderName = shaderNameForVariant(variant, opticsTier);
  const shader = Shader.find(shaderName) ?? Shader.create(createWaterWaveShaderSource(variant, opticsTier));
  const material = new Material(engine, shader);
  const surfaceDetailEnabled = bindWaterWaveMaterial(engine, material, variant, waveSet, config);
  const state = Object.freeze({
    material,
    variant,
    opticsTier,
    waveSet,
    surfaceDetailLayerCount: surfaceDetailLayerCount(variant),
    surfaceDetailEnabled,
    nearshoreEnabled: config.nearshore !== undefined,
    nearshoreWaveEnabled:
      config.nearshore !== undefined &&
      config.nearshore.waveEnabled !== false,
    nearshoreStateEnabled: config.nearshore?.dynamic !== undefined,
    nearshoreBreakerEnabled:
      config.nearshore?.dynamic !== undefined &&
      config.nearshoreBreakerEnabled !== false,
    foamEnabled: config.foam !== undefined,
    foamDetailTextureSource:
      config.foam === undefined &&
      config.analyticWhitecapEnabled !== true
        ? "none"
        : config.foamDetail
          ? "external"
          : "procedural",
    analyticWhitecapEnabled: config.analyticWhitecapEnabled === true,
    foamDebugView: config.foam?.debugView ?? WaterFoamDebugView.Final,
    opticsBindingState: createWaterSurfaceOpticsBindingState()
  });
  setWaterWaveSurfaceOpticsBinding(state, {
    tier: opticsTier ?? "medium",
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: false,
    reflection: undefined,
    debugView: WaterOpticsDebugView.Final
  });
  return state;
}

export function updateWaterWaveMaterial(
  state: WaterWaveMaterialState,
  waveSet: CompiledWaterWaveSet,
  config: WaterWaveMaterialConfig
): WaterWaveMaterialState {
  const nextVariant = resolveVariant(waveSet.shaderWaveCount);
  const nextOpticsTier = resolveOpticsTier(nextVariant, config.opticsTier);
  if (nextVariant !== state.variant || nextOpticsTier !== state.opticsTier) {
    throw new Error("Water-wave or surface-optics shader variants require material replacement.");
  }
  const surfaceDetailEnabled = bindWaterWaveMaterial(
    state.material.engine,
    state.material,
    state.variant,
    waveSet,
    config
  );
  return Object.freeze({
    material: state.material,
    variant: state.variant,
    opticsTier: state.opticsTier,
    waveSet,
    surfaceDetailLayerCount: state.surfaceDetailLayerCount ?? surfaceDetailLayerCount(state.variant),
    surfaceDetailEnabled,
    nearshoreEnabled: config.nearshore !== undefined,
    nearshoreWaveEnabled:
      config.nearshore !== undefined &&
      config.nearshore.waveEnabled !== false,
    nearshoreStateEnabled: config.nearshore?.dynamic !== undefined,
    nearshoreBreakerEnabled:
      config.nearshore?.dynamic !== undefined &&
      config.nearshoreBreakerEnabled !== false,
    foamEnabled: config.foam !== undefined,
    foamDetailTextureSource:
      config.foam === undefined &&
      config.analyticWhitecapEnabled !== true
        ? "none"
        : config.foamDetail
          ? "external"
          : "procedural",
    analyticWhitecapEnabled: config.analyticWhitecapEnabled === true,
    foamDebugView: config.foam?.debugView ?? WaterFoamDebugView.Final,
    opticsBindingState: state.opticsBindingState
  });
}

export function setWaterWaveSurfaceTimeOverride(state: WaterWaveMaterialState, elapsedTime?: number): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.surfaceTimeOverride,
    elapsedTime === undefined ? -1 : Math.max(0, elapsedTime)
  );
}

export function setWaterWaveNearshoreDebugView(
  state: WaterWaveMaterialState,
  debugView: OceanNearshoreDebugView
): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreDebugView,
    debugView
  );
}

export function setWaterWaveNearshoreWaveEnabled(
  state: WaterWaveMaterialState,
  enabled: boolean
): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreWaveEnabled,
    enabled ? 1 : 0
  );
}

export function setWaterWaveNearshoreStateEnabled(
  state: WaterWaveMaterialState,
  enabled: boolean
): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreStateEnabled,
    enabled ? 1 : 0
  );
}

export function setWaterWaveNearshoreBreakerEnabled(
  state: WaterWaveMaterialState,
  enabled: boolean
): void {
  state.material.shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.nearshoreBreakerEnabled,
    enabled ? 1 : 0
  );
}

/**
 * Rebinds the current ping-pong foam texture without replacing the material.
 * Passing no bounded binding clears every finite-foam visual signal.
 */
export function setWaterWaveFoamBinding(
  state: WaterWaveMaterialState,
  binding: Readonly<WaterTemporalFoamBinding> | undefined,
  analyticWhitecapEnabled: boolean
): void {
  const shaderData = state.material.shaderData;
  const nullableTextureData = shaderData as unknown as NullableTextureShaderData;
  nullableTextureData.setTexture(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamTexture,
    binding?.texture ?? null
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamEnabled,
    binding ? 1 : 0
  );
  shaderData.setVector4(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamRegion,
    binding ? new Vector4(...binding.region) : new Vector4(0, 0, 1, 1)
  );
  shaderData.setVector2(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamTexelSize,
    binding
      ? new Vector2(...binding.texelSize)
      : new Vector2(1, 1)
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDebugView,
    binding?.debugView ?? WaterFoamDebugView.Final
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.analyticWhitecapEnabled,
    analyticWhitecapEnabled ? 1 : 0
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDetailEnabled,
    binding || analyticWhitecapEnabled ? 1 : 0
  );
}

/** Refreshes only the ping-pong texture/debug state; the fixed region stays bound. */
export function setWaterWaveFoamTexture(
  state: WaterWaveMaterialState,
  texture: Texture2D | undefined,
  debugView: WaterFoamDebugView,
  analyticWhitecapEnabled: boolean
): void {
  const shaderData = state.material.shaderData;
  (shaderData as unknown as NullableTextureShaderData).setTexture(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamTexture,
    texture ?? null
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.temporalFoamEnabled,
    texture ? 1 : 0
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDebugView,
    texture ? debugView : WaterFoamDebugView.Final
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.analyticWhitecapEnabled,
    analyticWhitecapEnabled ? 1 : 0
  );
  shaderData.setFloat(
    WATER_WAVE_SHADER_PROPERTY.foamDetailEnabled,
    texture || analyticWhitecapEnabled ? 1 : 0
  );
}

export function setWaterWaveReflectionBinding(
  state: WaterWaveMaterialState,
  binding?: Readonly<WaterReflectionBinding>
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  return applyWaterSurfaceReflectionBinding(
    state.material.shaderData,
    state.opticsBindingState,
    state.opticsTier ?? "medium",
    binding
  );
}

/** Applies the complete P1 profile/refraction/reflection contract to one Ocean material. */
export function setWaterWaveSurfaceOpticsBinding(
  state: WaterWaveMaterialState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const requestedResolvedTier = binding.tier === "medium" ? "medium" : "high";
  if (binding.refractionEnabled && state.opticsTier !== requestedResolvedTier) {
    throw new Error(
      `Water-wave refraction requested ${binding.tier}, but the material compiled ${state.opticsTier ?? "legacy"}; replace the material first.`
    );
  }
  return applyWaterSurfaceOpticsBinding(state.material.shaderData, state.opticsBindingState, binding);
}
