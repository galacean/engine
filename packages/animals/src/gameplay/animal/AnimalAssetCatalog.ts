/** Metre-space source bounds, covering the authored model or an animation envelope. */
export interface AnimalAssetBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** A real source clip, with application-owned playback settings; no inferred gameplay role. */
export interface AnimalAssetAnimation {
  id: string;
  clip: string;
  loop: boolean;
  bounds: AnimalAssetBounds;
  /** Inspection label; registered semantic labels replace raw source names when available. */
  label?: string;
  /** Non-destructive source time range in seconds. */
  range?: [number, number];
  /** Full source clip duration in seconds, used before loading animation resources. */
  duration?: number;
  /** Local movement speed in metres/second; only set after checking the source motion. */
  speed?: number;
  /** Authored playback pace multiplier, default 1; locomotion travel scales with it to preserve stride length. */
  playbackRate?: number;
  /** Height above the ground, e.g. for confirmed flight clips. */
  altitude?: number;
  /** Seconds of simulation time to blend into this action; overrides the asset default. */
  transitionSeconds?: number;
  /** Hops keep their authored flight time; walking normally follows travelled distance. */
  cadence?: "distance" | "time";
  /** Audited contact phase, in source seconds, to start/end a cyclic one-shot on the ground. */
  cycleStartTime?: number;
}

/** A matching-rig appearance, loaded on demand into the same preview actor slot. */
export interface AnimalAssetAppearance {
  id: string;
  label: string;
  modelUrl: string;
  source: string;
  bytes: number;
  triangles: number;
  vertices: number;
  dimensions: number[];
}

/** Application asset binding above AnimalSystem; species names and model paths stay here. */
export interface AnimalAssetConfig {
  id: string;
  name: string;
  family: string;
  aliases: string[];
  modelUrl: string;
  scale: number;
  note: string;
  /** Authored model bounds in its reference pose; min Y anchors ground height independently of animated envelopes. */
  bounds: AnimalAssetBounds;
  animations: AnimalAssetAnimation[];
  initialAnimation: string;
  /** Instance-only material corrections; shared resources are never mutated. */
  materials?: { name: string; opaque?: boolean; doubleSided?: boolean }[];
  /** Authored heading correction in degrees, relative to the actor's +Z movement direction. */
  yaw?: number;
  /** Water surface above the grounded model origin, in unscaled source metres. */
  waterline?: number;
  /** Flying turns retain cruise motion; these limits do not affect ground or water gaits. */
  flightSteering?: { maxAngularSpeed: number; turnSpeedRatio: number; arrivalRadius?: number };
  /** Optional animated source node whose horizontal root motion is replaced by the behavior. */
  rootMotionNode?: string;
  /** Audited unweighted structural joint with static per-clip bases; normalize these before blending. */
  animationBasisNode?: string;
  /** Blend into a different action, in seconds. Omitted means 1 second. */
  transitionSeconds?: number;
  /** Named application behavior registration; independent of the source animation names. */
  behaviorProfile: string;
  /** Optional equivalent-rig variants; all clips and calibration must match this registration. */
  appearances?: AnimalAssetAppearance[];
}

/** Versioned, JSON-serializable animal resource catalog; excludes static models. */
export interface AnimalAssetCatalog {
  version: 1;
  animals: AnimalAssetConfig[];
}

/**
 * Validate application configuration before loading any GLB or modifying a scene.
 * @param value Parsed JSON; unknown capabilities and invalid bounds fail at the boundary.
 * @returns A catalog whose ids, clips, initial bindings and behavior references are valid.
 */
