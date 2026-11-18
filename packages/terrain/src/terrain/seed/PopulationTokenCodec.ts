import { encodeTerrainCanonicalJson } from "../project/TerrainProjectCodec";
import { isImmutableData } from "../ImmutableData";

const POPULATION_TOKEN_PREFIX = "pt1";
const textDecoder = new TextDecoder();

/** Inclusive uint16 display-size range supported by the Population Token editor. */
export const ASSET_SIZE_PERCENT_MIN = 1;
export const ASSET_SIZE_PERCENT_MAX = 0xffff;

/** Production asset families supported by the local Population contract. */
export type AssetCategory = "tree" | "shrub" | "grass" | "flower" | "rock";

/** Quantity semantic applied uniformly to every value in one asset's LOD profile. */
export enum PopulationLodMetric {
  /** Percentage of an authored internal surface retained by each LOD. */
  DensityPercent = "density-percent",
  /** Complete atom instances emitted per population cell by each LOD. */
  CountPerCell = "count-per-cell",
  /** Explicit complete atom count retained by each LOD. */
  InstanceCount = "instance-count"
}

/** Category-independent quantity configuration ordered by the catalog asset's LOD array. */
export interface PopulationLodProfileV1 {
  /** Interpretation and validation range shared by every LOD value. */
  readonly metric: PopulationLodMetric;
  /** One value per catalog LOD; adding LODs only extends this array. */
  readonly values: readonly number[];
}

/** RGB8 tint serialized without floating-point drift. */
export type AssetSeedColor = readonly [red: number, green: number, blue: number];

/** One forward-compatible Population extension block. */
export interface PopulationTokenExtensionV1 {
  /** Stable extension identity. */
  readonly id: string;
  /** Extension-owned schema version. */
  readonly version: number;
  /** Unknown required blocks reject decoding; unknown optional blocks are retained and ignored. */
  readonly required: boolean;
  /** Canonical JSON payload owned by the extension. */
  readonly data: unknown;
}

/** Deterministic local layout settings shared by one material population. */
export interface PopulationLayoutV1 {
  /** Standard authored preview or the fixed 1,000-instance stress surface. */
  readonly mode: "standard" | "stress-1000";
  /** Number of local cells along X and Z. */
  readonly extentCells: readonly [x: number, z: number];
  /** Cell side length in integer micrometres. */
  readonly cellSizeMicrometers: number;
  /** Versioned algorithm that maps cell and slot identity to local placement. */
  readonly layoutAlgorithm: "cell-slot-v1" | "stratified-jitter-v1" | "centered-pairs-v1";
}

interface PopulationTokenBaseV1 {
  readonly kind: "population";
  readonly schemaVersion: 1;
  readonly generatorVersion: 1;
  readonly category: AssetCategory;
  /** Globally versioned catalog identity; URLs are resolved outside the Token. */
  readonly catalogId: string;
  /** Globally versioned recipe or Prefab identity. */
  readonly assetId: string;
  /** Root source for independent named deterministic domains. */
  readonly rootSeed: number;
  readonly sizePercent: number;
  readonly colorRgb: AssetSeedColor;
  readonly lodProfile: PopulationLodProfileV1;
  readonly population: PopulationLayoutV1;
  readonly extensions: readonly PopulationTokenExtensionV1[];
}

/** One local tree population using a reusable authored base-tree recipe. */
export interface TreePopulationTokenV1 extends PopulationTokenBaseV1 {
  readonly category: "tree";
}

/** One local shrub population using complete authored Prefab LODs. */
export interface ShrubPopulationTokenV1 extends PopulationTokenBaseV1 {
  readonly category: "shrub";
}

/** One local grass population of complete plant atoms. */
export interface GrassPopulationTokenV1 extends PopulationTokenBaseV1 {
  readonly category: "grass";
}

/** One local flower population of complete plant atoms. */
export interface FlowerPopulationTokenV1 extends PopulationTokenBaseV1 {
  readonly category: "flower";
}

/** One local population of complete authored rock atoms. */
export interface RockPopulationTokenV1 extends PopulationTokenBaseV1 {
  readonly category: "rock";
}

