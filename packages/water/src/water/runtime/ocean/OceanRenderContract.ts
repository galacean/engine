/** Ocean capabilities are explicit; its supported optical equations are owned by Water. */
import { registerOceanLook } from "../../authoring/ocean/OceanAuthoring";
import { OCEAN_LOOK_ID } from "../../authoring/ocean/presets/OceanLook";
import { createWaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import {
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import { WaterRenderContractCompiler } from "../../compiler/surface/WaterRenderContractCompiler";
import { WaterBodyAssetRegistry } from "../body/WaterBodyAssetRegistry";

import { createOceanRuntimeTuning, type OceanRuntimeTuning } from "./OceanRuntimeTuning";

let canonicalContract: CompiledWaterRenderContractV1 | undefined;
/** Offline/JIT default uses exactly the same published Look as WaterBody activation. */
export function getCanonicalOceanRenderContract(): CompiledWaterRenderContractV1 {
  if (canonicalContract) return canonicalContract;
  const registry = new WaterBodyAssetRegistry();
  registerOceanLook(registry);
  const snapshot = registry.getLookAuthoringSnapshot(OCEAN_LOOK_ID)!;
  const result = WaterRenderContractCompiler.compile({
    sourceId: snapshot.look.id,
    look: snapshot.look,
    appearance: snapshot.appearance.appearance,
    fieldDependencies: snapshot.appearance.fieldDependencies!,
    optics: snapshot.optics,
    reflectionIntent: snapshot.reflectionPolicy,
    renderState: snapshot.renderState,
    resources: [],
    qualityPlan: createWaterQualityPlanV2({
      id: "ocean-shader-capabilities",
      geometry: "high",
      surfaceShading: "high",
      sceneFields: "scene-color-depth",
      reflectionBudget: { environment: true, screenSpace: false },
      surfaceEffectBudget: { caustics: true },
      query: "off",
      spatialField: {
        maximumHorizontalError: 1,
        maximumDepthError: 0,
        maximumGpuDepthDecodeError: 1,
        maximumGpuShoreDecodeError: 1,
        maximumAtlasPixels: 1048576
      }
    })
  });
  if (!result.data) throw new Error(JSON.stringify(result.diagnostics));
  canonicalContract = result.data;
  return canonicalContract;
}

export function assertSupportedOceanRenderContract(contract: CompiledWaterRenderContractV1): void {
  const appearance = contract.surfaceClosure.appearance;
  if (
    appearance.boundaryEffects.length !== 1 ||
    appearance.boundaryEffects.some((effect) => effect.pattern !== undefined)
  ) {
    throw new Error(
      "Ocean supports one shared shoreline boundary response; patterned or multiple boundary effects are not supported."
    );
  }
  if (
    appearance.primaryColorClosure !== WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp ||
    appearance.depthResponse.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential ||
    appearance.composition !== WaterSurfaceCompositionV2.PrecomposedReplace ||
    appearance.detailLayers.length > 0 ||
    appearance.caustics !== undefined ||
    appearance.macroNormalStrength === undefined ||
    appearance.directionalHighlight === undefined
  ) {
    throw new Error(
      "Ocean supports CompositeExponential SceneColorCompositeDepthRamp with PrecomposedReplace and its geometry-owned detail normals."
    );
  }
  if (
    appearance.refraction.normalSource !== WaterRefractionNormalSourceV2.ViewSpaceDelta ||
    appearance.refraction.validation !== WaterRefractionValidationModeV2.FullSceneDepth
  ) {
    throw new Error("Ocean refraction requires ViewSpaceDelta with FullSceneDepth validation.");
  }
  const depth = appearance.depthResponse;
  if (
    depth.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential ||
    depth.terms.length !== 2 ||
    (depth.terms[0].field !== WaterFieldSemantic.SceneRayDepth &&
      depth.terms[0].field !== WaterFieldSemantic.SceneEyeDepth) ||
    depth.terms[1]?.field !== WaterFieldSemantic.SurfaceNormalDepth
  ) {
    throw new Error("Ocean live depth controls require SceneEyeDepth or SceneRayDepth followed by SurfaceNormalDepth.");
  }
  if (
    contract.renderState.depthWriteEnabled ||
    contract.renderState.queue !== "transparent" ||
    contract.renderState.blendMode !== "alpha" ||
    contract.renderState.cullMode !== "back"
  ) {
    throw new Error("Ocean supports transparent alpha, back-face culling and disabled depth writes.");
  }
  if (
    contract.optics.profile.absorptionCoefficient.some((value) => value !== 0) ||
    contract.optics.profile.scatteringCoefficient !== 0
  ) {
    throw new Error(
      "Ocean stylized depth-ramp policy uses depthResponse coefficients; physical volume absorption/scattering requires a supported medium policy."
    );
  }
  if (contract.reflectionIntent.sourceChain.some((source) => source !== "environment" && source !== "analytic")) {
    throw new Error("Ocean supports environment and analytic reflection only.");
  }
}

/** Keep live controls in the published contract's parameter space before the first edit. */
export function createOceanTuningFromRenderContract(
  contract: CompiledWaterRenderContractV1,
  source?: Readonly<OceanRuntimeTuning>
): Readonly<OceanRuntimeTuning> {
  assertSupportedOceanRenderContract(contract);
  const base = createOceanRuntimeTuning(source);
  const appearance = contract.surfaceClosure.appearance;
  const depth = appearance.depthResponse;
  if (depth.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential)
    throw new Error("Unsupported Ocean depth response.");
  const profile = contract.optics.profile;
  const highlight = appearance.directionalHighlight!;
  const foamRgb = Number.parseInt(contract.look.foam.color.replace("#", ""), 16);
  return createOceanRuntimeTuning({
    ...base,
    color: { ...base.color, shallow: depth.shallowColor, deep: depth.deepColor },
    depth: {
      ...base.depth,
      horizontal: depth.terms[0].coefficientPerMeter * 10,
      vertical: depth.terms[1]!.coefficientPerMeter
    },
    wave: { ...base.wave, normalStrength: appearance.macroNormalStrength! },
    reflection: {
      ...base.reflection,
      strength: profile.reflectionIntensity ?? 0,
      blur: profile.roughness ?? 0,
      sunStrength: highlight.strength,
      sunSize: (8196 - highlight.exponent) / 8132,
      sunDistortion: highlight.distortion
    },
    refraction: { enabled: appearance.refraction.enabled, strength: profile.refractionStrength ?? 0 },
    intersection: { ...base.intersection, lengthMetres: appearance.boundaryEffects[0].rangeMeters },
    surfaceFoam: {
      ...base.surfaceFoam,
      color: [((foamRgb >> 16) & 255) / 255, ((foamRgb >> 8) & 255) / 255, (foamRgb & 255) / 255, 1]
    }
  });
}
