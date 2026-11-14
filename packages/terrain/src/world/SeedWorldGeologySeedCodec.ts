/** Stable keys exposed by the Seed World geology layout authoring UI. */
export type SeedWorldGeologyParameterKey =
  | "hillCount"
  | "clusterStrength"
  | "scaleContrast"
  | "heightContrast"
  | "edgeOccupancy"
  | "coastTransition"
  | "beltCount"
  | "beltAzimuth"
  | "beltLift"
  | "canyonCount"
  | "canyonAzimuth"
  | "canyonMeander"
  | "canyonWidth"
  | "tributaryDensity"
  | "orientationCoherence"
  | "heightScale";

/** Complete user-adjustable geology controls decoded from one composite Seed URL. */
export type SeedWorldGeologyParameters = Readonly<Record<SeedWorldGeologyParameterKey, number>>;

/** Stable mixed-radix slot assigned to one public geology control. */
export interface SeedWorldGeologyParameterDefinition {
  /** Stable field identity. Existing names and slots must never be reused with another meaning. */
  readonly key: SeedWorldGeologyParameterKey;
  /** Minimum value represented by this slot. */
  readonly minimum: number;
  /** Maximum value represented by this slot. */
  readonly maximum: number;
  /** Quantization interval represented in the URL. */
  readonly step: number;
  /** Frozen value used when an older URL predates this slot. */
  readonly defaultValue: number;
  /** Seed-derived variation around the frozen default when no explicit parameter code exists. */
  readonly seedVariation?: number;
  /** Seed-derived half-turn angular variation when no explicit parameter code exists. */
  readonly seedAngleVariation?: number;
}

/** One stable per-hill authoring edit encoded in the optional geology extension component. */
export interface SeedWorldGeologyHillEdit {
  /** Stable generated hill ordinal. */
  readonly hillId: number;
  /** Broad pedestal uplift in metres. */
  readonly baseLift?: number;
  /** Major radius of the broad influence support in metres. */
  readonly influenceMajor?: number;
  /** Local summit relief in metres. */
  readonly peakRelief?: number;
  /** Major radius of the local hill body in metres. */
  readonly bodyMajor?: number;
  /** Hill major-axis direction in degrees modulo 180. */
  readonly angleDegrees?: number;
}

/** Composite deterministic Seed state represented by independent URL components. */
export interface SeedWorldCompositeSeed {
  /** Unsigned geological entropy used for stable entity identities and bounded variation. */
  readonly geology: number;
  /** Fully resolved public geology controls. */
  readonly geologyParameters: SeedWorldGeologyParameters;
  /** Stable per-hill authoring edits; these remain geology semantics rather than rock transforms. */
  readonly geologyHillEdits: readonly SeedWorldGeologyHillEdit[];
  /** Unsigned hydrology component reserved for rainfall and water-volume variation. */
  readonly hydrology: number;
}

/** Query names owned by the extensible Seed World codec. */
export const SEED_WORLD_COMPOSITE_SEED_QUERY = Object.freeze({
  geology: "g",
  geologyParameters: "gp",
  geologyExtensions: "gx",
  hydrology: "h"
});

/** Low-order v1 Geology bits. The upper seven URL bits remain reserved and do not affect current worlds. */
export const SEED_WORLD_GEOLOGY_CORE_BITS = 25;

/** V1 Geology mask retained when future high-order extension bits gain a meaning. */
export const SEED_WORLD_GEOLOGY_CORE_MASK = 0x01ff_ffff;