/** Current local Population Token payload. */
export type PopulationTokenV1 =
  | TreePopulationTokenV1
  | ShrubPopulationTokenV1
  | GrassPopulationTokenV1
  | FlowerPopulationTokenV1
  | RockPopulationTokenV1;

/** Stable numeric identity used by all named generation domains. */
export interface PopulationInstanceKey {
  readonly category: AssetCategory;
  readonly localCellX: number;
  readonly localCellZ: number;
  readonly slot: number;
}

/** Independent deterministic streams compiled for every instance. */
export type PopulationSeedDomain = "layout" | "appearance" | "density-rank" | "animation";

/**
 * Encodes one validated local population into canonical JSON carried by Base64URL.
 * @param token Complete Population Token payload.
 * @returns Stable `pt1` Token without a runtime digest or binary dependency.
 * @throws If any field is missing, unsupported, or outside its declared range.
 */
export function encodePopulationToken(token: PopulationTokenV1): string {
  validatePopulationToken(token);
  return `${POPULATION_TOKEN_PREFIX}.${encodeBase64Url(encodeTerrainCanonicalJson(token))}`;
}

/**
 * Decodes and validates one canonical local Population Token.
 * @param token Complete `pt1` Token.
 * @returns Detached payload including unknown optional extension blocks.
 * @throws If the prefix, canonical JSON, category, version, or required extension is unsupported.
 */
export function decodePopulationToken(token: string): PopulationTokenV1 {
  const segments = token.trim().split(".");
  if (segments.length !== 2 || segments[0] !== POPULATION_TOKEN_PREFIX) {
    throw new Error(`Population Token must use ${POPULATION_TOKEN_PREFIX}.<canonical-json>`);
  }
  const bytes = decodeBase64Url(segments[1]);
  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Error("Population Token payload is not valid JSON", { cause: error });
  }
  if (!equalBytes(bytes, encodeTerrainCanonicalJson(value))) {
    throw new Error("Population Token payload is not canonical JSON");
  }
  const normalized = normalizePopulationToken(value);
  validatePopulationToken(normalized);
  return detachPopulationToken(normalized);
}

/**
 * Derives one named stream directly from the root and stable local instance identity.
 * @param rootSeed Unsigned 32-bit Token root.
 * @param domain Independent generation concern.
 * @param key Stable category, cell, and slot identity.
 * @returns Deterministic unsigned 32-bit stream seed.
 */
export function derivePopulationDomainSeed(
  rootSeed: number,
  domain: PopulationSeedDomain,
  key: PopulationInstanceKey
): number {
  validateInstanceKey(key);
  return derivePopulationDomainSeedForCoordinates(
    rootSeed,
    domain,
    key.category,
    key.localCellX,
    key.localCellZ,
    key.slot
  );
}

/**
 * Derives one named stream from scalar coordinates without allocating an instance-key object.
 * @param rootSeed Unsigned 32-bit Token root.
 * @param domain Independent generation concern.
 * @param category Stable material family.
 * @param localCellX Signed local Cell X.
 * @param localCellZ Signed local Cell Z.
 * @param slot Stable instance slot within the Cell.
 * @returns Deterministic unsigned 32-bit stream seed.
 */
export function derivePopulationDomainSeedForCoordinates(
  rootSeed: number,
  domain: PopulationSeedDomain,
  category: AssetCategory,
  localCellX: number,
  localCellZ: number,
  slot: number
): number {
  requireUint32(rootSeed, "rootSeed");
  validateInstanceKeyFields(category, localCellX, localCellZ, slot);
  let hash = mixUint32(0x811c9dc5, rootSeed);
  hash = hashString(hash, `population/v1/${domain}`);
  hash = hashString(hash, category);
  hash = mixUint32(hash, localCellX >>> 0);
  hash = mixUint32(hash, localCellZ >>> 0);
  return mixUint32(hash, slot >>> 0);
}

/**
 * Replaces only the deterministic root while preserving every explicit population parameter.
 * @param token Existing category Token.
 * @param rootSeed New unsigned 32-bit root.
 * @returns Detached Token with unchanged assets, appearance, density, and population controls.
 */
export function withPopulationRootSeed(token: PopulationTokenV1, rootSeed: number): PopulationTokenV1 {
  requireUint32(rootSeed, "rootSeed");
  return detachPopulationToken({ ...token, rootSeed } as PopulationTokenV1);
}

