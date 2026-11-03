import type { NearShorePoint as Point } from "./WaterWetNearShoreSearch";

/** Exact coordinate cache for contour preparation. Chunked numeric storage
 * avoids per-coordinate Map entries and boxed keys without rounding wet support.
 * Growth allocates one small chunk; it never rehashes all prior samples in a step.
 */
class ContourHeightCache {
  size = 0;
  private readonly heads = new Int32Array(4096);
  private readonly key = new Float64Array(2);
  private readonly bits = new Uint32Array(this.key.buffer);
  private readonly chunks: { values: Float64Array; next: Int32Array; wet: Uint8Array }[] = [];

  sample(x: number, z: number, wetHeight: (x: number, z: number) => number | undefined): number | undefined {
    // Match Map's SameValueZero treatment of signed zero.
    this.key[0] = x === 0 ? 0 : x;
    this.key[1] = z === 0 ? 0 : z;
    let hash = Math.imul(this.bits[0] ^ this.bits[1], 0x9e3779b1) ^ Math.imul(this.bits[2] ^ this.bits[3], 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
    const bucket = (hash ^ (hash >>> 13)) & (this.heads.length - 1);
    for (let entry = this.heads[bucket]; entry; ) {
      const index = entry - 1,
        chunk = this.chunks[index >>> 8],
        offset = index & 255,
        p = offset * 3;
      if (
        (chunk.values[p] === x || (Number.isNaN(chunk.values[p]) && Number.isNaN(x))) &&
        (chunk.values[p + 1] === z || (Number.isNaN(chunk.values[p + 1]) && Number.isNaN(z)))
      ) {
        return chunk.wet[offset] ? chunk.values[p + 2] : undefined;
      }
      entry = chunk.next[offset];
    }
    const height = wetHeight(x, z),
      index = this.size++,
      offset = index & 255,
      p = offset * 3;
    const chunk =
      this.chunks[index >>> 8] ??
      (this.chunks[index >>> 8] = {
        values: new Float64Array(768),
        next: new Int32Array(256),
        wet: new Uint8Array(256)
      });
    chunk.values[p] = x;
    chunk.values[p + 1] = z;
    if (height !== undefined) {
      chunk.values[p + 2] = height;
      chunk.wet[offset] = 1;
    }
    chunk.next[offset] = this.heads[bucket];
    this.heads[bucket] = index + 1;
    return height;
  }
}

interface Fragment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  awx: number;
  awz: number;
  bwx: number;
  bwz: number;
  known: boolean;
}

/** Resumable native clipping of candidate contours. All transient coordinates
 * stay in reusable storage; only retained witnesses become Point objects.
 * Each advance performs at most one uncached native sample. A bounded cache-only
 * walk also yields, without treating an exhausted budget as a dry-region proof.
 */
export class WaterContourPreparation {
  private readonly cache = new ContourHeightCache();
  private readonly stack: Fragment[] = [];
  // Endpoint A, endpoint B, midpoint: original x/z followed by wet witness x/z.
  // NaN wet coordinates mean dry; known endpoints include cached dry results.
  private readonly points = new Float64Array(12);
  private size = 0;
  private active = false;
  private point = 0;
  private attempt = 0;
  private dx = 0;
  private dz = 0;
  private length = 0;
  private done = false;

  constructor(
    private readonly contours: Generator<readonly [Point, Point] | undefined>,
    private readonly height: (x: number, z: number) => number | undefined,
    private readonly add: (a: Point, b: Point, wet: Point) => void
  ) {}

  advance(): boolean {
    if (this.done) return true;
    const p = this.points;
    for (let work = 0; work < 8; work++) {
      if (!this.active) {
        if (!this.size) {
          const candidate = this.contours.next();
          if (candidate.done) return (this.done = true);
          if (candidate.value) {
            const [a, b] = candidate.value;
            this.dx = b[0] - a[0];
            this.dz = b[1] - a[1];
            this.length = Math.hypot(this.dx, this.dz);
            if (this.length) this.push(a[0], a[1], b[0], b[1], NaN, NaN, NaN, NaN, false);
          }
          return false;
        }
        const f = this.stack[--this.size];
        p[0] = f.ax;
        p[1] = f.az;
        p[2] = f.awx;
        p[3] = f.awz;
        p[4] = f.bx;
        p[5] = f.bz;
        p[6] = f.bwx;
        p[7] = f.bwz;
        p[8] = (f.ax + f.bx) / 2;
        p[9] = (f.az + f.bz) / 2;
        p[10] = p[11] = NaN;
        this.point = f.known ? 8 : 0;
        this.attempt = 0;
        this.active = true;
      }
      while (this.point < 12) {
        const i = this.point;
        // Preserve the native coverage probes and their original offset order.
        const offset = this.attempt === 0 ? 0 : this.attempt === 1 ? 1e-9 : -1e-9;
        const x = p[i] + (offset * this.dz) / this.length,
          z = p[i + 1] - (offset * this.dx) / this.length,
          before = this.cache.size,
          wet = this.cache.sample(x, z, this.height) !== undefined;
        if (wet) {
          p[i + 2] = x;
          p[i + 3] = z;
        }
        if (wet || ++this.attempt === 3) {
          this.point += 4;
          this.attempt = 0;
        }
        if (this.cache.size !== before) return false;
      }
      const aw = !Number.isNaN(p[2]),
        bw = !Number.isNaN(p[6]),
        mw = !Number.isNaN(p[10]);
      const span = Math.hypot(p[4] - p[0], p[5] - p[1]);
      if (aw && bw && mw) {
        this.add([p[2], p[3]], [p[6], p[7]], [p[10], p[11]]);
      } else if (span <= 0.1) {
        for (let i = 0; i < 3; i++) {
          const offset = i === 0 ? 8 : (i - 1) * 4;
          if (Number.isNaN(p[offset + 2])) continue;
          const wet: Point = [p[offset + 2], p[offset + 3]];
          this.add(wet, wet, wet);
        }
      } else if (aw || bw || mw || span > 0.5) {
        // Inherit probes at original endpoints, not at their offset witnesses.
        // LIFO right-first keeps the original recursive left-to-right order.
        this.push(p[8], p[9], p[4], p[5], p[10], p[11], p[6], p[7], true);
        this.push(p[0], p[1], p[8], p[9], p[2], p[3], p[10], p[11], true);
      }
      this.active = false;
    }
    return false;
  }

  private push(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    awx: number,
    awz: number,
    bwx: number,
    bwz: number,
    known: boolean
  ): void {
    const f = this.stack[this.size++] ?? (this.stack[this.size - 1] = {} as Fragment);
    f.ax = ax;
    f.az = az;
    f.bx = bx;
    f.bz = bz;
    f.awx = awx;
    f.awz = awz;
    f.bwx = bwx;
    f.bwz = bwz;
    f.known = known;
  }
}
