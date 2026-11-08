import type { WallConnectionShape } from "./WallConnectionTypes";

/** Shape-local frame shared by surfaces and their attached components. */
export function supportShapeFrame(shape: WallConnectionShape) {
  const circle = shape.type === "circle";
  const width = circle ? shape.radius * 2 : shape.width,
    depth = circle ? shape.radius * 2 : shape.depth;
  const angle = circle ? shape.phase : Math.atan2(shape.orientation[1], shape.orientation[0]);
  if (![...shape.center, width, depth, angle].every(Number.isFinite) || width <= 0 || depth <= 0)
    throw Error("Finite positive support shape required");
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const point = (x: number, y: number, z: number) => [
    shape.center[0] + c * x - s * z,
    y,
    shape.center[1] + s * x + c * z
  ];
  return { width, depth, c, s, point };
}
