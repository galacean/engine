import { createWaterSurfaceSample } from "@galacean/engine-water/water/runtime/index";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { bridgeGround } from "../hydrology/RiverCrossings";
import type { PlanningWaterRuntime } from "./PlanningWaterRuntime";
import type { AnimalWorldBounds, PlanningAnimalWorldChange } from "./PlanningAnimalWorldChange";

type NavigationWaterSource = Pick<PlanningWaterRuntime, "sampleSurface"> &
  Partial<Pick<PlanningWaterRuntime, "hasWaterInBounds" | "staticNavigationWater" | "navigationWaterRevision">>;

const DRY_TILE_SIZE_M = 4;
const TILE_UNKNOWN = 0;
const TILE_DEFINITELY_DRY = 1;
const TILE_MIXED_OR_WET = 2;

/** Existing terrain/bridge floor, with contacts from the published Water Host. */
export class PlanningNavigationSurface {
  private readonly ground;
  private readonly waterSample = createWaterSurfaceSample();
  private readonly point = { x: 0, z: 0 };
  private readonly bridgeBounds: AnimalWorldBounds[] = [];
  private readonly dryTiles = new Map<number, number>();
  private animalCache?: AnimalSupportCache;
  private cacheActive = false;
  private cachedWaterRevision?: number;

  beginAnimalUpdate(): void {
    const cache = (this.animalCache ??= new AnimalSupportCache());
    const waterRevision = this.water.navigationWaterRevision;
    const waterChanged = waterRevision !== undefined && waterRevision !== this.cachedWaterRevision;
    if (waterChanged) {
      this.cachedWaterRevision = waterRevision;
      this.dryTiles.clear();
    }
    const clearHeights = !this.immutableHeightSource;
    const clearWater = waterChanged || !(this.immutableHeightSource && this.water.staticNavigationWater === true);
    if (clearHeights || clearWater) cache.clear(clearHeights, clearWater);
    this.cacheActive = true;
  }

  /** Invalidate retained samples when a publication changes a reused provider. */
  invalidateAnimalSupport(change?: PlanningAnimalWorldChange): void {
    if (!change) {
      this.animalCache?.clear(true, true);
      this.dryTiles.clear();
    } else {
      this.animalCache?.invalidate(change.terrain, true);
      this.animalCache?.invalidate(change.water, false);
      this.invalidateDryTiles(change.terrain);
      this.invalidateDryTiles(change.water);
    }
    this.cachedWaterRevision = this.water.navigationWaterRevision;
  }

  /** Copy snapshot heights only; a staged candidate never borrows mutable validity flags. */
  inheritAnimalSupport(previous: PlanningNavigationSurface, change: PlanningAnimalWorldChange): void {
    if (!this.immutableHeightSource || !previous.immutableHeightSource || !previous.animalCache) return;
    this.animalCache = previous.animalCache.copyHeights();
    this.invalidateAnimalSupport(change);
  }

  endAnimalUpdate(): void {
    this.cacheActive = false;
  }

