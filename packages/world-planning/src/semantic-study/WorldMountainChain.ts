import type { ShapeRecipe } from "./ComposedShape";
/** Compose individual rock envelopes along a continuous curved axis.
 * @param options Full axis span, transverse footprint width and orientation in metres/radians.
 * @returns Relative rectangles; rock zero is the crown, subsequent rocks alternate along either shoulder.
 */
export function createMountainChain(options: {
  id: string;
  span: number;
  width: number;
  angle: number;
  count: number;
  random: (key: string) => number;
}): ShapeRecipe {
  const { id, span, width, angle, random } = options,
    count = Math.max(3, Math.min(40, Math.round(options.count)));
  const flankCount = count >= 5 ? 2 : 0,
    axisCount = count - flankCount,
    step = span / axisCount;
  const bend = (random(`${id}-chain-bend`) - 0.5) * width * 0.8;
  const blocks = Array.from({ length: count }, (_, j) => {
    const flank = j >= axisCount,
      side = j % 2 ? -1 : 1;
    const rank = flank ? side : j === 0 ? 0 : Math.ceil(j / 2) * side,
      t = rank / (axisCount / 2);
    const along = rank * step,
      across =
        bend * t * t + (flank ? side * width * 0.43 : (random(`${id}-shoulder-offset-${j}`) - 0.5) * width * 0.15);
    const tangent = Math.atan2((2 * bend * t) / (axisCount / 2), step),
      yaw = angle + tangent;
    return {
      id: `${id}-rock-${j}`,
      x: along * Math.cos(angle) - across * Math.sin(angle),
      z: along * Math.sin(angle) + across * Math.cos(angle),
      width:
        (step * (flank ? 0.8 : j === 0 ? 1.3 : 0.85 + random(`${id}-chain-span-${j}`) * 0.4)) /
        Math.max(0.8, Math.cos(tangent)),
      length:
        width *
        (flank
          ? 0.4
          : (flankCount ? 0.65 : 1) * (1 - 0.25 * Math.abs(t)) * (0.65 + random(`${id}-chain-width-${j}`) * 0.35)),
      yaw: (yaw * 180) / Math.PI
    };
  });
  return { id, label: "沿轴岩石体量组", rounding: 0, blocks };
}
