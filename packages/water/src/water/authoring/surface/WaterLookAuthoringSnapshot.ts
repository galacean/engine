/**
 * One immutable publication unit for every visual parameter owned by a Water Look.
 *
 * Component ids remain useful for RenderContract compilation and resource sharing,
 * but callers publish and edit the complete snapshot so no runtime subsystem can
 * mutate an optical profile, appearance, reflection policy, or render state alone.
 */
import type { WaterAppearancePresetV1, WaterOpticsPresetV1 } from "../body/WaterBodyAuthoringTypes";
import {
  createWaterContentHash,
  createWaterRevision,
  type WaterContentHash,
  type WaterRevision
} from "../identity/WaterIdentity";
import type { WaterReflectionPolicyPresetV1 } from "../optics/WaterReflectionPolicyPreset";
import { hashStableValue } from "../../compiler/shared/determinism";
import type { WaterLookPresetV1 } from "./WaterLookPreset";
import type { WaterRenderStatePresetV1 } from "./WaterRenderStatePreset";
import { createImmutableWaterSnapshot } from "../identity/WaterImmutableSnapshot";

export const WATER_LOOK_AUTHORING_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface WaterLookAuthoringComponents {
  readonly look: Readonly<WaterLookPresetV1>;
  readonly appearance: Readonly<WaterAppearancePresetV1>;
  readonly optics: Readonly<WaterOpticsPresetV1>;
  readonly reflectionPolicy: Readonly<WaterReflectionPolicyPresetV1>;
  readonly renderState: Readonly<WaterRenderStatePresetV1>;
}

export interface WaterLookAuthoringSnapshot extends WaterLookAuthoringComponents {
  readonly schemaVersion: typeof WATER_LOOK_AUTHORING_SNAPSHOT_SCHEMA_VERSION;
  readonly revision: WaterRevision<"water-look">;
  readonly contentHash: WaterContentHash<"water-look">;
}

export type WaterLookAuthoringDraft = WaterLookAuthoringComponents;

export interface CreateWaterLookAuthoringSnapshotInput extends WaterLookAuthoringComponents {
  readonly revision: number;
}

export function computeWaterLookAuthoringContentHash(
  components: Readonly<WaterLookAuthoringComponents>
): WaterContentHash<"water-look"> {
  return createWaterContentHash<"water-look">(
    hashStableValue({
      schemaVersion: WATER_LOOK_AUTHORING_SNAPSHOT_SCHEMA_VERSION,
      look: components.look,
      appearance: components.appearance,
      optics: components.optics,
      reflectionPolicy: components.reflectionPolicy,
      renderState: components.renderState
    }),
    "$.contentHash"
  );
}

export function createWaterLookAuthoringSnapshot(
  input: Readonly<CreateWaterLookAuthoringSnapshotInput>
): Readonly<WaterLookAuthoringSnapshot> {
  const components = createImmutableWaterSnapshot<WaterLookAuthoringComponents>({
    look: input.look,
    appearance: input.appearance,
    optics: input.optics,
    reflectionPolicy: input.reflectionPolicy,
    renderState: input.renderState
  });
  return Object.freeze({
    schemaVersion: WATER_LOOK_AUTHORING_SNAPSHOT_SCHEMA_VERSION,
    revision: createWaterRevision<"water-look">(input.revision, "$.revision"),
    contentHash: computeWaterLookAuthoringContentHash(components),
    ...components
  });
}