/** Append-only mixed-radix mapping for public geology controls. */
export const SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS = Object.freeze<readonly SeedWorldGeologyParameterDefinition[]>([
  { key: "hillCount", minimum: 18, maximum: 64, step: 1, defaultValue: 34 },
  { key: "clusterStrength", minimum: 0, maximum: 100, step: 5, defaultValue: 65, seedVariation: 10 },
  { key: "scaleContrast", minimum: 0, maximum: 100, step: 5, defaultValue: 70, seedVariation: 8 },
  { key: "heightContrast", minimum: 0, maximum: 100, step: 5, defaultValue: 65, seedVariation: 10 },
  { key: "edgeOccupancy", minimum: 0, maximum: 100, step: 5, defaultValue: 55, seedVariation: 10 },
  { key: "coastTransition", minimum: 120, maximum: 720, step: 20, defaultValue: 360, seedVariation: 60 },
  { key: "beltCount", minimum: 1, maximum: 3, step: 1, defaultValue: 2 },
  { key: "beltAzimuth", minimum: 0, maximum: 175, step: 5, defaultValue: 35, seedAngleVariation: 18 },
  { key: "beltLift", minimum: 0, maximum: 180, step: 5, defaultValue: 70, seedVariation: 12 },
  { key: "canyonCount", minimum: 1, maximum: 5, step: 1, defaultValue: 2 },
  { key: "canyonAzimuth", minimum: 0, maximum: 175, step: 5, defaultValue: 110, seedAngleVariation: 24 },
  { key: "canyonMeander", minimum: 0, maximum: 100, step: 5, defaultValue: 65, seedVariation: 10 },
  { key: "canyonWidth", minimum: 160, maximum: 520, step: 20, defaultValue: 300, seedVariation: 35 },
  { key: "tributaryDensity", minimum: 0, maximum: 100, step: 5, defaultValue: 55, seedVariation: 10 },
  { key: "orientationCoherence", minimum: 0, maximum: 100, step: 5, defaultValue: 100, seedVariation: 8 },
  { key: "heightScale", minimum: 70, maximum: 180, step: 5, defaultValue: 100 }
]);

const SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS_V1 = Object.freeze(
  SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.map((definition) =>
    definition.key === "beltLift"
      ? Object.freeze({ ...definition, maximum: 140 })
      : definition.key === "heightScale"
        ? Object.freeze({ ...definition, maximum: 150 })
        : definition
  )
);
const GEOLOGY_PARAMETER_CODEC_VERSION = 2;
const HILL_EDIT_CODEC_VERSION = 1;
const UINT32_MAX = 0xffff_ffff;
const HILL_EDIT_FIELDS = Object.freeze([
  { key: "baseLift", minimum: 0, maximum: 220, step: 5 },
  { key: "influenceMajor", minimum: 300, maximum: 1_800, step: 20 },
  { key: "peakRelief", minimum: 30, maximum: 280, step: 5 },
  { key: "bodyMajor", minimum: 100, maximum: 900, step: 10 },
  { key: "angleDegrees", minimum: 0, maximum: 175, step: 5 }
] as const);

/**
 * Resolves the composite Seed URL without requiring every future parameter to fit one uint32.
 * @param query URL query containing optional g, gp, gx, and h components.
 * @param fallbackGeology Geological entropy used when g is absent or malformed.
 * @returns Immutable deterministic geology, resolved controls, local edits, and hydrology code.
 */
export function decodeSeedWorldCompositeSeed(query: URLSearchParams, fallbackGeology: number): SeedWorldCompositeSeed {
  const geology = parseUint32(query.get(SEED_WORLD_COMPOSITE_SEED_QUERY.geology)) ?? fallbackGeology >>> 0;
  const implicitParameters = deriveSeedWorldGeologyParameters(geology);
  const encodedParameters = query.get(SEED_WORLD_COMPOSITE_SEED_QUERY.geologyParameters);
  return Object.freeze({
    geology,
    geologyParameters: encodedParameters
      ? decodeGeologyParameters(encodedParameters, implicitParameters)
      : implicitParameters,
    geologyHillEdits: decodeHillEdits(query.get(SEED_WORLD_COMPOSITE_SEED_QUERY.geologyExtensions)),
    hydrology: parseUint32(query.get(SEED_WORLD_COMPOSITE_SEED_QUERY.hydrology)) ?? 0
  });
}

/**
 * Derives the default visible geology controls from geological entropy.
 * @param geology Unsigned geological entropy.
 * @returns Fully resolved controls shown by the UI before explicit edits are encoded.
 */
export function deriveSeedWorldGeologyParameters(geology: number): SeedWorldGeologyParameters {
  const coreSeed = seedWorldGeologyCoreSeed(geology);
  const parameters = {} as Record<SeedWorldGeologyParameterKey, number>;
  for (let index = 0; index < SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.length; index++) {
    const definition = SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS[index]!;
    const seedEnvelope = SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS_V1[index]!;
    let value = definition.defaultValue;
    if (definition.seedVariation !== undefined) {
      const normalizedTarget = clamp(
        (definition.defaultValue - seedEnvelope.minimum) / Math.max(1, seedEnvelope.maximum - seedEnvelope.minimum),
        0,
        1
      );
      const edgePreservation = 4 * normalizedTarget * (1 - normalizedTarget);
      value += signedHash(coreSeed, `resolved-${definition.key}`) * definition.seedVariation * edgePreservation;
    }
    if (definition.seedAngleVariation !== undefined) {
      value = wrapHalfTurnDegrees(
        definition.defaultValue + signedHash(coreSeed, `resolved-${definition.key}`) * definition.seedAngleVariation
      );
    }
    parameters[definition.key] = clamp(value, definition.minimum, definition.maximum);
  }
  return Object.freeze(parameters);
}

