/** Retained world-space coordinates share one storage shape throughout the audio pipeline. */
export class AudioPoint {
  x = 0;
  y = 0;
  z = 0;
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}
export interface AudioSegment {
  readonly id: string;
  readonly a: AudioPoint;
  readonly b: AudioPoint;
}
export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
// World coordinates are bounded to terrain scale; the general hypot overflow path is unnecessary here.
export class AudioDistanceResult {
  distance = 0;
}

export function audioDistance(a: AudioPoint, b: AudioPoint, out: AudioDistanceResult): void {
  const x = a.x - b.x,
    y = a.y - b.y,
    z = a.z - b.z;
  out.distance = Math.sqrt(x * x + y * y + z * z);
}

export function nearestAudioPoint(segment: AudioSegment, listener: AudioPoint, out: AudioPoint): AudioPoint {
  const { a, b } = segment;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((listener.x - a.x) * dx + (listener.y - a.y) * dy + (listener.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)
    )
  );
  out.x = a.x + dx * t;
  out.y = a.y + dy * t;
  out.z = a.z + dz * t;
  return out;
}

export function audioPropagationGain(reach: number, occlusion: number, out: AudioPropagation): void {
  const distance = out.distance;
  const t = Math.max(0, Math.min(1, distance / reach));
  out.gain = (Math.pow(1 - t, 2) / (1 + distance / (reach * 0.3))) * (1 - Math.max(0, Math.min(1, occlusion)) * 0.78);
}

export function waterPropagationGain(reach: number, occlusion: number, out: AudioPropagation): void {
  const distance = out.distance;
  const t = Math.max(0, Math.min(1, distance / reach));
  out.gain = ((1 - t) / Math.sqrt(1 + distance / (reach * 0.3))) * (1 - Math.max(0, Math.min(1, occlusion)) * 0.78);
}

/** Direction stays in world space; only attenuation/detail change with distance and solid occlusion. */
export class AudioPropagation extends AudioDistanceResult {
  gain = 0;
  cutoff = 18000;
}

export function audioPropagation(reach: number, occlusion: number, out: AudioPropagation): void {
  const distance = out.distance;
  const t = Math.max(0, Math.min(1, distance / reach)),
    blocked = Math.max(0, Math.min(1, occlusion));
  audioPropagationGain(reach, occlusion, out);
  out.cutoff = Math.max(550, 18000 * Math.exp(-3.5 * t) * (1 - blocked * 0.88));
}

/** River/shore representatives stand for extended sound lines, so their body carries farther than a small point source. */
export function waterPropagation(reach: number, occlusion: number, out: AudioPropagation): void {
  audioPropagation(reach, occlusion, out);
  waterPropagationGain(reach, occlusion, out);
}

/**
 * Authored thunder recordings already contain the distant rumble. Calibrate their
 * level over kilometres, separately from nearby foliage/water. Outdoor solid
 * occlusion removes detail but preserves the rumble; this is not a diffraction solver.
 */
export function thunderPropagation(reach: number, occlusion: number, out: AudioPropagation): void {
  const distance = out.distance;
  const metres = Math.max(0, distance),
    blocked = Math.max(0, Math.min(1, occlusion)),
    edge = Math.max(0, Math.min(1, (metres / reach - 0.75) / 0.25)),
    fade = 1 - edge * edge * (3 - 2 * edge);
  out.gain = (fade / (1 + metres / 6000)) * (1 - blocked * 0.25);
  out.cutoff = Math.max(900, (9000 / (1 + metres / 2500)) * (1 - blocked * 0.35));
}

/** Physical sound travel, measured from the actual flash position, in world metres. */
export function thunderDelaySeconds(strike: AudioPoint, listener: AudioPoint): number {
  const x = strike.x - listener.x,
    y = strike.y - listener.y,
    z = strike.z - listener.z;
  return Math.sqrt(x * x + y * y + z * z) / 343;
}

/** Segment/solid oriented box intersection. Leaves and grass are deliberately absent. */
export function audioRayIntersectsObb(
  a: AudioPoint,
  b: AudioPoint,
  center: readonly number[],
  size: readonly number[],
  q: readonly number[]
): boolean {
  const qx = -q[0]!,
    qy = -q[1]!,
    qz = -q[2]!,
    qw = q[3]!;
  const ax = a.x - center[0]!,
    ay = a.y - center[1]!,
    az = a.z - center[2]!;
  const bx = b.x - center[0]!,
    by = b.y - center[1]!,
    bz = b.z - center[2]!;
  const atx = 2 * (qy * az - qz * ay),
    aty = 2 * (qz * ax - qx * az),
    atz = 2 * (qx * ay - qy * ax);
  const btx = 2 * (qy * bz - qz * by),
    bty = 2 * (qz * bx - qx * bz),
    btz = 2 * (qx * by - qy * bx);
  const px = ax + qw * atx + qy * atz - qz * aty;
  const py = ay + qw * aty + qz * atx - qx * atz;
  const pz = az + qw * atz + qx * aty - qy * atx;
  const ex = bx + qw * btx + qy * btz - qz * bty;
  const ey = by + qw * bty + qz * btx - qx * btz;
  const ez = bz + qw * btz + qx * bty - qy * btx;
  // Test the complete segment: a fractional endpoint trim skips nearby solids for distant sounds.
  let low = 0,
    high = 1;
  for (let i = 0; i < 3; i++) {
    const p = i === 0 ? px : i === 1 ? py : pz;
    const d = (i === 0 ? ex : i === 1 ? ey : ez) - p,
      half = size[i]! * 0.5;
    if (Math.abs(d) < 1e-8) {
      if (Math.abs(p) > half) return false;
    } else {
      const t0 = (-half - p) / d,
        t1 = (half - p) / d;
      low = Math.max(low, Math.min(t0, t1));
      high = Math.min(high, Math.max(t0, t1));
      if (low > high) return false;
    }
  }
  return true;
}

/** Bounded-rate cadence consumes actual accepted travel, never queued key presses or camera teleports. */
export class AudioFootstepCadence {
  private distance = 0;
  private lastStep = -Infinity;
  private lastTravel = -Infinity;
  reset(): void {
    this.distance = 0;
    this.lastStep = -Infinity;
    this.lastTravel = -Infinity;
  }
  travel(distance: number, nominalSpeed: number, now: number): boolean {
    if (!Number.isFinite(distance) || distance <= 0) return false;
    if (now - this.lastTravel > 0.5) this.distance = 0;
    this.lastTravel = now;
    this.distance += distance;
    // Seed World traverses at 30 m/s: scale the stride to its navigation pace, cap at three contacts/s.
    const stride = Math.max(0.75, nominalSpeed / 2.2);
    if (this.distance < stride || now - this.lastStep < 1 / 3) return false;
    this.distance %= stride;
    this.lastStep = now;
    return true;
  }
}
