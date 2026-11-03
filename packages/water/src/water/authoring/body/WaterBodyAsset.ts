/** Semantic WaterBody asset envelope, independent from backend selection. */
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  createWaterRepresentationV1,
  isWaterBodyKind,
  type WaterBodyKind,
  type WaterRepresentationV1
} from "./WaterBodyRepresentation";

export const WATER_BODY_ASSET_SCHEMA_VERSION = 2 as const;

export interface WaterBodyAsset<TSource = unknown> {
  readonly schemaVersion: typeof WATER_BODY_ASSET_SCHEMA_VERSION;
  readonly id: string;
  readonly kind: WaterBodyKind;
  readonly representation: WaterRepresentationV1;
  /** Representation-owned compiler input; never part of the physical WaterBodySource payload. */
  readonly representationData?: unknown;
  /** Immutable revision of representationData, independent from sourceHash. */
  readonly representationDataHash?: string;
  /** Authority-provided immutable WaterBodySource revision token; not the compiled PhysicalSurface identity. */
  readonly sourceHash: string;
  readonly source: TSource;
}

export type WaterBodyAssetInput<TSource> = Omit<WaterBodyAsset<TSource>, "schemaVersion">;

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

export function createWaterBodyAsset<TSource>(
  source: Readonly<WaterBodyAssetInput<TSource>>
): Readonly<WaterBodyAsset<TSource>> {
  const id = requireNonEmpty(source.id, "Water body asset id");
  const sourceHash = requireNonEmpty(source.sourceHash, "Water body source hash");
  if ((source.representationData === undefined) !== (source.representationDataHash === undefined)) {
    throw new TypeError("Water body representationData and representationDataHash must be provided together.");
  }
  if (!isWaterBodyKind(source.kind)) {
    throw new TypeError(`Unsupported Water body kind '${String(source.kind)}'.`);
  }
  if (source.source === undefined || source.source === null) {
    throw new TypeError("Water body source must be present.");
  }
  return Object.freeze({
    schemaVersion: WATER_BODY_ASSET_SCHEMA_VERSION,
    id,
    kind: source.kind,
    representation: createWaterRepresentationV1(source.representation),
    representationData: source.representationData,
    representationDataHash: source.representationDataHash,
    sourceHash,
    source: source.source
  });
}

/** Stable identity for one immutable source revision. Runtime instance state is deliberately excluded. */
export function computeWaterBodyAssetContentHash(
  asset: Pick<
    WaterBodyAsset,
    "schemaVersion" | "id" | "kind" | "representation" | "representationDataHash" | "sourceHash"
  >
): string {
  return hashStableValue({
    schemaVersion: asset.schemaVersion,
    id: asset.id,
    kind: asset.kind,
    representation: asset.representation,
    representationDataHash: asset.representationDataHash,
    sourceHash: asset.sourceHash
  });
}
