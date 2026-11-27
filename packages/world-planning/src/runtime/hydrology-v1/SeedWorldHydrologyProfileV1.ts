import {
  createCanonicalWaterHashWriter,
  isCanonicalSha256Hex,
  type CanonicalWaterBinaryWriterV1
} from "@galacean/engine-water/water/compiler/index";
import { encodeLengthMetres, encodeRatioPpm } from "@galacean/engine-water/world/WaterMetricEncodingV1";
import { SEED_WORLD_DEFAULT_HYDROLOGY_BANK_SHOULDER_METRES } from "../SeedWorldHydrologyBake.ts";

const SEED_WORLD_HYDROLOGY_PROFILE_SCHEMA_VERSION = 1 as const;
const SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_ID = "seed-world-lake-production-v1";
const SEED_WORLD_PLANNED_HYDROLOGY_TOPOLOGY_AUTHORITY = "planned-hydrology-bake-v1" as const;

/** Canonical identity of the planning-owned Hydrology bake consumed by production generation. */
export interface SeedWorldHydrologyProfileV1 {
  readonly schemaVersion: typeof SEED_WORLD_HYDROLOGY_PROFILE_SCHEMA_VERSION;
  readonly profileId: string;
  readonly status: "production";
  readonly topologyAuthority: typeof SEED_WORLD_PLANNED_HYDROLOGY_TOPOLOGY_AUTHORITY;
  readonly hydrologyDepthScalePpm: number;
  readonly hydrologyBankShoulderMillimetres: number;
  readonly hydrologyProfileHash: string;
}

interface SeedWorldHydrologyProfileInputV1 {
  readonly profileId: string;
  readonly status: "production";
  readonly hydrologyDepthScale: number;
  readonly hydrologyBankShoulderMetres: number;
}

const SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_INPUT_V1 = Object.freeze<SeedWorldHydrologyProfileInputV1>({
  profileId: SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_ID,
  status: "production",
  hydrologyDepthScale: 2.2,
  hydrologyBankShoulderMetres: SEED_WORLD_DEFAULT_HYDROLOGY_BANK_SHOULDER_METRES
});

export const SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_V1 = createSeedWorldHydrologyProfileV1(
  SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_INPUT_V1
);

/** Creates the immutable per-generation Profile matching the planning-page Hydrology bake style. */
export function createSeedWorldProductionLakeHydrologyProfileV1(
  style: Readonly<{ readonly depthScale: number; readonly bankShoulderMetres: number }>
): Readonly<SeedWorldHydrologyProfileV1> {
  if (
    style.depthScale === SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_INPUT_V1.hydrologyDepthScale &&
    style.bankShoulderMetres === SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_INPUT_V1.hydrologyBankShoulderMetres
  ) {
    return SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_V1;
  }
  const depthScalePpm = encodeRatioPpm(style.depthScale, "hydrologyDepthScale");
  const bankShoulderMillimetres = encodeLengthMetres(style.bankShoulderMetres, "hydrologyBankShoulderMetres");
  return createSeedWorldHydrologyProfileV1({
    ...SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_INPUT_V1,
    profileId: `${SEED_WORLD_PRODUCTION_LAKE_HYDROLOGY_PROFILE_ID}:depth-${depthScalePpm}:shoulder-${bankShoulderMillimetres}`,
    hydrologyDepthScale: style.depthScale,
    hydrologyBankShoulderMetres: style.bankShoulderMetres
  });
}

export function createSeedWorldHydrologyProfileV1(
  input: Readonly<SeedWorldHydrologyProfileInputV1>
): Readonly<SeedWorldHydrologyProfileV1> {
  if (typeof input.profileId !== "string" || input.profileId.trim().length === 0) {
    throw new TypeError("Seed World Hydrology Profile id must be non-empty.");
  }
  if (input.status !== "production") {
    throw new TypeError("Seed World Hydrology accepts only frozen production Profiles.");
  }
  const draft = Object.freeze({
    schemaVersion: SEED_WORLD_HYDROLOGY_PROFILE_SCHEMA_VERSION,
    profileId: input.profileId,
    status: input.status,
    topologyAuthority: SEED_WORLD_PLANNED_HYDROLOGY_TOPOLOGY_AUTHORITY,
    hydrologyDepthScalePpm: encodeRatioPpm(input.hydrologyDepthScale, "hydrologyDepthScale"),
    hydrologyBankShoulderMillimetres: encodeLengthMetres(
      input.hydrologyBankShoulderMetres,
      "hydrologyBankShoulderMetres"
    )
  });
  validateCanonicalProfile(draft);
  return Object.freeze({ ...draft, hydrologyProfileHash: hashSeedWorldHydrologyProfileV1(draft) });
}

export function requireSeedWorldHydrologyProfileV1(
  profile: Readonly<SeedWorldHydrologyProfileV1>
): Readonly<SeedWorldHydrologyProfileV1> {
  if (profile.schemaVersion !== SEED_WORLD_HYDROLOGY_PROFILE_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported Seed World Hydrology Profile schema ${profile.schemaVersion}.`);
  }
  if (!isCanonicalSha256Hex(profile.hydrologyProfileHash)) {
    throw new TypeError("Seed World Hydrology Profile hash must be a full lowercase SHA-256 digest.");
  }
  const { hydrologyProfileHash: expected, ...payload } = profile;
  validateCanonicalProfile(payload);
  const actual = hashSeedWorldHydrologyProfileV1(payload);
  if (actual !== expected) throw new Error("Seed World Hydrology Profile hash does not match its canonical fields.");
  return profile;
}

function hashSeedWorldHydrologyProfileV1(profile: Omit<SeedWorldHydrologyProfileV1, "hydrologyProfileHash">): string {
  const { writer, hash } = createCanonicalWaterHashWriter();
  writeProfile(writer, profile);
  return hash.digestHex();
}

function writeProfile(
  writer: CanonicalWaterBinaryWriterV1,
  profile: Omit<SeedWorldHydrologyProfileV1, "hydrologyProfileHash">
): void {
  writer
    .writeRecord("seed-world-water/hydrology-profile/v1", profile.schemaVersion)
    .writeString(profile.profileId)
    .writeUint8(1)
    .writeString(profile.topologyAuthority)
    .writeInt32(profile.hydrologyDepthScalePpm)
    .writeUint32(profile.hydrologyBankShoulderMillimetres);
}

function validateCanonicalProfile(profile: Omit<SeedWorldHydrologyProfileV1, "hydrologyProfileHash">): void {
  if (profile.topologyAuthority !== SEED_WORLD_PLANNED_HYDROLOGY_TOPOLOGY_AUTHORITY) {
    throw new Error("Seed World production Hydrology must consume the planning-owned Topology.");
  }
  if (!Number.isInteger(profile.hydrologyDepthScalePpm) || profile.hydrologyDepthScalePpm <= 0) {
    throw new RangeError("hydrologyDepthScalePpm must be a positive canonical integer.");
  }
  if (!Number.isInteger(profile.hydrologyBankShoulderMillimetres) || profile.hydrologyBankShoulderMillimetres <= 0) {
    throw new RangeError("hydrologyBankShoulderMillimetres must be a positive canonical integer.");
  }
}
