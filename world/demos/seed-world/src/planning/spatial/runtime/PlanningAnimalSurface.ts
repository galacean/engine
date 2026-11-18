import type { SeedWorldSurfaceMaterialIntent } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceIntent";

/** The published CPU alphamap used by Terrain, including its optional river-bed layer. */
export type PlanningAnimalSurfaceData = Pick<
  SeedWorldSurfaceMaterialIntent,
  "resolution" | "materialWeights" | "riverBedCoverage"
>;

/** Gameplay surface identity; other ground is traversable but is not grass food. */
export enum PlanningAnimalSurfaceKind {
  Other = "other",
  Road = "road",
  Grass = "grassland",
  River = "river"
}

/** Read the existing surface bytes without GPU readback, allocating grids or querying vegetation/POIs. */
export class PlanningAnimalSurface {
  constructor(
    private readonly size: number,
    readonly data?: PlanningAnimalSurfaceData
  ) {}

  /** Classify a world X/Z point with the same endpoint-aligned bilinear sampling as the alphamap. */
  at(x: number, z: number): PlanningAnimalSurfaceKind {
    const data = this.data;
    if (!data || !Number.isFinite(x + z) || x < 0 || z < 0 || x > this.size || z > this.size)
      return PlanningAnimalSurfaceKind.Other;
    const fx = (x / this.size) * (data.resolution - 1),
      fz = (z / this.size) * (data.resolution - 1);
    if (data.riverBedCoverage && this.sample(data.riverBedCoverage, fx, fz, 1, 0) >= 127.5)
      return PlanningAnimalSurfaceKind.River;
    const road = this.sample(data.materialWeights, fx, fz, 4, 3);
    // A mixed road edge is not food even if some grass is still visible through the blend.
    if (road >= 63.75) return PlanningAnimalSurfaceKind.Road;
    const grass = this.sample(data.materialWeights, fx, fz, 4, 0);
    return grass >= 127.5 ? PlanningAnimalSurfaceKind.Grass : PlanningAnimalSurfaceKind.Other;
  }

  /** Require grass at the body centre and four footprint edges; prevents eating from the road-side of a blend. */
  hasGrass(x: number, z: number, radius: number): boolean {
    return (
      this.at(x, z) === PlanningAnimalSurfaceKind.Grass &&
      this.at(x - radius, z) === PlanningAnimalSurfaceKind.Grass &&
      this.at(x + radius, z) === PlanningAnimalSurfaceKind.Grass &&
      this.at(x, z - radius) === PlanningAnimalSurfaceKind.Grass &&
      this.at(x, z + radius) === PlanningAnimalSurfaceKind.Grass
    );
  }

  private sample(bytes: Uint8Array, x: number, z: number, stride: number, channel: number): number {
    const n = this.data!.resolution,
      x0 = Math.floor(x),
      z0 = Math.floor(z);
    const x1 = Math.min(x0 + 1, n - 1),
      z1 = Math.min(z0 + 1, n - 1),
      tx = x - x0,
      tz = z - z0;
    const a = bytes[(z0 * n + x0) * stride + channel],
      b = bytes[(z0 * n + x1) * stride + channel];
    const c = bytes[(z1 * n + x0) * stride + channel],
      d = bytes[(z1 * n + x1) * stride + channel];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
}