/**
 * Encodes every visible geology control into an append-only mixed-radix URL component.
 * @param parameters Fully resolved public geology controls.
 * @returns Versioned base36 component whose low slots preserve their meaning when new fields are appended.
 */
export function encodeSeedWorldGeologyParameters(parameters: SeedWorldGeologyParameters): string {
  let code = 0n;
  let multiplier = 1n;
  for (const definition of SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS) {
    const radix = BigInt(parameterRadix(definition));
    const index = BigInt(quantizeIndex(parameters[definition.key], definition));
    code += index * multiplier;
    multiplier *= radix;
  }
  return `${GEOLOGY_PARAMETER_CODEC_VERSION}-${SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.length}-${code.toString(36)}`;
}

/**
 * Encodes stable per-hill geology edits without exposing rock assets or transforms.
 * @param edits Sparse edits sorted by generated hill identity.
 * @returns Optional versioned base36 records suitable for the gx query component.
 */
export function encodeSeedWorldGeologyHillEdits(edits: readonly SeedWorldGeologyHillEdit[]): string | undefined {
  if (edits.length === 0) return undefined;
  const records = [...edits]
    .sort((left, right) => left.hillId - right.hillId)
    .map((edit) => {
      let mask = 0;
      let code = BigInt(edit.hillId);
      let multiplier = 64n;
      for (let index = 0; index < HILL_EDIT_FIELDS.length; index++) {
        const field = HILL_EDIT_FIELDS[index]!;
        const value = edit[field.key];
        if (value !== undefined) {
          mask |= 1 << index;
          code += BigInt(quantizeIndex(value, field)) * multiplier;
        }
        multiplier *= BigInt(parameterRadix(field));
      }
      return `${mask.toString(36)}.${code.toString(36)}`;
    });
  return `${HILL_EDIT_CODEC_VERSION}-${records.join("~")}`;
}

/**
 * Writes the complete composite Seed into an existing URL while retaining unrelated diagnostics.
 * @param currentUrl URL to clone.
 * @param seed Composite deterministic state to serialize.
 * @returns Detached URL containing g and h, plus gp/gx only when explicit control overrides exist.
 */
export function encodeSeedWorldCompositeSeedUrl(currentUrl: URL, seed: SeedWorldCompositeSeed): URL {
  const url = new URL(currentUrl);
  url.searchParams.set(SEED_WORLD_COMPOSITE_SEED_QUERY.geology, String(seed.geology >>> 0));
  if (sameGeologyParameters(seed.geologyParameters, deriveSeedWorldGeologyParameters(seed.geology))) {
    url.searchParams.delete(SEED_WORLD_COMPOSITE_SEED_QUERY.geologyParameters);
  } else {
    url.searchParams.set(
      SEED_WORLD_COMPOSITE_SEED_QUERY.geologyParameters,
      encodeSeedWorldGeologyParameters(seed.geologyParameters)
    );
  }
  const hillEdits = encodeSeedWorldGeologyHillEdits(seed.geologyHillEdits);
  if (hillEdits) url.searchParams.set(SEED_WORLD_COMPOSITE_SEED_QUERY.geologyExtensions, hillEdits);
  else url.searchParams.delete(SEED_WORLD_COMPOSITE_SEED_QUERY.geologyExtensions);
  url.searchParams.set(SEED_WORLD_COMPOSITE_SEED_QUERY.hydrology, String(seed.hydrology >>> 0));
  return url;
}

/**
 * Derives the legacy downstream planner identity without exposing Ecology, Road, or Detail subcodes.
 * @param seed Composite geology and Hydrology state.
 * @returns Packed uint32 consumed only by existing Hydrology, Population, and decoration compilers.
 */
export function deriveSeedWorldLinkedDownstreamSeed(seed: SeedWorldCompositeSeed): number {
  const coreSeed = seedWorldGeologyCoreSeed(seed.geology);
  const geologyCode = coreSeed & 0x3ff;
  const hydrologyCode = seed.hydrology & 0x7f;
  const ecologyCode = hash32(coreSeed, "linked-ecology") & 0x1f;
  const roadCode = hash32(coreSeed, "linked-road") & 0x7f;
  const detailCode = hash32(coreSeed, "linked-detail") & 0x07;
  return (geologyCode | (hydrologyCode << 10) | (ecologyCode << 17) | (roadCode << 22) | (detailCode << 29)) >>> 0;
}

