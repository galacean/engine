/** Derived display policy only; never persisted in the author's construction document. */
export type MasonryLod = 0 | 1 | 2;
export interface MasonryLodView {
  view: ArrayLike<number>;
  projection: ArrayLike<number>;
  orthographic: boolean;
  pixelHeight: number;
  near: number;
  far: number;
}
export interface MasonryLodBounds {
  min: readonly number[];
  max: readonly number[];
}
export const MASONRY_RESIDENCY = {
  retainMs: 45_000,
  // Scene-owned instance/storage/feedback bytes. Immutable textures/templates are shared separately.
  cacheBytes: 128 * 1024 * 1024,
  detailBytes: 256 * 1024 * 1024,
  fullTriangleBudget: 2_000_000
};
export function masonryLodRequest(
  bounds: MasonryLodBounds,
  position: readonly number[],
  camera: MasonryLodView,
  previous: MasonryLod
) {
  const m = camera.view,
    p = camera.projection,
    x = (bounds.min[0] + bounds.max[0]) * 0.5 + position[0],
    y = (bounds.min[1] + bounds.max[1]) * 0.5,
    z = (bounds.min[2] + bounds.max[2]) * 0.5 + position[2],
    rx = (bounds.max[0] - bounds.min[0]) * 0.5,
    ry = (bounds.max[1] - bounds.min[1]) * 0.5,
    rz = (bounds.max[2] - bounds.min[2]) * 0.5,
    vx = m[0] * x + m[4] * y + m[8] * z + m[12],
    vy = m[1] * x + m[5] * y + m[9] * z + m[13],
    depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]),
    ex = Math.abs(m[0]) * rx + Math.abs(m[4]) * ry + Math.abs(m[8]) * rz,
    ey = Math.abs(m[1]) * rx + Math.abs(m[5]) * ry + Math.abs(m[9]) * rz,
    ez = Math.abs(m[2]) * rx + Math.abs(m[6]) * ry + Math.abs(m[10]) * rz,
    distance = Math.hypot(vx, vy, depth),
    denominator = camera.orthographic ? 1 : Math.max(camera.near, distance),
    scale = (Math.abs(p[5]) * camera.pixelHeight * 0.5) / denominator,
    halfWidth = (camera.orthographic ? 1 : Math.max(0, depth + ez)) / Math.abs(p[0]),
    halfHeight = (camera.orthographic ? 1 : Math.max(0, depth + ez)) / Math.abs(p[5]);
  const visible =
    depth + ez >= camera.near &&
    depth - ez <= camera.far &&
    Math.abs(vx) <= halfWidth + ex &&
    Math.abs(vy) <= halfHeight + ey;
  const prefetch =
    depth + ez >= camera.near &&
    depth - ez <= camera.far &&
    Math.abs(vx) <= halfWidth * 1.3 + ex &&
    Math.abs(vy) <= halfHeight * 1.3 + ey;
  const pixels = 2 * Math.max(rx, ry, rz) * scale,
    unitPixels = 0.3 * scale;
  const detailed = pixels >= (previous < 2 ? 24 : 32) && unitPixels >= (previous < 2 ? 0.65 : 0.85);
  const lod: MasonryLod = detailed ? (unitPixels >= (previous === 0 ? 11 : 14) ? 0 : 1) : 2;
  return {
    lod,
    distance,
    visible,
    prefetch,
    pixels,
    unitPixels,
    priority: (visible ? 1_000_000 : 0) + Math.min(pixels, 10000) * 100 + unitPixels
  };
}

