import { validateFireflySettings, type FireflySettings } from "./FireflyPopulation";
import { animalInteractionConfig, type AnimalInteractionConfig } from "./AnimalInteraction";

/** One initialization-only appearance candidate. Zero excludes it; positive weights express relative probability. */
export interface AnimalPopulationAppearance {
  appearanceId: string;
  weight: number;
}

/** An independently counted asset type, which may identify an age or body variant of one species. */
export interface AnimalPopulationType {
  typeId: string;
  /** Models of one species share a density field without sharing count or appearance streams. */
  densityGroup?: string;
  min: number;
  max: number;
  /** Optional host birth preference around its fixed player spawn; competes with habitat weights.
   * Initialization only. Omission/zero weight retains whole-map habitat sampling.
   */
  spawnPoint?: { weight: number; radius: number };
  /** Optional legacy fixed appearance; mutually exclusive with appearances. */
  appearanceId?: string;
  /** Per-instance weighted choices. The asset library expands omission to all registered appearances at weight 1. */
  appearances?: AnimalPopulationAppearance[];
}

/** Whole-map placement domain; noise affects births only, never per-frame steering. */
export interface AnimalPopulationDistribution {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Smooth density patch size in metres. */
  noiseScale: number;
  /** 0 = uniform; 1 = strongly clustered, with a nonzero background density. */
  noiseStrength: number;
}

/** Serializable population intent. All distances are horizontal metres in the host world. */
export interface AnimalPopulationConfig {
  version: 2;
  /** Optional procedural ambient animals; does not consume animated-species quotas. */
  fireflies?: FireflySettings;
  /** Local player reactions and farm feeding; sparse legacy saves inherit shared defaults. */
  interaction?: Partial<AnimalInteractionConfig>;
  /** When present, replaces legacy circular spawn/roaming ranges. */
  distribution?: AnimalPopulationDistribution;
  enabled: boolean;
  /** Legacy circular birth radius; ignored when distribution supplies a whole-map domain. */
  spawnRadius: number;
  /** Legacy circular movement radius; ignored when distribution supplies a whole-map domain. */
  roamRadius: number;
  /** Loading/render distance from the current observer. Host simulation hysteresis may extend beyond it. */
  activationDistance: number;
  /** Counts are inclusive integer intervals. min=max=0 disables one type. */
  types: AnimalPopulationType[];
}

/** A position in the host world's coordinate system, measured in metres. */
export interface AnimalPopulationPosition {
  x: number;
  y: number;
  z: number;
}

/** One deterministic birth, without renderer, prefab or runtime animation state. */
export interface AnimalPopulationInstance {
  id: string;
  typeId: string;
  appearanceId?: string;
  position: AnimalPopulationPosition;
  /** Resolved supported birth medium; omitted retains the asset registration default. */
  medium?: "ground" | "air" | "water";
  /** Initial world yaw in radians. */
  heading: number;
  /** Independent deterministic stream seed for this animal's autonomous behavior. */
  seed: number;
}

/** A reproducible position attempt. Returning no position rejects this attempt without changing the allowed area. */
export interface AnimalPopulationPlacement {
  id: string;
  typeId: string;
  /** Selected once before any placement attempts; retries cannot reroll an appearance. */
  appearanceId?: string;
  /** Uniform-disk candidate around the configured origin, in horizontal world metres. */
  position: { x: number; z: number };
  /** Zero-based placement attempt index. */
  attempt: number;
  /** Local random stream in [0,1), independent of other types and placement attempts. */
  random: () => number;
}

/** An unsuccessful request; sampling exhaustion does not assert that the world has no feasible position. */
export interface AnimalPopulationDiagnostic {
  code: "placement-budget-exhausted";
  id?: string;
  typeId?: string;
  attempts: number;
  message: string;
}

/** Rebuildable population output. Save config and world seed rather than this derived placement list. */
export interface AnimalPopulationPlan {
  animals: AnimalPopulationInstance[];
  requestedCount: number;
  diagnostics: AnimalPopulationDiagnostic[];
}

