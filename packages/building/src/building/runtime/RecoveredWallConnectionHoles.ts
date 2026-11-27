/** Original shape arclength and connection hole boundary.
 * ShapeParameters::as_curve2 0x10166f268 uses circle spacing .2.
 * This is distinct from the terrain/publisher resampling profile. */
import { add, sub, mul, div, f32, RoofCurve } from "./RecoveredRoofMath";
import type { WallConnectionShape } from "./WallConnectionTypes";
export function shapeCurve(shape: WallConnectionShape, spacing = 0.2): RoofCurve {
  if (!Number.isFinite(spacing) || spacing <= 0 || shape.center.some((v) => !Number.isFinite(v)))
    throw Error("Finite shape and positive spacing required");
  if (shape.type === "rectangle") {
    if (
      !Number.isFinite(shape.width) ||
      !Number.isFinite(shape.depth) ||
      shape.width <= 0 ||
      shape.depth <= 0 ||
      shape.orientation.some((v) => !Number.isFinite(v))
    )
      throw Error("Positive rectangle dimensions required");
    const w = mul(shape.width, 0.5),
      d = mul(shape.depth, 0.5),
      [c, s] = shape.orientation;
    return new RoofCurve(
      [
        [-w, -d],
        [-w, d],
        [w, d],
        [w, -d],
        [-w, -d]
      ].map(([x, z]) => [
        add(shape.center[0], sub(mul(c, x), mul(s, z))),
        add(shape.center[1], add(mul(s, x), mul(c, z)))
      ])
    );
  }
  if (!Number.isFinite(shape.radius) || shape.radius <= 0 || !Number.isFinite(shape.phase))
    throw Error("Finite circle with positive radius required");
  const tau = f32(Math.PI * 2),
    count = Math.max(3, Math.ceil(div(mul(shape.radius, tau), spacing)));
  let phase = f32(f32(shape.phase) % tau);
  if (phase < 0) phase = add(phase, tau);
  return new RoofCurve(
    Array.from({ length: count }, (_, i) => {
      const u = div(i, count - 1),
        angle = add(mul(sub(1, u), tau), phase);
      return [
        add(shape.center[0], mul(shape.radius, f32(Math.cos(angle)))),
        add(shape.center[1], mul(shape.radius, f32(Math.sin(angle))))
      ];
    })
  );
}