/** Creates a detached copy suitable for UI state ownership. */
export function detachPopulationToken(token: PopulationTokenV1): PopulationTokenV1 {
  return {
    ...token,
    colorRgb: [...token.colorRgb] as [number, number, number],
    lodProfile: { ...token.lodProfile, values: [...token.lodProfile.values] },
    population: {
      ...token.population,
      extentCells: [...token.population.extentCells] as [number, number]
    },
    extensions: token.extensions.map((extension) => ({
      ...extension,
      data: detachPopulationExtensionData(extension.data)
    })) as PopulationTokenExtensionV1[]
  } as PopulationTokenV1;
}

function detachPopulationExtensionData(value: unknown): unknown {
  if (isImmutableData(value)) return value;
  if (Array.isArray(value)) return value.map(detachPopulationExtensionData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, detachPopulationExtensionData(entry)]));
  }
  return value;
}

function validatePopulationToken(value: unknown): asserts value is PopulationTokenV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Population Token payload must be an object");
  }
  const token = value as Record<string, unknown>;
  if (token.kind !== "population" || token.schemaVersion !== 1 || token.generatorVersion !== 1) {
    throw new Error("Population Token kind, schemaVersion, or generatorVersion is unsupported");
  }
  if (!isAssetCategory(token.category)) throw new Error("Population Token category is unsupported");
  requireCatalogId(token.catalogId, "catalogId");
  requireAssetId(token.assetId, "assetId");
  requireUint32(token.rootSeed, "rootSeed");
  requireIntegerRange(token.sizePercent, ASSET_SIZE_PERCENT_MIN, ASSET_SIZE_PERCENT_MAX, "sizePercent");
  requireColor(token.colorRgb);
  validateLodProfile(token.lodProfile);
  validatePopulationLayout(token.population);
  validateExtensions(token.extensions);

  const commonKeys = [
    "kind",
    "schemaVersion",
    "generatorVersion",
    "category",
    "catalogId",
    "assetId",
    "rootSeed",
    "sizePercent",
    "colorRgb",
    "lodProfile",
    "population",
    "extensions"
  ];
  requireExactKeys(token, commonKeys);
}

function normalizePopulationToken(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const token = value as Record<string, unknown>;
  if (token.category === "tree" && "trunkAtomId" in token && "leafAtomId" in token) {
    requireAssetId(token.trunkAtomId, "trunkAtomId");
    requireAssetId(token.leafAtomId, "leafAtomId");
    const { trunkAtomId: _trunkAtomId, leafAtomId: _leafAtomId, ...normalized } = token;
    return normalized;
  }
  if (token.category === "shrub" && "layoutId" in token && "leafAtomId" in token) {
    requireAssetId(token.layoutId, "layoutId");
    requireAssetId(token.leafAtomId, "leafAtomId");
    const { layoutId: _layoutId, leafAtomId: _leafAtomId, ...normalized } = token;
    return normalized;
  }
  return value;
}

function validateLodProfile(value: unknown): asserts value is PopulationLodProfileV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Population Token lodProfile must be an object");
  }
  const profile = value as Record<string, unknown>;
  if (!Object.values(PopulationLodMetric).includes(profile.metric as PopulationLodMetric)) {
    throw new Error("Population Token LOD metric is unsupported");
  }
  if (!Array.isArray(profile.values) || profile.values.length === 0) {
    throw new Error("Population Token LOD profile must contain at least one value");
  }
  const maximum =
    profile.metric === PopulationLodMetric.DensityPercent
      ? 100
      : profile.metric === PopulationLodMetric.CountPerCell
        ? 255
        : 1000;
  const minimum = profile.metric === PopulationLodMetric.DensityPercent ? 1 : 0;
  profile.values.forEach((entry) => requireIntegerRange(entry, minimum, maximum, `LOD ${profile.metric}`));
  requireExactKeys(profile, ["metric", "values"]);
}