/** Cached group-level residency probe. Actual draw culling remains engine-owned. */
export class MasonryLodProbe {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly size: number;
  distanceSquared = Infinity;
  private enterDetail = 0;
  private leaveDetail = 0;
  private enterFull = 0;
  private leaveFull = 0;
  private projectionScale = 0;
  private nearSquared = 0;
  private orthographic = false;
  private initialized = false;
  eligible = false;
  visible = false;
  lod: MasonryLod = 2;
  constructor(
    bounds: MasonryLodBounds,
    position: readonly number[],
    private readonly unitSize = 0.3
  ) {
    this.x = (bounds.min[0] + bounds.max[0]) * 0.5 + position[0];
    this.y = (bounds.min[1] + bounds.max[1]) * 0.5;
    this.z = (bounds.min[2] + bounds.max[2]) * 0.5 + position[2];
    this.rx = (bounds.max[0] - bounds.min[0]) * 0.5;
    this.ry = (bounds.max[1] - bounds.min[1]) * 0.5;
    this.rz = (bounds.max[2] - bounds.min[2]) * 0.5;
    this.size = 2 * Math.max(this.rx, this.ry, this.rz);
  }
  /** flags: view=1, world position=2, projection/viewport/clips=4. */
  update(camera: MasonryLodView, position: { x: number; y: number; z: number }, flags: number, previous: MasonryLod) {
    if (!this.initialized) flags = 7;
    if (flags & 4) {
      const scale = (this.projectionScale = Math.abs(camera.projection[5]) * camera.pixelHeight * 0.5);
      const unit = this.unitSize * scale,
        size = this.size * scale;
      this.enterDetail = Math.min(size / 32, unit / 0.85) ** 2;
      this.leaveDetail = Math.min(size / 24, unit / 0.65) ** 2;
      this.enterFull = (unit / 14) ** 2;
      this.leaveFull = (unit / 11) ** 2;
      this.nearSquared = camera.near ** 2;
      this.orthographic = camera.orthographic;
    }
    if (flags & 2) {
      const dx = this.x - position.x,
        dy = this.y - position.y,
        dz = this.z - position.z;
      this.distanceSquared = dx * dx + dy * dy + dz * dz;
    }
    if (flags & 6 || previous !== this.lod) {
      const d = this.orthographic ? 1 : Math.max(this.nearSquared, this.distanceSquared);
      this.lod =
        d <= (previous < 2 ? this.leaveDetail : this.enterDetail)
          ? d <= (previous === 0 ? this.leaveFull : this.enterFull)
            ? 0
            : 1
          : 2;
    }
    this.initialized = true;
    // A cached group coarse test is cheaper than submitting hundreds of hidden
    // renderers to engine culling. Quality and transition state do not depend on it.
    if (flags) {
      const m = camera.view,
        p = camera.projection;
      const vx = m[0] * this.x + m[4] * this.y + m[8] * this.z + m[12];
      const vy = m[1] * this.x + m[5] * this.y + m[9] * this.z + m[13];
      const depth = -(m[2] * this.x + m[6] * this.y + m[10] * this.z + m[14]);
      const ex = Math.abs(m[0]) * this.rx + Math.abs(m[4]) * this.ry + Math.abs(m[8]) * this.rz;
      const ey = Math.abs(m[1]) * this.rx + Math.abs(m[5]) * this.ry + Math.abs(m[9]) * this.rz;
      const ez = Math.abs(m[2]) * this.rx + Math.abs(m[6]) * this.ry + Math.abs(m[10]) * this.rz;
      const extent = camera.orthographic ? 1 : Math.max(0, depth + ez);
      const width = extent / Math.abs(p[0]),
        height = extent / Math.abs(p[5]);
      const depthVisible = depth + ez >= camera.near && depth - ez <= camera.far;
      this.visible = depthVisible && Math.abs(vx) <= width + ex && Math.abs(vy) <= height + ey;
      this.eligible =
        this.lod < 2 &&
        (this.distanceSquared < 3600 ||
          (depthVisible && Math.abs(vx) <= width * 1.3 + ex && Math.abs(vy) <= height * 1.3 + ey));
    }
  }

  /** Evaluated only when the demand set/quality changes or a new load is selected. */
  priority() {
    const scale =
      this.projectionScale / (this.orthographic ? 1 : Math.sqrt(Math.max(this.nearSquared, this.distanceSquared)));
    return Math.min(this.size * scale, 10000) * 100 + this.unitSize * scale;
  }
}
