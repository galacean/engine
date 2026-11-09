import { add, sub, mul, div, sqrt, f32 } from "./RecoveredRoofMath";
import { projectWallArclength } from "./RecoveredWallSpace";

type Point = [number, number, number];
export interface StoneArchWalkInput {
  points: readonly (readonly [number, number, number])[];
  heights: readonly number[];
  /** Original segment's normalized wall coordinates, including a possible 1→0 seam. */
  wallParameters: readonly number[];
  cyclic: boolean;
  targetLength?: number;
  minimumRemainder?: number;
}
export interface StoneArchWalkSegment {
  start: Point;
  end: Point;
  startU: number;
  endU: number;
}

const distance = (a: Point, b: Point) => {
  const x = sub(b[0], a[0]),
    y = sub(b[1], a[1]),
    z = sub(b[2], a[2]);
  return sqrt(add(add(mul(x, x), mul(y, y)), mul(z, z)));
};

/** ArchWalker::walk 0x1010a3148, original ARM64 build
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * REA ev_685a3bd0b90f4d4e3d33655fd89ae403884bd73793bb0eba7d2e919b7fc76502.
 * Samples equal distances along the elevated 3D polyline, not equal wall U.
 * Output is exactly the endpoint/parameter contract of callback 0x1010a440c;
 * the callback owns stone transforms, randomization and encoding separately. */
export function walkStoneArch(input: StoneArchWalkInput): StoneArchWalkSegment[] {
  const { points, heights, wallParameters, cyclic } = input;
  const target = f32(input.targetLength ?? 0.56),
    minimumRemainder = f32(input.minimumRemainder ?? 0.1);
  if (
    points.length < 2 ||
    heights.length !== points.length ||
    wallParameters.length !== points.length ||
    points.some((p) => p.length !== 3 || !p.every((x) => Number.isFinite(f32(x)))) ||
    !heights.every((x) => Number.isFinite(f32(x))) ||
    !wallParameters.every((x) => Number.isFinite(f32(x)) && x >= 0 && x <= 1) ||
    typeof cyclic !== "boolean" ||
    !Number.isFinite(target) ||
    target <= 0 ||
    !Number.isFinite(minimumRemainder) ||
    minimumRemainder < 0 ||
    minimumRemainder > 1
  )
    throw Error("Invalid stone arch walk input");

  const elevated: Point[] = points.map((p, i) => [f32(p[0]), add(p[1], heights[i]), f32(p[2])]);
  let total = 0;
  for (let i = 1; i < elevated.length; i++) total = add(total, distance(elevated[i - 1], elevated[i]));
  const count = Math.max(1, Math.floor(add(div(total, target), 0.5)));
  const step = div(total, f32(count));
  if (!(step > 0) || !Number.isFinite(step) || !Number.isSafeInteger(count)) throw Error("Degenerate stone arch walk");

  const result: StoneArchWalkSegment[] = [];
  let lastPoint = elevated[0],
    lastU = f32(wallParameters[0]),
    remainder = 0;
  const emit = (end: Point, endU: number) => {
    result.push({ start: [...lastPoint], end: [...end], startU: lastU, endU });
    lastPoint = end;
    lastU = endU;
  };
  for (let i = 1; i < elevated.length; i++) {
    const a = elevated[i - 1],
      b = elevated[i],
      length = distance(a, b);
    let available = add(remainder, length),
      consumed = 0;
    while (available > step) {
      const next = add(consumed, Math.max(0, sub(step, remainder)));
      if (next === consumed && remainder < step) throw Error("Stone arch walk exceeded floating-point resolution");
      consumed = next;
      const t = div(consumed, length);
      let delta = sub(wallParameters[i], wallParameters[i - 1]);
      if (cyclic) {
        if (delta < -0.5) delta = add(delta, 1);
        else if (delta >= 0.5) delta = sub(delta, 1);
      }
      const u = projectWallArclength(add(f32(wallParameters[i - 1]), mul(t, delta)), 1, cyclic);
      const point = b.map((v, axis) => add(mul(v, t), mul(a[axis], sub(1, t)))) as Point;
      remainder = Math.max(0, sub(remainder, step));
      emit(point, u);
      available = add(remainder, sub(length, consumed));
    }
    remainder = available;
  }
  if (remainder > mul(step, minimumRemainder))
    emit(elevated[elevated.length - 1], f32(wallParameters[wallParameters.length - 1]));
  return result;
}
