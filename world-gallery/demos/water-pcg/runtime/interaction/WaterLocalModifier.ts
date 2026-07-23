import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import type { WaterLocalFieldProvider } from "./WaterLocalFieldProvider";

/** Blend behavior is explicit because different producers may overlap the same body-local region. */
export enum WaterLocalModifierBlendMode {
  Add = "add",
  Max = "max",
  Override = "override"
}

export interface WaterLocalModifier {
  readonly id: string;
  readonly bodyId: string;
  readonly bounds: WaterBoundsXZ;
  readonly channels: number;
  readonly priority: number;
  readonly blendMode: WaterLocalModifierBlendMode;
  readonly dynamic: boolean;
}

/** One modifier description bound to the provider that owns its sampled values. */
export interface WaterLocalModifierBinding {
  readonly modifier: WaterLocalModifier;
  readonly provider: WaterLocalFieldProvider;
}