function validatePopulationLayout(value: unknown): asserts value is PopulationLayoutV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Population Token population must be an object");
  }
  const population = value as Record<string, unknown>;
  if (population.mode !== "standard" && population.mode !== "stress-1000") {
    throw new Error("Population Token mode is unsupported");
  }
  if (
    !Array.isArray(population.extentCells) ||
    population.extentCells.length !== 2 ||
    population.extentCells.some((entry) => !Number.isInteger(entry) || entry < 1 || entry > 1024)
  ) {
    throw new RangeError("Population Token extentCells must contain two integers within 1..1024");
  }
  requireIntegerRange(population.cellSizeMicrometers, 1, 0xffffffff, "cellSizeMicrometers");
  if (
    population.layoutAlgorithm !== "cell-slot-v1" &&
    population.layoutAlgorithm !== "stratified-jitter-v1" &&
    population.layoutAlgorithm !== "centered-pairs-v1"
  ) {
    throw new Error("Population Token layoutAlgorithm is unsupported");
  }
  requireExactKeys(population, ["mode", "extentCells", "cellSizeMicrometers", "layoutAlgorithm"]);
}

function validateExtensions(value: unknown): asserts value is readonly PopulationTokenExtensionV1[] {
  if (!Array.isArray(value)) throw new Error("Population Token extensions must be an array");
  const ids = new Set<string>();
  for (const extension of value) {
    if (!extension || typeof extension !== "object" || Array.isArray(extension)) {
      throw new Error("Population Token extension must be an object");
    }
    const record = extension as Record<string, unknown>;
    if (typeof record.id !== "string" || !/^[a-z0-9][a-z0-9./-]*$/u.test(record.id)) {
      throw new Error("Population Token extension id is invalid");
    }
    requireIntegerRange(record.version, 1, 0xffff, "extension version");
    if (typeof record.required !== "boolean") throw new Error("Population Token extension required flag is invalid");
    requireExactKeys(record, ["id", "version", "required", "data"]);
    if (ids.has(record.id)) throw new Error("Population Token contains duplicate extensions");
    if (record.required) throw new Error(`Population Token required extension "${record.id}" is unsupported`);
    encodeTerrainCanonicalJson(record.data);
    ids.add(record.id);
  }
}

function validateInstanceKey(key: PopulationInstanceKey): void {
  validateInstanceKeyFields(key.category, key.localCellX, key.localCellZ, key.slot);
}

function validateInstanceKeyFields(
  category: AssetCategory,
  localCellX: number,
  localCellZ: number,
  slot: number
): void {
  if (!isAssetCategory(category)) throw new Error("Population instance category is unsupported");
  validateInstanceCoordinate(localCellX, "localCellX");
  validateInstanceCoordinate(localCellZ, "localCellZ");
  validateInstanceCoordinate(slot, "slot");
}

function validateInstanceCoordinate(value: number, label: string): void {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new RangeError(`Population instance ${label} is outside the supported integer range`);
  }
}

function isAssetCategory(value: unknown): value is AssetCategory {
  return value === "tree" || value === "shrub" || value === "grass" || value === "flower" || value === "rock";
}

function requireCatalogId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9-]+\/catalog\/v\d+$/u.test(value)) {
    throw new Error(`Population Token ${label} must be a globally namespaced, versioned catalog id`);
  }
}

function requireAssetId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9-]+\/(tree|shrub|grass|flower|rock)\/[a-z0-9-]+\/v\d+$/u.test(value)) {
    throw new Error(`Population Token ${label} must be a globally namespaced, versioned asset id`);
  }
}

function requireColor(value: unknown): asserts value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Population Token colorRgb must contain three channels");
  }
  value.forEach((channel) => requireIntegerRange(channel, 0, 255, "colorRgb channel"));
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new Error("Population Token payload contains unsupported fields");
  }
}

function requireUint32(value: unknown, label: string): asserts value is number {
  requireIntegerRange(value, 0, 0xffffffff, label);
}

function requireIntegerRange(value: unknown, minimum: number, maximum: number, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`Population Token ${label} must be an integer within ${minimum}..${maximum}`);
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Population Token payload is not Base64URL");
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  } catch (error) {
    throw new Error("Population Token payload is not Base64URL", { cause: error });
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function hashString(seed: number, value: string): number {
  let hash = seed;
  for (let index = 0; index < value.length; index++) hash = mixUint32(hash, value.charCodeAt(index));
  return hash >>> 0;
}

function mixUint32(seed: number, value: number): number {
  let hash = seed ^ value;
  hash = Math.imul(hash, 0x01000193);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
