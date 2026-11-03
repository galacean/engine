/** Transfer-safe Heightfield compiler identities produced beside authoritative generation data. */
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type { WaterQueryQualityV2 } from "../../authoring/quality/WaterQualityPlan";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import {
  compileHashFromSourceHash,
  computeHeightfieldWaterPhysicalSourceHash,
  computeHeightfieldWaterSourceHash
} from "../../compiler/heightfield/HeightfieldWaterCompiler";

export const HEIGHTFIELD_WATER_PREPARED_COMPILER_IDENTITY_SCHEMA_VERSION = 1 as const;

export interface HeightfieldWaterPreparedCompilerIdentityV1 {
  readonly schemaVersion: typeof HEIGHTFIELD_WATER_PREPARED_COMPILER_IDENTITY_SCHEMA_VERSION;
  readonly kind: "heightfield-water-prepared-compiler-identity-v1";
  readonly sourceId: string;
  readonly quality: WaterQualityTier;
  readonly sourceHash: string;
  readonly physicalSourceHash: string;
  readonly compileHashes: Readonly<Record<WaterQueryQualityV2, string>>;
}

/** Runs only at a CPU compilation boundary, normally the authoritative generation Worker. */
export function createHeightfieldWaterPreparedCompilerIdentityV1(
  descriptor: Readonly<HeightfieldWaterDescriptorV1>
): Readonly<HeightfieldWaterPreparedCompilerIdentityV1> {
  const sourceHash = computeHeightfieldWaterSourceHash(descriptor);
  return Object.freeze({
    schemaVersion: HEIGHTFIELD_WATER_PREPARED_COMPILER_IDENTITY_SCHEMA_VERSION,
    kind: "heightfield-water-prepared-compiler-identity-v1" as const,
    sourceId: descriptor.id,
    quality: descriptor.quality,
    sourceHash,
    physicalSourceHash: computeHeightfieldWaterPhysicalSourceHash(descriptor),
    compileHashes: Object.freeze({
      off: compileHashFromSourceHash(sourceHash, "off"),
      sparse: compileHashFromSourceHash(sourceHash, "sparse"),
      dense: sourceHash
    })
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Reads the optional fast path and rejects malformed claimed precompiled data. */
export function readHeightfieldWaterPreparedCompilerIdentityV1(
  representationData: unknown
): Readonly<HeightfieldWaterPreparedCompilerIdentityV1> | undefined {
  if (!isRecord(representationData) || representationData.preparedCompilerIdentity === undefined) {
    return undefined;
  }
  const value = representationData.preparedCompilerIdentity;
  if (
    !isRecord(value) ||
    value.schemaVersion !== HEIGHTFIELD_WATER_PREPARED_COMPILER_IDENTITY_SCHEMA_VERSION ||
    value.kind !== "heightfield-water-prepared-compiler-identity-v1" ||
    !isNonEmptyString(value.sourceId) ||
    !Object.values(WaterQualityTier).includes(value.quality as WaterQualityTier) ||
    !isNonEmptyString(value.sourceHash) ||
    !isNonEmptyString(value.physicalSourceHash) ||
    !isRecord(value.compileHashes) ||
    !isNonEmptyString(value.compileHashes.off) ||
    !isNonEmptyString(value.compileHashes.sparse) ||
    !isNonEmptyString(value.compileHashes.dense)
  ) {
    throw new TypeError("Heightfield prepared compiler identity is invalid.");
  }
  return value as unknown as Readonly<HeightfieldWaterPreparedCompilerIdentityV1>;
}
