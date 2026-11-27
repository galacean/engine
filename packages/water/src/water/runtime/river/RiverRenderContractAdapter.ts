/** Pure River adapter from the shared Water Render Contract to River runtime semantics. */
import type { ResolvedWaterBodyInstance } from "../body/WaterBackendRegistry";
import type { EffectiveWaterRuntimeSnapshot } from "../state/EffectiveWaterRuntimeSnapshot";
import { resolveWaterBodyQualityTier } from "../body/WaterBodyRuntimeSemantics";
import { WaterSurfaceAppearanceSchemaVersion } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldConsumerActivation, WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import {
  resolveWaterSurfaceFieldGraph,
  WaterSurfaceFieldActivationError,
  type WaterSurfaceFieldGraphReadback
} from "../surface/WaterSurfaceFieldResolver";

export interface RiverRenderContractAdapterResolution {
  readonly renderContract: CompiledWaterRenderContractV1;
  readonly opticalProfile: WaterOpticalProfile;
  readonly refractionEnabled: boolean;
  readonly fieldGraph: WaterSurfaceFieldGraphReadback;
}

type RiverRenderContractAdapterInput = Readonly<ResolvedWaterBodyInstance> | Readonly<EffectiveWaterRuntimeSnapshot>;

function sourceCapabilities(input: RiverRenderContractAdapterInput) {
  return "sourceCapabilities" in input ? input.sourceCapabilities : input.asset.source.capabilities;
}

export function resolveRiverRenderContractAdapter(
  resolved: RiverRenderContractAdapterInput
): Readonly<RiverRenderContractAdapterResolution> {
  const renderContract = resolved.renderContract;
  if (renderContract.surfaceClosure.appearance.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
    throw new Error("RiverWaterBackend requires a Surface Appearance V2 Render Contract.");
  }
  const renderState = renderContract.renderState;
  if (renderState.queue !== "transparent" || renderState.blendMode !== "alpha" || renderState.cullMode !== "off") {
    throw new Error(
      `RiverWaterBackend does not support render state '${renderState.queue}/${renderState.blendMode}/${renderState.cullMode}'.`
    );
  }

  const semantics = new Set<WaterFieldSemantic>([WaterFieldSemantic.Coverage, WaterFieldSemantic.SurfaceHeight]);
  const capabilities = sourceCapabilities(resolved);
  if (capabilities.localBathymetry) semantics.add(WaterFieldSemantic.VerticalDepth);
  if (capabilities.shoreSdf) semantics.add(WaterFieldSemantic.HorizontalShoreDistance);
  if (capabilities.current) semantics.add(WaterFieldSemantic.Flow);
  const sceneFields = resolved.qualityPlan.sceneFields;
  const fieldGraph = resolveWaterSurfaceFieldGraph(renderContract.surfaceClosure.fields, {
    quality: resolveWaterBodyQualityTier(resolved.qualityPlan.surfaceShading),
    effectiveQualityPlan: resolved.qualityPlan,
    compiledSpatialFields: semantics,
    enabledActivations: new Set(Object.values(WaterFieldConsumerActivation)),
    cameraDepth: sceneFields === "scene-color-depth",
    cameraOpaqueColor: sceneFields !== "local-only"
  });
  if (fieldGraph.failed) throw new WaterSurfaceFieldActivationError(fieldGraph);

  return Object.freeze({
    renderContract,
    opticalProfile: renderContract.optics.profile,
    refractionEnabled: renderContract.surfaceClosure.appearance.refraction.enabled,
    fieldGraph
  });
}
