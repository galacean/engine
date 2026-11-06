import { DEFAULT_SOIL_VISUAL_CONFIG } from "./SoilVisualConfig";

export interface SoilCell {
  readonly plotId: string;
  readonly groundId: string;
  readonly cellX: number;
  readonly cellZ: number;
}

const cellKey = (ground: string, x: number, z: number) => JSON.stringify([ground, x, z]);

/** Visual occupancy, independent of water connections. Include only displayed soil cells. */
export function buildSoilBoundaryMasks(cells: readonly SoilCell[]): Map<string, number> {
  const occupied = new Set(cells.map((c) => cellKey(c.groundId, c.cellX, c.cellZ)));
  return new Map(
    cells.map((c) => {
      let mask = 0;
      for (let z = -1; z <= 1; z++)
        for (let x = -1; x <= 1; x++) {
          if (occupied.has(cellKey(c.groundId, c.cellX + x, c.cellZ + z))) mask |= 1 << ((z + 1) * 3 + x + 1);
        }
      return [c.plotId, mask];
    })
  );
}

/** Distance to the exposed contour, including neighboring segments at concave corners. */
export class SoilBoundary {
  private mask = -1;
  private segments: [number, number, number, number][] = [];
  private cornerMask = 0;
  private preview?: SoilBoundary;
  private previewMask?: number;

  constructor(
    private readonly size: number,
    private readonly worldX: number,
    private readonly worldZ: number
  ) {
    this.setNeighbors(1 << 4);
  }

  setNeighbors(mask: number): boolean {
    if (mask === this.mask) return false;
    this.mask = mask;
    this.segments = [];
    this.cornerMask = 0;
    const occupied = (x: number, z: number) =>
      x >= -1 && x <= 1 && z >= -1 && z <= 1 && Boolean(mask & (1 << ((z + 1) * 3 + x + 1)));
    const half = this.size / 2;
    const width = Math.min(DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.blendWidth, this.size * 0.4);
    const addSegment = (ax: number, az: number, bx: number, bz: number) => {
      // Segments farther than the fade width from this cell cannot affect its texture.
      // Prune once when neighbours change, instead of testing all nine cells per texel.
      const dx = Math.max(0, ax - half, -half - bx);
      const dz = Math.max(0, az - half, -half - bz);
      if (dx * dx + dz * dz < width * width) this.segments.push([ax, az, bx, bz]);
    };
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        if (!occupied(sx, 0) && !occupied(0, sz)) this.cornerMask |= 1 << ((sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0));
    for (let z = -1; z <= 1; z++)
      for (let x = -1; x <= 1; x++) {
        if (!occupied(x, z)) continue;
        const left = (x - 0.5) * this.size,
          right = left + this.size;
        const back = (z - 0.5) * this.size,
          front = back + this.size;
        if (!occupied(x - 1, z)) addSegment(left, back, left, front);
        if (!occupied(x + 1, z)) addSegment(right, back, right, front);
        if (!occupied(x, z - 1)) addSegment(left, back, right, back);
        if (!occupied(x, z + 1)) addSegment(left, front, right, front);
      }
    return true;
  }

  coverage(x: number, z: number): number {
    return this.contourCoverage(x, z);
  }

  setPreviewNeighbors(mask?: number): boolean {
    if (mask === this.previewMask) return false;
    this.previewMask = mask;
    this.preview = mask === undefined ? undefined : new SoilBoundary(this.size, this.worldX, this.worldZ);
    if (mask !== undefined) this.preview!.setNeighbors(mask);
    return true;
  }

  previewCoverage(x: number, z: number): number {
    return this.preview?.coverage(x, z) ?? this.coverage(x, z);
  }

  private contourCoverage(x: number, z: number): number {
    const config = DEFAULT_SOIL_VISUAL_CONFIG.soil.edge;
    const width = Math.min(config.blendWidth, this.size * 0.4);
    let distanceSquared = width * width;
    for (const [ax, az, bx, bz] of this.segments) {
      const dx = x - Math.max(ax, Math.min(bx, x));
      const dz = z - Math.max(az, Math.min(bz, z));
      distanceSquared = Math.min(distanceSquared, dx * dx + dz * dz);
    }
    const radius = this.size * config.cornerRadiusFraction;
    const cornerCenter = this.size / 2 - radius;
    const dx = Math.abs(x) - cornerCenter,
      dz = Math.abs(z) - cornerCenter;
    const roundedCorner = dx > 0 && dz > 0 && Boolean(this.cornerMask & (1 << ((x > 0 ? 1 : 0) + (z > 0 ? 2 : 0))));
    if (distanceSquared >= width * width && !roundedCorner) return 1;
    let distance = Math.sqrt(distanceSquared);
    if (roundedCorner) distance = Math.min(distance, radius - Math.sqrt(dx * dx + dz * dz));
    if (distance <= 0) return 0;
    if (distance >= width) return 1;
    const wx = (this.worldX + x) * config.noiseFrequency,
      wz = (this.worldZ + z) * config.noiseFrequency;
    const noise = 0.5 + 0.25 * (Math.sin(wx + Math.sin(wz * 0.73)) + Math.sin(wz * 1.31 + wx * 0.41));
    const localWidth = width * (1 - config.irregularity * noise);
    const t = Math.min(1, distance / localWidth);
    return t * t * (3 - 2 * t);
  }
}
