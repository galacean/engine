/** A bounded, asymmetric curved slope in metres; independent of POI ownership. */
export interface ReliefPatch {
  id: string;
  x: number;
  z: number;
  yawDegrees: number;
  lengthM: number;
  leftWidthM: number;
  rightWidthM: number;
  heightM: number;
  bendM: number;
}
const smooth = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
/** Cross-section of the authored band. Preview and height evaluation share these boundaries and curved axis. */
export function reliefSection(q: ReliefPatch, t: number) {
  const sin = Math.sin(Math.PI * t),
    scale = 0.8 + 0.2 * sin;
  return {
    along: (t - 0.65) * q.lengthM,
    across: q.bendM * (sin - Math.sin(Math.PI * 0.65)),
    left: q.leftWidthM * scale,
    right: q.rightWidthM * scale,
    height: q.heightM * smooth(t / 0.65) * (1 - smooth((t - 0.65) / 0.35))
  };
}
/** Evaluate signed displacement. End and side boundaries join with zero first derivative.
 * @param patches Immutable authoring patches.
 * @returns A local displacement sampler; no terrain, sea or building policy is embedded here.
 */
export function reliefField(patches: readonly ReliefPatch[]) {
  for (const q of patches) {
    if (
      ![q.x, q.z, q.yawDegrees, q.lengthM, q.leftWidthM, q.rightWidthM, q.heightM, q.bendM].every(Number.isFinite) ||
      q.lengthM <= 0 ||
      q.leftWidthM <= 0 ||
      q.rightWidthM <= 0
    )
      throw new Error("缓坡参数须有限，长度和两侧宽度须大于零");
  }
  const prepared = patches.map((q) => ({
    ...q,
    c: Math.cos((q.yawDegrees * Math.PI) / 180),
    s: Math.sin((q.yawDegrees * Math.PI) / 180)
  }));
  return (p: { x: number; z: number }) =>
    prepared.reduce((height, q) => {
      const dx = p.x - q.x,
        dz = p.z - q.z,
        t = (dx * q.c + dz * q.s) / q.lengthM + 0.65;
      if (t <= 0 || t >= 1) return height;
      const section = reliefSection(q, t);
      const cross = -dx * q.s + dz * q.c - section.across;
      const width = cross < 0 ? section.left : section.right;
      if (Math.abs(cross) >= width) return height;
      const shoulder = (1 + Math.cos((Math.PI * cross) / width)) / 2;
      return height + section.height * shoulder;
    }, 0);
}
