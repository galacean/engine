import { parseConstructionSource, type ConstructionBuilding } from "../runtime/ConstructionSource";
import { shapeCurve } from "../runtime/RecoveredWallConnectionHoles";
import { defaultBuildingRoof } from "./BuildingConfiguration";

/** Local geometry only. Entity owns its center, orientation and world scale. */
export type BuildingShape = { type: "rectangle"; width: number; depth: number } | { type: "circle"; radius: number };

export function defaultBuildingShape(kind: "house" | "wall" | "fence"): BuildingShape {
  return { type: "rectangle", width: 8, depth: kind === "house" ? 6 : kind === "wall" ? 0.3 : 0.15 };
}

/** Source $type constructs a fresh value, instead of merging a union branch
 * with the component's default shape. Runtime assignments may also use literals. */
export class RectangularBuildingShape {
  readonly type = "rectangle";
  width = 8;
  depth = 6;
}
export class CircularBuildingShape {
  readonly type = "circle";
  radius = 3;
}

export function buildingShape(value: BuildingShape, kind: "house" | "wall" | "fence"): BuildingShape {
  if (!value || typeof value !== "object") throw Error("Building shape is required");
  const allowed = value.type === "circle" ? ["type", "radius"] : ["type", "width", "depth"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw Error("Unknown building shape field");
  if (value.type !== "rectangle" && value.type !== "circle") throw Error("Unknown building shape type");
  if (value.type === "circle" && kind !== "house") throw Error("Enclosures require a rectangular strip");
  const parsed = parseConstructionSource({
    version: 1,
    environment: { type: "host_terrain" },
    identity_order: ["shape"],
    buildings: [{ id: "shape", height: 4, material: 0, ...constructionLocalShape(value), roof: defaultBuildingRoof() }]
  }).buildings[0];
  return parsed.circle
    ? { type: "circle", radius: parsed.circle.radius }
    : { type: "rectangle", width: parsed.rectangle!.size[0], depth: parsed.rectangle!.size[1] };
}

export function constructionLocalShape(shape: BuildingShape): Pick<ConstructionBuilding, "circle" | "rectangle"> {
  return shape.type === "circle"
    ? { circle: { center: [0, 0], radius: shape.radius, phase: 0 } }
    : { rectangle: { center: [0, 0], size: [shape.width, shape.depth], rotation: 0 } };
}

/** Same polyline and spacing as compileConstructionDecorations. Do not replace
 * this with an analytic circle: its chord samples define the published wall. */
export function buildingWallCurve(shape: BuildingShape) {
  return shapeCurve(
    shape.type === "circle"
      ? { type: "circle", center: [0, 0], radius: shape.radius, phase: 0 }
      : { type: "rectangle", center: [0, 0], width: shape.width, depth: shape.depth, orientation: [1, 0] },
    0.5
  );
}

/** Convert an initial wall mount to a local Entity position. No u is persisted. */
export function buildingWallPosition(shape: BuildingShape, u: number, height: number): [number, number, number] {
  if (!Number.isFinite(u) || u < 0 || u > 1 || !Number.isFinite(height)) throw Error("Invalid wall mount");
  const curve = buildingWallCurve(shape);
  // Entity positions are doubles. Use the same polyline as the generator, but
  // do not round its interpolation to f32 before the component projects back
  // to wall arclength. That extra rounding can change opening tessellation.
  let i = 0;
  while (i < curve.knots.length - 2 && u > curve.knots[i + 1]) i++;
  const t = (u - curve.knots[i]) / (curve.knots[i + 1] - curve.knots[i]);
  const a = curve.points[i],
    b = curve.points[i + 1];
  return [a[0] + (b[0] - a[0]) * t, height, a[1] + (b[1] - a[1]) * t];
}
