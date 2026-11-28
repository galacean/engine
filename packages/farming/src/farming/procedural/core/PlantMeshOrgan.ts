import type { GrowthCurve, PlantPoint, PlantUV } from "./curves";

/** A measured organ retains its source topology and UVs. Growth never switches meshes. */
export interface PlantMeshOrgan {
  readonly id: string;
  readonly kind: "leaf" | "stem" | "fruit" | "root" | "flower" | "organ";
  readonly anchor: string;
  readonly positions: readonly PlantPoint[];
  readonly uvs: readonly PlantUV[];
  readonly indices: readonly number[];
  readonly poses: GrowthCurve<PlantMeshPose>;
  readonly tint?: boolean;
}

export interface PlantMeshPose {
  readonly scale: PlantPoint;
  /** 0 gathers a blade upward along its attachment axis; 1 restores measured geometry. */
  readonly unfold: number;
  /** Local X rotation, used for a flower head bending as seeds fill. */
  readonly tilt?: number;
}

/** Writes into an existing point so the hot path does not allocate per vertex. */
export function writeMeshOrganPoint(
  out: [number, number, number],
  point: PlantPoint,
  a: PlantMeshPose,
  b: PlantMeshPose,
  t: number,
  origin: PlantPoint,
  angle: number,
  spread: number,
  size: number
): void {
  const unfold = a.unfold + (b.unfold - a.unfold) * t;
  const sx = (a.scale[0] + (b.scale[0] - a.scale[0]) * t) * size;
  const sy = (a.scale[1] + (b.scale[1] - a.scale[1]) * t) * size;
  const sz = (a.scale[2] + (b.scale[2] - a.scale[2]) * t) * size;
  const x = point[0] * sx * unfold,
    z = point[2] * sz * unfold;
  const y = (unfold === 1 ? point[1] : point[1] * unfold + Math.hypot(...point) * (1 - unfold)) * sy;
  const tilt = (a.tilt ?? 0) + ((b.tilt ?? 0) - (a.tilt ?? 0)) * t;
  const cy = tilt ? y * Math.cos(tilt) - z * Math.sin(tilt) : y;
  const cz = tilt ? y * Math.sin(tilt) + z * Math.cos(tilt) : z;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  out[0] = origin[0] + (x * c - cz * s) * spread;
  out[1] = origin[1] + cy;
  out[2] = origin[2] + (x * s + cz * c) * spread;
}
