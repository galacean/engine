/** Numeric placement geometry shared by fitting and mesh production. */
export interface DecorationMountFrame {
  origin: readonly number[];
  axes: readonly [readonly number[], readonly number[], readonly number[]];
}
export function decorationMountPosition(frame: DecorationMountFrame, p: readonly number[]) {
  return frame.origin.map(
    (v, axis) => v + frame.axes[0][axis] * p[0] + frame.axes[1][axis] * p[1] + frame.axes[2][axis] * p[2]
  );
}
export interface DecorationWallChart {
  points: readonly (readonly number[])[];
  knots: readonly number[];
}
/** Nearest segment projection, including the two incident faces at a corner. */
export function decorationWallCoordinate(chart: DecorationWallChart, world: readonly number[]) {
  let distance = Infinity,
    u = 0;
  for (let i = 0; i < chart.points.length - 1; i++) {
    const a = chart.points[i],
      b = chart.points[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((world[0] - a[0]) * dx + (world[2] - a[1]) * dz) / (dx * dx + dz * dz)));
    const d2 = (world[0] - a[0] - t * dx) ** 2 + (world[2] - a[1] - t * dz) ** 2;
    if (d2 < distance) {
      distance = d2;
      u = chart.knots[i] + t * (chart.knots[i + 1] - chart.knots[i]);
    }
  }
  return u;
}