/** Host geometry and terrain queries remain outside the shared population algorithm. */
export interface AnimalPopulationOptions {
  seed: number | string;
  /** Fixed world spawn; both birth and roaming radii use this center. */
  origin: { x: number; z: number };
  config: AnimalPopulationConfig;
  /** Ground one candidate, rejecting unsuitable or occupied positions with undefined.
   * Any adjusted return position is revalidated against spawnRadius by the planner.
   */
  samplePosition: (
    placement: AnimalPopulationPlacement
  ) => (AnimalPopulationPosition & { medium?: "ground" | "air" | "water" }) | undefined;
  /** Optional cheap habitat proposal. Density is evaluated at this final candidate before collision checks. */
  sampleCandidate?: (placement: AnimalPopulationPlacement) => { x: number; z: number } | undefined;
  /** Finite work budget per requested animal, default 64. Exhaustion is reported without expanding its habitat. */
  maxPlacementAttempts?: number;
}

/**
 * Create defaults: one animal per registered type, birth radius 120m, roaming radius 160m, activation distance 160m.
 * @param typeIds Stable registered body-type identifiers.
 * @returns A fresh config without references to the input array.
 * @throws If type identifiers are empty or duplicated.
 */
export function createAnimalPopulationConfig(typeIds: readonly string[]): AnimalPopulationConfig {
  const config: AnimalPopulationConfig = {
    version: 2,
    enabled: true,
    spawnRadius: 120,
    roamRadius: 160,
    activationDistance: 160,
    types: typeIds.map((typeId) => ({ typeId, min: 1, max: 1 }))
  };
  validateAnimalPopulationConfig(config);
  return config;
}

/**
 * Validate authored population parameters without coercing or silently repairing them.
 * @param config Serialized population intent.
 * @throws For invalid identifiers, counts, metre distances, versions, or a birth area larger than the roaming area.
 */
export function validateAnimalPopulationConfig(config: AnimalPopulationConfig): void {
  if (!config || config.version !== 2 || typeof config.enabled !== "boolean" || !Array.isArray(config.types)) {
    throw new Error("动物分布配置版本、启用状态或类型列表无效");
  }
  animalInteractionConfig(config.interaction);
  if (config.fireflies) validateFireflySettings(config.fireflies);
  for (const field of ["spawnRadius", "roamRadius", "activationDistance"] as const) {
    if (!Number.isFinite(config[field]) || config[field] <= 0) {
      throw new Error(`${field} 必须为正的有限米数`);
    }
  }
  if (!config.distribution && config.spawnRadius > config.roamRadius) {
    throw new Error("spawnRadius 不得大于 roamRadius：动物出生位置必须在活动范围内");
  }
  const area = config.distribution;
  if (
    area &&
    (![area.minX, area.maxX, area.minZ, area.maxZ, area.noiseScale, area.noiseStrength].every(Number.isFinite) ||
      area.minX >= area.maxX ||
      area.minZ >= area.maxZ ||
      area.noiseScale <= 0 ||
      area.noiseStrength < 0 ||
      area.noiseStrength > 1)
  )
    throw new Error("全图分布需要有效边界、正噪声尺度和 0–1 聚集强度");
  const ids = new Set<string>();
  for (const type of config.types) {
    if (!type || typeof type.typeId !== "string" || !type.typeId.trim() || ids.has(type.typeId)) {
      throw new Error("动物 typeId 必须为非空且唯一的注册标识");
    }
    ids.add(type.typeId);
    if (
      type.spawnPoint &&
      (!Number.isFinite(type.spawnPoint.weight) ||
        type.spawnPoint.weight < 0 ||
        !Number.isFinite(type.spawnPoint.radius) ||
        type.spawnPoint.radius <= 0)
    )
      throw new Error(`${type.typeId} 的出生点权重须为非负有限数，半径须为正的有限米数`);
    if (type.densityGroup !== undefined && (typeof type.densityGroup !== "string" || !type.densityGroup.trim()))
      throw new Error(`${type.typeId} 的 densityGroup 必须为非空物种标识`);
    if (!Number.isSafeInteger(type.min) || !Number.isSafeInteger(type.max) || type.min < 0 || type.max < type.min) {
      throw new Error(`${type.typeId} 的 min/max 必须为非负整数且 min <= max`);
    }
    if (type.appearanceId !== undefined && (typeof type.appearanceId !== "string" || !type.appearanceId.trim())) {
      throw new Error(`${type.typeId} 的 appearanceId 必须为非空注册标识`);
    }
    if (type.appearances !== undefined) {
      if (type.appearanceId !== undefined || !Array.isArray(type.appearances) || !type.appearances.length)
        throw new Error(`${type.typeId} 的 appearances 必须为非空候选列表，且不能同时指定 appearanceId`);
      const appearances = new Set<string>();
      for (const choice of type.appearances) {
        if (
          !choice ||
          typeof choice.appearanceId !== "string" ||
          !choice.appearanceId.trim() ||
          appearances.has(choice.appearanceId) ||
          !Number.isFinite(choice.weight) ||
          choice.weight < 0
        )
          throw new Error(`${type.typeId} 的 appearances 标识必须唯一，weight 必须为非负有限数`);
        appearances.add(choice.appearanceId);
      }
      if (!type.appearances.some((choice) => choice.weight > 0))
        throw new Error(`${type.typeId} 的 appearances 至少需要一个正权重`);
    }
  }
}

