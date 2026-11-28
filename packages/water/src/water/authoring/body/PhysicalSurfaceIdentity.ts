/** Backend- and Quality-independent identity of one exact physical water surface. */
import { hashStableValue } from "../../compiler/shared/determinism";
import { createWaterContentHash, type WaterContentHash } from "../identity/WaterIdentity";

export const PHYSICAL_SURFACE_IDENTITY_SCHEMA_VERSION = 1 as const;

export interface PhysicalSurfaceIdentity {
  readonly schemaVersion: typeof PHYSICAL_SURFACE_IDENTITY_SCHEMA_VERSION;
  readonly sourceHash: WaterContentHash<"water-source">;
  readonly physicalWaveHash: WaterContentHash<"physical-wave">;
  readonly contentHash: WaterContentHash<"physical-surface">;
}

export interface PhysicalSurfaceIdentityInput {
  readonly sourceHash: string;
  readonly physicalWaveHash: string;
}

export function createPhysicalSurfaceIdentity(
  input: Readonly<PhysicalSurfaceIdentityInput>
): Readonly<PhysicalSurfaceIdentity> {
  const sourceHash = createWaterContentHash<"water-source">(input.sourceHash, "$.sourceHash");
  const physicalWaveHash = createWaterContentHash<"physical-wave">(input.physicalWaveHash, "$.physicalWaveHash");
  const contentHash = createWaterContentHash<"physical-surface">(
    hashStableValue({
      schemaVersion: PHYSICAL_SURFACE_IDENTITY_SCHEMA_VERSION,
      sourceHash,
      physicalWaveHash
    }),
    "$.contentHash"
  );
  return Object.freeze({
    schemaVersion: PHYSICAL_SURFACE_IDENTITY_SCHEMA_VERSION,
    sourceHash,
    physicalWaveHash,
    contentHash
  });
}