  constructor(
    plan: IslandPlan,
    sampleTerrain: (x: number, z: number) => number,
    private readonly water: NavigationWaterSource,
    private readonly samplePlayerSupport?: (x: number, z: number) => number | undefined,
    /** Opt in only when terrain and bridge heights belong to an immutable scene snapshot. */
    private readonly immutableHeightSource = false
  ) {
    this.ground = bridgeGround(plan, (p) => sampleTerrain(p.x, p.z));
    for (const bridge of [...(plan.bridges ?? []), ...(plan.roadApproaches ?? [])]) {
      const margin = (bridge.width ?? 0) * 0.5 + 0.01;
      const points = bridge.deckPath?.length ? bridge.deckPath : [bridge.a, bridge.b];
      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const p of points) {
        if (!p) continue;
        if (p.x - margin < minX) minX = p.x - margin;
        if (p.x + margin > maxX) maxX = p.x + margin;
        if (p.z - margin < minZ) minZ = p.z - margin;
        if (p.z + margin > maxZ) maxZ = p.z + margin;
      }
      if (minX <= maxX && minZ <= maxZ) this.bridgeBounds.push({ minX, maxX, minZ, maxZ });
    }
  }

  private tileKey(tx: number, tz: number): number {
    // Pack into a 30-bit unsigned Smi [0, 0x3fffffff] (±16384 tiles = ±65km) to avoid V8 HeapNumber boxing.
    return ((tx & 0x7fff) << 15) | (tz & 0x7fff);
  }

  private invalidateDryTiles(regions: readonly AnimalWorldBounds[]): void {
    if (!regions.length || !this.dryTiles.size) return;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      const tx0 = Math.floor(r.minX / DRY_TILE_SIZE_M);
      const tx1 = Math.floor(r.maxX / DRY_TILE_SIZE_M);
      const tz0 = Math.floor(r.minZ / DRY_TILE_SIZE_M);
      const tz1 = Math.floor(r.maxZ / DRY_TILE_SIZE_M);
      if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > this.dryTiles.size) {
        this.dryTiles.clear();
        return;
      }
      for (let tx = tx0; tx <= tx1; tx++)
        for (let tz = tz0; tz <= tz1; tz++) this.dryTiles.delete(this.tileKey(tx, tz));
    }
  }

  /**
   * Lazily classifies a 4m × 4m tile. Strictly conservative: returns true ONLY when
   * no active water body has any wet surface in the tile, no bridge/approach intersects it,
   * and all four tile corners have finite terrain height.
   */
  private isTileDefinitelyDry(tx: number, tz: number): boolean {
    if (!this.water.hasWaterInBounds) return false;
    const waterRevision = this.water.navigationWaterRevision;
    if (waterRevision !== undefined && waterRevision !== this.cachedWaterRevision) {
      this.cachedWaterRevision = waterRevision;
      this.dryTiles.clear();
      this.animalCache?.clear(false, true);
    }
    const key = this.tileKey(tx, tz);
    const cached = this.dryTiles.get(key);
    if (cached !== undefined && cached !== TILE_UNKNOWN) return cached === TILE_DEFINITELY_DRY;
    const minX = tx * DRY_TILE_SIZE_M;
    const minZ = tz * DRY_TILE_SIZE_M;
    const maxX = minX + DRY_TILE_SIZE_M;
    const maxZ = minZ + DRY_TILE_SIZE_M;
    let state = TILE_DEFINITELY_DRY;
    for (let i = 0; i < this.bridgeBounds.length; i++) {
      const b = this.bridgeBounds[i];
      if (maxX >= b.minX && minX <= b.maxX && maxZ >= b.minZ && minZ <= b.maxZ) {
        state = TILE_MIXED_OR_WET;
        break;
      }
    }
    if (state === TILE_DEFINITELY_DRY && this.water.hasWaterInBounds(minX, minZ, maxX, maxZ)) {
      state = TILE_MIXED_OR_WET;
    }
    if (state === TILE_DEFINITELY_DRY) {
      if (
        !Number.isFinite(this.sampleHeightInterpolated(minX, minZ)) ||
        !Number.isFinite(this.sampleHeightInterpolated(maxX, minZ)) ||
        !Number.isFinite(this.sampleHeightInterpolated(minX, maxZ)) ||
        !Number.isFinite(this.sampleHeightInterpolated(maxX, maxZ))
      ) {
        state = TILE_MIXED_OR_WET;
      }
    }
    if (this.dryTiles.size >= 8192) this.dryTiles.clear();
    this.dryTiles.set(key, state);
    return state === TILE_DEFINITELY_DRY;
  }

  /** Returns true only when every 4m tile intersecting [minX, maxX] × [minZ, maxZ] is provably dry land. */
  isBoundsDefinitelyDry(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    if (!this.water.hasWaterInBounds) return false;
    const tx0 = Math.floor(minX / DRY_TILE_SIZE_M);
    const tx1 = Math.floor(maxX / DRY_TILE_SIZE_M);
    const tz0 = Math.floor(minZ / DRY_TILE_SIZE_M);
    const tz1 = Math.floor(maxZ / DRY_TILE_SIZE_M);
    // Avoid filling hundreds of tiles for an abnormally long query.
    if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > 64) return false;
    for (let tx = tx0; tx <= tx1; tx++)
      for (let tz = tz0; tz <= tz1; tz++) if (!this.isTileDefinitelyDry(tx, tz)) return false;
    return true;
  }

  sampleHeightInterpolated(x: number, z: number): number {
    const cache = this.cacheActive ? this.animalCache : undefined;
    const index = cache?.slot(x, z);
    if (cache && cache.heightReady[index!]) return cache.heights[index!];
    this.point.x = x;
    this.point.z = z;
    const height = this.ground(this.point);
    if (cache) {
      cache.heights[index!] = height;
      cache.heightReady[index!] = 1;
    }
    return height;
  }

  /** Published terrain/bridge support for animals. Props are obstacles in their compiled footprint index,
   * not elevated player footholds; querying the player's physics support here is both wrong and expensive. */
  sampleAnimalSupport(
    x: number,
    z: number,
    out: { height: number | undefined; waterHeight: number | undefined }
  ): void {
    const cache = this.cacheActive ? this.animalCache : undefined;
    const index = cache?.slot(x, z);
    if (cache && cache.waterReady[index!]) {
      out.height = cache.heights[index!];
      out.waterHeight = Number.isNaN(cache.waterHeights[index!]) ? undefined : cache.waterHeights[index!];
      return;
    }
    out.height = this.sampleHeightInterpolated(x, z);
    if (this.isTileDefinitelyDry(Math.floor(x / DRY_TILE_SIZE_M), Math.floor(z / DRY_TILE_SIZE_M))) {
      out.waterHeight = undefined;
    } else {
      out.waterHeight =
        this.water.sampleSurface(x, z, this.waterSample) &&
        this.waterSample.waterDepth > 0 &&
        out.height <= this.waterSample.surfacePosition.y + 1e-6
          ? this.waterSample.surfacePosition.y
          : undefined;
    }
    if (cache) {
      cache.waterHeights[index!] = out.waterHeight ?? NaN;
      cache.waterReady[index!] = 1;
    }
  }

  /** Actual published water elevation for swimming; terrain/bridge navigation remains unchanged. */
  sampleWaterHeight(x: number, z: number): number | undefined {
    return this.sampleContactIsWater(x, z) ? this.waterSample.surfacePosition.y : undefined;
  }

  /** A bridge/approach above the water wins contact, while the underlying water remains queryable. */
  sampleContactIsWater(x: number, z: number): boolean {
    if (this.isTileDefinitelyDry(Math.floor(x / DRY_TILE_SIZE_M), Math.floor(z / DRY_TILE_SIZE_M))) return false;
    return (
      this.water.sampleSurface(x, z, this.waterSample) &&
      this.waterSample.waterDepth > 0 &&
      Math.max(this.sampleHeightInterpolated(x, z), this.samplePlayerSupport?.(x, z) ?? -Infinity) <=
        this.waterSample.surfacePosition.y + 1e-6
    );
  }

  /** Surface-attached vegetation tests its elevation, not the lower terrain contact. */
  samplePointIsUnderwater(x: number, y: number, z: number): boolean {
    return (
      this.water.sampleSurface(x, z, this.waterSample) &&
      this.waterSample.waterDepth > 0 &&
      y <= this.waterSample.surfacePosition.y
    );
  }
}

