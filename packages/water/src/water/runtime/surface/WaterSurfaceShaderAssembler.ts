/** Deterministic assembly plan joining one geometry adapter to the shared Water fragment closure. */
import { WaterSurfacePrimaryColorClosure } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { hashStableValue } from "../../compiler/shared/determinism";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { createWaterSurfaceBrdfShaderFunctions } from "./WaterSurfaceBrdfShader";
import { createWaterSurfaceClosureShaderFunctions, type WaterSurfaceClosurePolicy } from "./WaterSurfaceClosureShader";
import {
  createWaterSurfaceGeometryAdapterBridge,
  type WaterSurfaceGeometryAdapter
} from "./WaterSurfaceGeometryAdapter";
import { createWaterSurfaceRawContributionShaderFunctions } from "./WaterSurfaceRawContributionShader";

export interface WaterSurfaceShaderAssemblyV1 {
  readonly schemaVersion: 1;
  readonly adapterId: string;
  /** Backend-independent fragment structure inherited directly from the Render Contract. */
  readonly closureVariantKey: CompiledWaterRenderContractV1["variantKey"];
  /** Full material structure; geometry and explicit optional shared policies determine backend differences. */
  readonly materialVariantKey: `water-surface-material-v1:${string}`;
  readonly sharedFunctionSource: string;
  readonly geometryBridgeSource: string;
  readonly requiredBindings: readonly string[];
}

export function createWaterSurfaceMaterialVariantKey(
  closureVariantKey: CompiledWaterRenderContractV1["variantKey"],
  geometryVariantKey: WaterSurfaceGeometryAdapter["variantKey"],
  policy?: Readonly<WaterSurfaceClosurePolicy>
): WaterSurfaceShaderAssemblyV1["materialVariantKey"] {
  return `water-surface-material-v1:${hashStableValue({
    closureVariantKey,
    geometryVariantKey,
    ...(policy ? { policy } : {})
  })}`;
}

export function assembleWaterSurfaceShader(
  contract: Pick<CompiledWaterRenderContractV1, "variantKey"> &
    Partial<Pick<CompiledWaterRenderContractV1, "surfaceClosure">>,
  adapter: Readonly<WaterSurfaceGeometryAdapter>,
  appearanceOverride?: Readonly<CompiledWaterSurfaceAppearanceV2>,
  policy?: Readonly<WaterSurfaceClosurePolicy>
): Readonly<WaterSurfaceShaderAssemblyV1> {
  const appearance = contract.surfaceClosure?.appearance ?? appearanceOverride;
  return Object.freeze({
    schemaVersion: 1,
    adapterId: adapter.id,
    closureVariantKey: contract.variantKey,
    materialVariantKey: createWaterSurfaceMaterialVariantKey(contract.variantKey, adapter.variantKey, policy),
    sharedFunctionSource: `${createWaterSurfaceBrdfShaderFunctions()}\n${createWaterSurfaceRawContributionShaderFunctions(adapter.id !== "heightfield")}\n${createWaterSurfaceClosureShaderFunctions(
      appearance?.directionalHighlight !== undefined || appearance?.macroNormalStrength !== undefined,
      appearance?.primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp,
      policy
    )}`,
    geometryBridgeSource: createWaterSurfaceGeometryAdapterBridge(adapter),
    requiredBindings: adapter.requiredBindings
  });
}
