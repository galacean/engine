/** Fully resolved immutable authoring bundle consumed by Loader and backend adapters. */
import type { WaterQualityPlanV2 } from "../quality/WaterQualityPlan";
import type { WaterReflectionPolicyPresetV1 } from "../optics/WaterReflectionPolicyPreset";
import type { WaterLookPresetV1 } from "../surface/WaterLookPreset";
import type { WaterLookAuthoringSnapshot } from "../surface/WaterLookAuthoringSnapshot";
import type { WaterRenderStatePresetV1 } from "../surface/WaterRenderStatePreset";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { WaterBodyAsset } from "./WaterBodyAsset";
import type {
  WaterAppearancePresetV1,
  WaterBodySourceV1,
  WaterOpticsPresetV1,
  WaterResourceAssetDescriptorV1
} from "./WaterBodyAuthoringTypes";
import type { WaterBodyInstance } from "./WaterBodyInstance";

export interface ResolvedWaterBodyInstance {
  readonly schemaVersion: 2;
  readonly instance: WaterBodyInstance;
  readonly asset: WaterBodyAsset<WaterBodySourceV1>;
  readonly look: WaterLookPresetV1;
  readonly lookAuthoring: WaterLookAuthoringSnapshot;
  readonly lookRevision: WaterLookAuthoringSnapshot["revision"];
  readonly lookContentHash: string;
  readonly appearance: WaterAppearancePresetV1;
  readonly optics: WaterOpticsPresetV1;
  readonly reflectionPolicy: WaterReflectionPolicyPresetV1;
  readonly renderState: WaterRenderStatePresetV1;
  readonly qualityPlan: WaterQualityPlanV2;
  readonly renderContract: CompiledWaterRenderContractV1;
  readonly resources: readonly WaterResourceAssetDescriptorV1[];
}