/**
 * Derive deterministic births from a world seed and named type/instance streams.
 * @param options Population intent plus authoritative host geometry queries.
 * @returns Accepted births, exact requested count and diagnostics for every unplaced animal.
 * @throws If config, seed or placement budget is invalid. No input config or origin is modified.
 */
export function planAnimalPopulation(options: AnimalPopulationOptions): AnimalPopulationPlan {
  const { config, seed, origin } = options;
  validateAnimalPopulationConfig(config);
  if (
    (typeof seed !== "number" && typeof seed !== "string") ||
    (typeof seed === "number" && !Number.isFinite(seed)) ||
    (typeof seed === "string" && !seed.length)
  ) {
    throw new Error("动物分布需要有效的世界 seed");
  }
  const budget = options.maxPlacementAttempts ?? (config.distribution ? 512 : 64);
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("动物落点采样预算必须为正整数");
  const result: AnimalPopulationPlan = {
    animals: [],
    requestedCount: 0,
    diagnostics: []
  };
  if (!config.enabled) return result;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) {
    throw new Error("动物分布出生中心必须为有限米制坐标");
  }
  const spawnRadiusSquared = config.spawnRadius * config.spawnRadius;
  const requestedTypes = [...config.types]
    .sort((a, b) => compareIds(a.typeId, b.typeId))
    .map((type) => ({
      type,
      appearances: type.appearances
        ?.filter((choice) => choice.weight > 0)
        .sort((a, b) => compareIds(a.appearanceId, b.appearanceId)),
      count: type.min + Math.floor(randomStream(seed, ["count", type.typeId])() * (type.max - type.min + 1))
    }));
  result.requestedCount = requestedTypes.reduce((sum, { count }) => sum + count, 0);
  if (!result.requestedCount) return result;
  for (const { type, count, appearances } of requestedTypes) {
    // Scale before summing so arbitrary finite author weights cannot overflow the total.
    const maximumWeight = appearances?.reduce((max, choice) => Math.max(max, choice.weight), 0) ?? 1;
    const totalWeight = appearances?.reduce((sum, choice) => sum + choice.weight / maximumWeight, 0) ?? 0;
    for (let index = 0; index < count; index++) {
      const id = `animal:${encodeURIComponent(type.typeId)}:${index}`;
      let appearanceId = type.appearanceId;
      if (appearances) {
        let remaining = randomStream(seed, ["appearance", type.typeId, String(index)])() * totalWeight;
        appearanceId = appearances[appearances.length - 1].appearanceId;
        for (const choice of appearances) {
          remaining -= choice.weight / maximumWeight;
          if (remaining < 0) {
            appearanceId = choice.appearanceId;
            break;
          }
        }
      }
      let position: AnimalPopulationPosition | undefined;
      let medium: AnimalPopulationInstance["medium"];
      let attempts = 0;
      for (; attempts < budget; attempts++) {
        const random = randomStream(seed, ["position", type.typeId, String(index), String(attempts)]);
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * config.spawnRadius;
        const area = config.distribution;
        const point = area
          ? { x: area.minX + random() * (area.maxX - area.minX), z: area.minZ + random() * (area.maxZ - area.minZ) }
          : { x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius };
        const placement: AnimalPopulationPlacement = {
          id,
          typeId: type.typeId,
          appearanceId,
          position: point,
          attempt: attempts,
          random
        };
        const proposed = options.sampleCandidate ? options.sampleCandidate(placement) : point;
        if (!proposed) continue;
        if (
          area &&
          random() > animalPopulationDensity(seed, type.densityGroup ?? type.typeId, proposed.x, proposed.z, area)
        )
          continue;
        const candidate = options.samplePosition({ ...placement, position: proposed });
        if (
          candidate &&
          Number.isFinite(candidate.x) &&
          Number.isFinite(candidate.y) &&
          Number.isFinite(candidate.z) &&
          (area
            ? candidate.x >= area.minX &&
              candidate.x <= area.maxX &&
              candidate.z >= area.minZ &&
              candidate.z <= area.maxZ
            : (candidate.x - origin.x) ** 2 + (candidate.z - origin.z) ** 2 <= spawnRadiusSquared)
        ) {
          position = { x: candidate.x, y: candidate.y, z: candidate.z };
          medium = candidate.medium;
          break;
        }
      }
      if (position) {
        result.animals.push({
          id,
          typeId: type.typeId,
          ...(appearanceId !== undefined ? { appearanceId } : {}),
          position,
          ...(medium ? { medium } : {}),
          heading: randomStream(seed, ["heading", type.typeId, String(index)])() * Math.PI * 2,
          seed: streamSeed(seed, ["behavior", type.typeId, String(index)])
        });
      } else {
        result.diagnostics.push({
          code: "placement-budget-exhausted",
          id,
          typeId: type.typeId,
          attempts,
          message: `${type.typeId} 在出生半径内经过 ${attempts} 次采样仍未找到有效落点；保留未达数量，不扩大活动范围`
        });
      }
    }
  }
  return result;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function streamSeed(seed: number | string, path: readonly string[]): number {
  const key = JSON.stringify([seed, "animal-population-v2", ...path]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function randomStream(seed: number | string, path: readonly string[]): () => number {
  let state = streamSeed(seed, path);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Seeded smooth density field. Independent species streams create overlapping but distinct patches. */
export function animalPopulationDensity(
  seed: string | number,
  species: string,
  x: number,
  z: number,
  area: Pick<AnimalPopulationDistribution, "noiseScale" | "noiseStrength">
): number {
  const px = x / area.noiseScale,
    pz = z / area.noiseScale;
  const ix = Math.floor(px),
    iz = Math.floor(pz);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const u = smooth(px - ix),
    v = smooth(pz - iz);
  const corner = (dx: number, dz: number) =>
    randomStream(seed, ["density", species, String(ix + dx), String(iz + dz)])();
  const n = (corner(0, 0) * (1 - u) + corner(1, 0) * u) * (1 - v) + (corner(0, 1) * (1 - u) + corner(1, 1) * u) * v;
  return 1 - area.noiseStrength + area.noiseStrength * (0.05 + 0.95 * n ** 3);
}