/** Bounded, allocation-free during updates. Hash collisions only evict; coordinates are never rounded.
 * Static water hosts retain water samples across updates until publication invalidates them. */
class AnimalSupportCache {
  private readonly xs = new Float64Array(8192);
  private readonly zs = new Float64Array(8192);
  readonly heights = new Float64Array(8192);
  readonly waterHeights = new Float64Array(8192);
  readonly heightReady = new Uint8Array(8192);
  readonly waterReady = new Uint8Array(8192);

  copyHeights(): AnimalSupportCache {
    const copy = new AnimalSupportCache();
    copy.xs.set(this.xs);
    copy.zs.set(this.zs);
    copy.heights.set(this.heights);
    copy.heightReady.set(this.heightReady);
    return copy;
  }

  invalidate(regions: readonly AnimalWorldBounds[], height: boolean): void {
    if (!regions.length) return;
    for (let i = 0; i < this.xs.length; i++) {
      if (!this.heightReady[i] && !this.waterReady[i]) continue;
      const x = this.xs[i],
        z = this.zs[i];
      if (!regions.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)) continue;
      if (height) this.heightReady[i] = 0;
      this.waterReady[i] = 0;
    }
  }

  clear(height = true, water = true): void {
    if (height) this.heightReady.fill(0);
    if (water) this.waterReady.fill(0);
  }

  slot(x: number, z: number): number {
    const index = (Math.imul(Math.floor(x * 1024), 73856093) ^ Math.imul(Math.floor(z * 1024), 19349663)) & 8191;
    if (this.xs[index] !== x || this.zs[index] !== z) {
      this.xs[index] = x;
      this.zs[index] = z;
      this.heightReady[index] = this.waterReady[index] = 0;
    }
    return index;
  }
}
