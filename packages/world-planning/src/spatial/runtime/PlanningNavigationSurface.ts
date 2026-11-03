import { createWaterSurfaceSample } from "@galacean/engine-water/water/runtime/index";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { bridgeGround } from "../hydrology/RiverCrossings";
import type { PlanningWaterRuntime } from "./PlanningWaterRuntime";

/** Existing terrain/bridge floor, with contacts from the published Water Host. */
export class PlanningNavigationSurface {
  private readonly ground;
  private readonly waterSample = createWaterSurfaceSample();
  private readonly point = { x: 0, z: 0 };
  private animalCache?: AnimalSupportCache;
  private cacheActive = false;

  beginAnimalUpdate(): void {
    (this.animalCache ??= new AnimalSupportCache()).clear();
    this.cacheActive = true;
  }

  endAnimalUpdate(): void {
    this.cacheActive = false;
  }

  constructor(
    plan: IslandPlan,
    sampleTerrain: (x: number, z: number) => number,
    private readonly water: Pick<PlanningWaterRuntime, "sampleSurface">,
    private readonly samplePlayerSupport?: (x: number, z: number) => number | undefined
  ) {
    this.ground = bridgeGround(plan, (p) => sampleTerrain(p.x, p.z));
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
    out.waterHeight =
      this.water.sampleSurface(x, z, this.waterSample) &&
      this.waterSample.waterDepth > 0 &&
      out.height <= this.waterSample.surfacePosition.y + 1e-6
        ? this.waterSample.surfacePosition.y
        : undefined;
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
 * Clearing each host update also invalidates changing water/terrain, without revision polling per query. */
class AnimalSupportCache {
  private readonly xs = new Float64Array(8192);
  private readonly zs = new Float64Array(8192);
  readonly heights = new Float64Array(8192);
  readonly waterHeights = new Float64Array(8192);
  readonly heightReady = new Uint8Array(8192);
  readonly waterReady = new Uint8Array(8192);

  clear(): void {
    this.heightReady.fill(0);
    this.waterReady.fill(0);
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
