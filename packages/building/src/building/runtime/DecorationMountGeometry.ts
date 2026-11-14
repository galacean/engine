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
