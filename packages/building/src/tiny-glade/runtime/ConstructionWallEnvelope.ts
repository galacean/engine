import type { WallConnectionShape } from "./WallConnectionTypes";
import type { MasonryBinding } from "./MasonryDocument";
import { unitFootprintScale } from "./MaterialFootprint";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { RoofCurve } from "./RecoveredRoofMath";

/** Resolved geometry, not author state. The wall curve is the structural datum,
 * not the visible facade. Native producers have different depth conventions:
 * masonry is centred on it; rectangular horizontal boards are offset .125m.
 * These extents exclude the shared spatial warp, which all attached pieces use.
 */
export interface ConstructionWallEnvelope {
  readonly nominalOuter: number;
  readonly depthScale: number;
  readonly bodyOuter: number;
  readonly finishOuter: number;
  readonly plasterOffset: number;
  /** Preserve native attachment recess/projection relative to the nominal face. */
  readonly mountOffset: number;
}
export function constructionWallEnvelope(
  building: ConstructionBuilding,
  binding?: MasonryBinding
): ConstructionWallEnvelope {
  const scale = unitFootprintScale(binding?.footprint);
  const radius = building.circle?.radius;
  const factor =
    radius === undefined
      ? 1
      : 0.9 + 0.1 * Math.min(1, Math.max(0, (radius - 0.9000000357627869) / (3 - 0.9000000357627869)));
  // Geometry owns the reserved facade envelope. Replacing brick with boards,
  // changing arrangement or toggling plaster must not resize a house or notify
  // structure consumers. The native brick (.2975 max) and board (.3 max)
  // recipes fit this common .3175m finish allowance at identity depth.
  const nominal = 0.28 * factor;
  const bodyOuter = 0.3 * scale.depth;
  const plasterOffset = 0.3175 * scale.depth;
  return {
    nominalOuter: nominal * scale.depth,
    depthScale: scale.depth,
    bodyOuter,
    finishOuter: plasterOffset,
    plasterOffset,
    // Native recipes use fixed wall thickness; unit resizing is a host extension.
    // Keep the native default and its shape-specific inset, including small circles.
    mountOffset: nominal * (scale.depth - 1)
  };
}

/** Rigid installation frame for a single wall attachment. Preserve the source
 * arclength chart exactly: expanding/resampling a circle would move its holes,
 * edit anchors and random phase. Native consumers read this translated frame
 * before producing geometry, bones, glass origins, light emitters and SDF cuts.
 */
export function constructionWallMount(curve: RoofCurve, u: number, offset: number): RoofCurve {
  if (offset === 0) return curve;
  const [tx, tz] = curve.tangent(u);
  const dx = -tz * offset,
    dz = tx * offset;
  const move = (p: readonly number[]) => [p[0] + dx, p[1] + dz];
  return {
    points: curve.points.map(move),
    knots: curve.knots.slice(),
    length: curve.length,
    coord: (v) => curve.coord(v),
    sample: (v) => move(curve.sample(v)),
    tangent: (v) => curve.tangent(v)
  };
}

/** Offset a point on the structural perimeter to its resolved finished outline.
 * Corner mitres belong to the outline; random brick bevels do not define it. */
export function constructionWallOutlinePoint(
  shape: WallConnectionShape,
  p: readonly number[],
  outward: number
): number[] {
  const dx = p[0] - shape.center[0],
    dz = p[2] - shape.center[1];
  if (shape.type === "circle") {
    const r = Math.hypot(dx, dz);
    return [
      shape.center[0] + (dx * (shape.radius + outward)) / r,
      p[1],
      shape.center[1] + (dz * (shape.radius + outward)) / r
    ];
  }
  const [c, s] = shape.orientation;
  const sourceX = c * dx + s * dz,
    sourceZ = -s * dx + c * dz;
  const gapX = Math.abs(Math.abs(sourceX) - shape.width / 2),
    gapZ = Math.abs(Math.abs(sourceZ) - shape.depth / 2);
  const tolerance = 2e-7 * Math.max(1, shape.width, shape.depth);
  const x = sourceX + (gapX <= gapZ + tolerance ? Math.sign(sourceX) * outward : 0);
  const z = sourceZ + (gapZ <= gapX + tolerance ? Math.sign(sourceZ) * outward : 0);
  return [shape.center[0] + c * x - s * z, p[1], shape.center[1] + s * x + c * z];
}
