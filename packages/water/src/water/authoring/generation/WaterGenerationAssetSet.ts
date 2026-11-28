import type { WaterBodySourceV1 } from "../body/WaterBodyAuthoringTypes";
import type { WaterBodyAsset } from "../body/WaterBodyAsset";
import { isCanonicalSha256Hex } from "../../compiler/shared/CanonicalWaterBinaryWriterV1";

export const WATER_GENERATION_ASSET_SET_SCHEMA_VERSION = 1 as const;

export interface WaterGenerationAssetSetV1 {
  readonly schemaVersion: typeof WATER_GENERATION_ASSET_SET_SCHEMA_VERSION;
  readonly bodies: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[];
}

export function createWaterGenerationAssetSetV1(
  bodies: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[]
): Readonly<WaterGenerationAssetSetV1> {
  const bodyIds = new Set<string>();
  const normalizedBodies = bodies.map((body) => {
    requireSha256(body.id, "Water generation body id");
    requireSha256(body.sourceHash, `Water generation body '${body.id}' source hash`);
    if (bodyIds.has(body.id)) throw new Error(`Water Generation Asset Set contains duplicate body '${body.id}'.`);
    bodyIds.add(body.id);
    return body;
  });
  return Object.freeze({
    schemaVersion: WATER_GENERATION_ASSET_SET_SCHEMA_VERSION,
    bodies: Object.freeze(normalizedBodies)
  });
}

function requireSha256(value: string, label: string): void {
  if (!isCanonicalSha256Hex(value)) throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
}