/**
 * Resolves the stable low-order v1 Geology identity while leaving URL high bits available for later codecs.
 * @param geology Full unsigned value carried by the g query component.
 * @returns Low 25 bits consumed by current geology and linked downstream algorithms.
 */
export function seedWorldGeologyCoreSeed(geology: number): number {
  return (geology >>> 0) & SEED_WORLD_GEOLOGY_CORE_MASK;
}

function decodeGeologyParameters(encoded: string, fallback: SeedWorldGeologyParameters): SeedWorldGeologyParameters {
  const match = /^(\d+)-(\d+)-([0-9a-z]+)$/i.exec(encoded);
  if (!match) return fallback;
  const version = Number(match[1]);
  const definitions =
    version === 1
      ? SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS_V1
      : version === GEOLOGY_PARAMETER_CODEC_VERSION
        ? SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS
        : undefined;
  if (!definitions) return fallback;
  const encodedFieldCount = Math.min(Number(match[2]), definitions.length);
  let code = parseBase36BigInt(match[3]!);
  if (code === undefined) return fallback;
  const parameters = { ...fallback };
  for (let index = 0; index < encodedFieldCount; index++) {
    const definition = definitions[index]!;
    const radix = BigInt(parameterRadix(definition));
    const valueIndex = Number(code % radix);
    code /= radix;
    parameters[definition.key] = definition.minimum + valueIndex * definition.step;
  }
  return Object.freeze(parameters);
}

function decodeHillEdits(encoded: string | null): readonly SeedWorldGeologyHillEdit[] {
  if (!encoded) return Object.freeze([]);
  const separator = encoded.indexOf("-");
  if (separator < 0 || Number(encoded.slice(0, separator)) !== HILL_EDIT_CODEC_VERSION) return Object.freeze([]);
  const edits: SeedWorldGeologyHillEdit[] = [];
  for (const record of encoded.slice(separator + 1).split("~")) {
    const [maskText, codeText] = record.split(".");
    const mask = Number.parseInt(maskText ?? "", 36);
    let code = parseBase36BigInt(codeText ?? "");
    if (!Number.isInteger(mask) || code === undefined) continue;
    const hillId = Number(code % 64n);
    code /= 64n;
    const edit: Record<string, number> = { hillId };
    for (let index = 0; index < HILL_EDIT_FIELDS.length; index++) {
      const field = HILL_EDIT_FIELDS[index]!;
      const radix = BigInt(parameterRadix(field));
      if (mask & (1 << index)) edit[field.key] = field.minimum + Number(code % radix) * field.step;
      code /= radix;
    }
    edits.push(Object.freeze(edit) as unknown as SeedWorldGeologyHillEdit);
  }
  edits.sort((left, right) => left.hillId - right.hillId);
  return Object.freeze(edits);
}

function parameterRadix(definition: Readonly<{ minimum: number; maximum: number; step: number }>): number {
  return Math.round((definition.maximum - definition.minimum) / definition.step) + 1;
}

function sameGeologyParameters(left: SeedWorldGeologyParameters, right: SeedWorldGeologyParameters): boolean {
  return SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.every(({ key }) => left[key] === right[key]);
}

function quantizeIndex(
  value: number,
  definition: Readonly<{ minimum: number; maximum: number; step: number }>
): number {
  return Math.round((clamp(value, definition.minimum, definition.maximum) - definition.minimum) / definition.step);
}

function parseUint32(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= UINT32_MAX ? parsed >>> 0 : undefined;
}

function parseBase36BigInt(value: string): bigint | undefined {
  if (!/^[0-9a-z]+$/i.test(value)) return undefined;
  let result = 0n;
  for (const character of value.toLowerCase()) {
    const digit = BigInt(Number.parseInt(character, 36));
    result = result * 36n + digit;
  }
  return result;
}

function signedHash(seed: number, key: string): number {
  return (hash32(seed, key) / UINT32_MAX) * 2 - 1;
}

function hash32(seed: number, key: string): number {
  let hash = (seed ^ 0x9e37_79b9) >>> 0;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x85eb_ca6b) >>> 0;
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846c_a68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function wrapHalfTurnDegrees(value: number): number {
  return ((value % 180) + 180) % 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
