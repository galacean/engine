/** The three geometry levels; null means no renderer submission. */
export type AnimalLodLevel = 0 | 1 | 2 | null;

/** Screen-relative skeletal animation frequency LOD settings (global default + per-template override). */
export interface AnimalAnimationLodConfig {
  /** Whether screen-coverage skeletal animation frequency decimation is enabled. */
  enabled: boolean;
  /** Strictly decreasing screen-height ratio thresholds [LOD0, LOD1, LOD2] (e.g. [0.12, 0.06, 0.03]). */
  screenRelativeTransitionHeights: readonly [number, number, number];
  /** Target skeletal evaluation rates in Hz for [LOD0, LOD1, LOD2, below-LOD2] (e.g. [30, 15, 10, 7.5]). */
  ratesHz: readonly [number, number, number, number];
}

/** Global defaults for screen-relative animal skeletal animation LOD. */
export const DEFAULT_ANIMAL_ANIMATION_LOD: Readonly<AnimalAnimationLodConfig> = Object.freeze({
  enabled: true,
  screenRelativeTransitionHeights: Object.freeze([0.12, 0.06, 0.03] as const),
  ratesHz: Object.freeze([30, 15, 10, 7.5] as const)
});

/** Resolve and validate sparse global or per-template animal animation LOD settings. */
export function animalAnimationLodConfig(input?: Partial<AnimalAnimationLodConfig>): AnimalAnimationLodConfig {
  const enabled = input?.enabled ?? DEFAULT_ANIMAL_ANIMATION_LOD.enabled;
  const heights =
    input?.screenRelativeTransitionHeights ?? DEFAULT_ANIMAL_ANIMATION_LOD.screenRelativeTransitionHeights;
  const rates = input?.ratesHz ?? DEFAULT_ANIMAL_ANIMATION_LOD.ratesHz;
  if (
    typeof enabled !== "boolean" ||
    !Array.isArray(heights) ||
    heights.length !== 3 ||
    !heights.every((v) => Number.isFinite(v) && v > 0 && v <= 1) ||
    !(heights[0] > heights[1] && heights[1] > heights[2])
  ) {
    throw new Error("Invalid animal animation LOD screenRelativeTransitionHeights");
  }
  if (!Array.isArray(rates) || rates.length !== 4 || !rates.every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error("Invalid animal animation LOD ratesHz");
  }
  return {
    enabled,
    screenRelativeTransitionHeights: [heights[0], heights[1], heights[2]],
    ratesHz: [rates[0], rates[1], rates[2], rates[3]]
  };
}

/** Convert a selected screen-coverage LOD level to a fixed-step skeletal update stride (1 = full baseHz). */
export function animalAnimationLodStride(
  level: AnimalLodLevel,
  config: Readonly<AnimalAnimationLodConfig>,
  baseHz = 30
): number {
  if (!config.enabled) return 1;
  const hz = config.ratesHz[level ?? 3];
  return Math.max(1, Math.round(baseHz / hz));
}

/**
 * Select one of three screen-relative LODs with 15% hysteresis around transitions.
 * @param height Projected reference diameter divided by viewport height.
 * @param thresholds Strictly decreasing LOD0/1/2 thresholds; below LOD2 is culled.
 * @param previous Previously selected level, or null when culled.
 * @returns Stable geometry level; behavior and simulation are unaffected.
 */
export function selectAnimalLod(
  height: number,
  thresholds: readonly [number, number, number],
  previous: AnimalLodLevel
): AnimalLodLevel {
  if (!Number.isFinite(height) || height < 0)
    throw new RangeError("Animal projected size must be finite and nonnegative");
  let index = previous ?? 3;
  while (index > 0 && height >= thresholds[index - 1] * 1.15) index--;
  while (index < 3 && height < thresholds[index] * 0.85) index++;
  return index === 3 ? null : (index as 0 | 1 | 2);
}

/**
 * Project a fixed metre-sized reference diameter; wing flapping never changes the LOD reference size.
 * @param size World-space diameter in metres.
 * @param distance Distance to the camera in metres.
 * @param verticalFov Camera vertical field of view in degrees.
 * @param orthographicSize Optional orthographic half-height in metres.
 * @returns Fraction of viewport height, independent of rendering resolution.
 */
export function projectAnimalSize(
  size: number,
  distance: number,
  verticalFov: number,
  orthographicSize?: number
): number {
  if (orthographicSize !== undefined) return size / (2 * orthographicSize);
  return size / (2 * Math.max(distance, 1e-6) * Math.tan((verticalFov * Math.PI) / 360));
}

/** Model-owned renderer selection shared by roaming and companion presentation. */
export class AnimalModelLod {
  private readonly _renderers: MeshRenderer[][];
  private readonly _shadows = new Map<MeshRenderer, boolean>();
  private _level: AnimalLodLevel = 0;

  /**
   * Bind three disjoint renderer hierarchies without owning their meshes or materials.
   * @param model Instantiated GLB root whose transform includes the asset's metre calibration.
   * @param profile Fixed projection reference and exact LOD child names.
   */
  constructor(
    private readonly model: Entity,
    private readonly profile: AnimalLodProfile
  ) {
    if (profile.roots.length !== 3) throw new Error("Animal model requires three LOD roots");
    const assigned = new Set<MeshRenderer>();
    this._renderers = profile.roots.map((name) => {
      const root = model.findByName(name);
      if (!root) throw new Error(`Missing animal LOD root: ${name}`);
      const selected: MeshRenderer[] = [];
      root.getComponentsIncludeChildren(MeshRenderer, selected);
      if (!selected.length) throw new Error(`Empty animal LOD root: ${name}`);
      for (const renderer of selected) {
        if (assigned.has(renderer)) throw new Error("Animal LOD roots must not overlap");
        assigned.add(renderer);
        this._shadows.set(renderer, renderer.castShadows);
      }
      return selected;
    });
    const all: MeshRenderer[] = [];
    model.getComponentsIncludeChildren(MeshRenderer, all);
    if (assigned.size !== all.length) throw new Error("Every animal renderer must belong to exactly one LOD");
    this._apply();
  }

  /** Select geometry using a host-supplied projection; simulation state remains untouched. */
  updateProjectedHeight(height: number): void {
    const level = selectAnimalLod(height, this.profile.screenRelativeTransitionHeights, this._level);
    if (level !== this._level) {
      this._level = level;
      this._apply();
    }
  }

  /** Account for the actual model transform, camera projection and shared distance multiplier. */
  updateCamera(camera: Camera, distanceScale = 1): void {
    const scale = this.model.transform.lossyWorldScale;
    const size = this.profile.size * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    const distance = Vector3.distance(this.model.transform.worldPosition, camera.entity.transform.worldPosition);
    this.updateProjectedHeight(
      projectAnimalSize(
        size,
        distance,
        camera.fieldOfView,
        camera.isOrthographic ? camera.orthographicSize : undefined
      ) * distanceScale
    );
  }

  private _apply(): void {
    for (let level = 0; level < this._renderers.length; level++) {
      for (const renderer of this._renderers[level]) {
        renderer.enabled = level === this._level;
        renderer.castShadows = level < 2 && this._shadows.get(renderer)!;
      }
    }
  }
}
import { Camera, Entity, MeshRenderer, Vector3 } from "@galacean/engine";
import type { AnimalLodProfile } from "./AnimalSpeciesAsset";