export function readAnimalAssetCatalog(value: unknown): AnimalAssetCatalog {
  const document = value as AnimalAssetCatalog;
  if (document?.version !== 1 || !Array.isArray(document.animals)) throw new Error("Invalid animal asset catalog");
  const ids = new Set<string>();
  const checkBounds = (bounds: AnimalAssetBounds): void => {
    if (
      !bounds ||
      ![bounds.min, bounds.max].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) ||
      bounds.min.some((v, i) => v > bounds.max[i])
    )
      throw new Error("Invalid animal asset bounds");
  };
  for (const animal of document.animals) {
    if (!animal || typeof animal.id !== "string" || !animal.id || ids.has(animal.id))
      throw new Error("Invalid or duplicate animal id");
    ids.add(animal.id);
    if (
      ![animal.name, animal.family, animal.modelUrl].every((v) => typeof v === "string" && v.length > 0) ||
      !isAnimalResourceUrl(animal.modelUrl) ||
      !Number.isFinite(animal.scale) ||
      animal.scale <= 0 ||
      !Array.isArray(animal.aliases) ||
      !animal.aliases.every((v) => typeof v === "string" && v.length > 0) ||
      typeof animal.behaviorProfile !== "string" ||
      !animal.behaviorProfile ||
      !Array.isArray(animal.animations) ||
      !animal.animations.length
    )
      throw new Error(`Invalid animal binding: ${animal.id}`);
    checkBounds(animal.bounds);
    if (animal.waterline !== undefined && (!Number.isFinite(animal.waterline) || animal.waterline < 0))
      throw new Error(`Invalid animal waterline: ${animal.id}`);
    if (
      animal.flightSteering &&
      (!Number.isFinite(animal.flightSteering.maxAngularSpeed) ||
        animal.flightSteering.maxAngularSpeed <= 0 ||
        !Number.isFinite(animal.flightSteering.turnSpeedRatio) ||
        animal.flightSteering.turnSpeedRatio < 0 ||
        animal.flightSteering.turnSpeedRatio > 1 ||
        (animal.flightSteering.arrivalRadius !== undefined &&
          (!Number.isFinite(animal.flightSteering.arrivalRadius) || animal.flightSteering.arrivalRadius <= 0)))
    )
      throw new Error(`Invalid animal flight steering: ${animal.id}`);
    if (
      animal.transitionSeconds !== undefined &&
      (!Number.isFinite(animal.transitionSeconds) || animal.transitionSeconds < 0)
    )
      throw new Error(`Invalid animal transition seconds: ${animal.id}`);
    if (
      animal.animationBasisNode !== undefined &&
      (typeof animal.animationBasisNode !== "string" || !animal.animationBasisNode.trim())
    )
      throw new Error(`Invalid animal animation basis: ${animal.id}`);
    if (animal.appearances) {
      const ids = new Set<string>();
      for (const appearance of animal.appearances) {
        if (
          !appearance.id ||
          ids.has(appearance.id) ||
          !appearance.label ||
          !isAnimalResourceUrl(appearance.modelUrl) ||
          ![appearance.bytes, appearance.triangles, appearance.vertices].every((v) => Number.isFinite(v) && v >= 0) ||
          appearance.dimensions.length !== 3 ||
          !appearance.dimensions.every((v) => Number.isFinite(v) && v >= 0)
        )
          throw new Error(`Invalid appearance: ${animal.id}`);
        ids.add(appearance.id);
      }
    }
    const animationIds = new Set<string>();
    for (const animation of animal.animations) {
      if (
        !animation ||
        typeof animation.id !== "string" ||
        !animation.id ||
        animationIds.has(animation.id) ||
        typeof animation.clip !== "string" ||
        !animation.clip ||
        typeof animation.loop !== "boolean"
      )
        throw new Error(`Invalid animation binding: ${animal.id}`);
      animationIds.add(animation.id);
      checkBounds(animation.bounds);
      if (
        (animation.range &&
          (!Array.isArray(animation.range) ||
            animation.range.length !== 2 ||
            !animation.range.every(Number.isFinite) ||
            animation.range[0] < 0 ||
            animation.range[1] <= animation.range[0])) ||
        (animation.duration !== undefined &&
          (!Number.isFinite(animation.duration) ||
            animation.duration <= 0 ||
            (animation.range !== undefined && animation.range[1] > animation.duration + 0.001))) ||
        (animation.speed !== undefined && (!Number.isFinite(animation.speed) || animation.speed < 0)) ||
        (animation.playbackRate !== undefined &&
          (!Number.isFinite(animation.playbackRate) || animation.playbackRate <= 0)) ||
        (animation.altitude !== undefined && (!Number.isFinite(animation.altitude) || animation.altitude < 0)) ||
        (animation.transitionSeconds !== undefined &&
          (!Number.isFinite(animation.transitionSeconds) || animation.transitionSeconds < 0)) ||
        (animation.cadence !== undefined && !["distance", "time"].includes(animation.cadence)) ||
        (animation.cycleStartTime !== undefined &&
          (!Number.isFinite(animation.cycleStartTime) ||
            !animation.range ||
            animation.cycleStartTime < animation.range[0] ||
            animation.cycleStartTime >= animation.range[1]))
      )
        throw new Error(`Invalid animation range or motion: ${animal.id}`);
    }
    if (!animationIds.has(animal.initialAnimation)) throw new Error(`Missing initial animation: ${animal.id}`);
  }
  return document;
}

/** Conservative ground disc covering all registered sampled animation envelopes around the calibrated idle origin. */
export function animalCollisionRadius(config: AnimalAssetConfig): number {
  const idle = config.animations.find((a) => a.id === config.initialAnimation)!.bounds;
  const cx = (idle.min[0] + idle.max[0]) / 2,
    cz = (idle.min[2] + idle.max[2]) / 2;
  return (
    Math.max(
      0.12,
      ...config.animations.map(({ bounds }) =>
        Math.hypot(
          Math.max(Math.abs(bounds.min[0] - cx), Math.abs(bounds.max[0] - cx)),
          Math.max(Math.abs(bounds.min[2] - cz), Math.abs(bounds.max[2] - cz))
        )
      )
    ) *
      config.scale +
    0.08
  );
}

// CDN objects need no extension: the asset library explicitly selects AssetType.GLTF.
function isAnimalResourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return !/^[a-z][a-z0-9+.-]*:/i.test(value) && /\.glb(?:[?#]|$)/i.test(value);
  }
}
