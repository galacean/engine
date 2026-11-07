import type { ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import { supportShapeFrame } from "./ConstructionSupportFrame";
import { surfaceBoundary, subtractSurfacePolygon, effectiveSurfaceRegions } from "./SurfacePolygon";
import type { DecorationRoofOpening } from "./ConstructionRoofDecorations";
import { placeSurfaceUnits, type SurfaceArrangement } from "./SurfacePlacement";
import type { MaterialFootprint } from "./MaterialFootprint";
import { boundaryUnitDefaults } from "./MaterialPlacementDefaults";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes";
import type { MaterialUnit } from "./UnitPlacementStyle";
import { shapeCurve, finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles.ts";

import { constructionSupport, type SupportCell, type SupportFace, supportCellFaces } from "./PlacementSupport";
import { placeBoundaryUnits, type BoundaryArrangement } from "./BoundaryPlacement";
/** Original flat roofs use a separate floor mesh/material (native producer
 * 0x100564… / updater 0x10159ab6c), with Stone/Wood and Rim/NoRim authoring.
 * This is the host's unified material-unit adaptation, NOT a byte-equivalent
 * native floor tessellator. topY is explicit: callers retain the native -0.69
 * floor-instance offset where applicable. Circular edge cells stay inside their support.
 */
export function buildConstructionFlatRoof(input: {
  id: string;
  variationKey?: string;
  shape: WallConnectionShape;
  wallEnvelope?: ConstructionWallEnvelope;
  topY: number;
  /** Supporting wall height datum; the rim clips its top rows without resetting phase. */
  courseOriginY?: number;
  material: MaterialUnit;
  footprint?: MaterialFootprint;
  rule?: SurfaceArrangement;
  rim?: boolean;
  /** Explicit boundary rule overrides the material preset, independently of the deck rule. */
  boundaryRule?: BoundaryArrangement;
  seed?: number;
  /** Published projected wall arclength in meters, absolute world Y. */
  holes?: readonly WallConnectionWipHole[];
  /** Apertures in this deck's metre UV chart; shared by cells and preview. */
  roofOpenings?: readonly DecorationRoofOpening[];
}) {
  const { id, shape, topY, material } = input;

  if (!id || !Number.isFinite(topY)) throw Error("Stable identity and finite platform elevation required");
  const { width, depth, c, s, point } = supportShapeFrame(shape);
  // Masonry and finish share a datum, not an outside surface. The finish
  // remains outside this cap; roof unit depth changes its inner edge, while
  // wall depth translates its installation plane instead of fattening it.
  const outward = input.wallEnvelope?.nominalOuter ?? 0;
  const deckWidth = width + 2 * outward,
    deckDepth = depth + 2 * outward;
  const rule = input.rule ?? (material === "wooden_plank" ? "parallel_rows" : "staggered_rows");
  const cells: SupportCell[] = [],
    connection_cells: SupportCell[] = [];
  const visualRimFaces: SupportFace[] = [];
  const finishFaces: SupportFace[] = [],
    finishWallUV: number[][] = [];
  const boundary: number[][] =
    shape.type === "circle"
      ? Array.from({ length: Math.max(24, Math.ceil((Math.PI * deckWidth) / 0.35)) }, (_, i) => {
          const n = Math.max(24, Math.ceil((Math.PI * deckWidth) / 0.35)),
            a = (i * Math.PI * 2) / n;
          return [(Math.cos(a) * deckWidth) / 2, (Math.sin(a) * deckDepth) / 2];
        })
      : [
          [-deckWidth / 2, -deckDepth / 2],
          [deckWidth / 2, -deckDepth / 2],
          [deckWidth / 2, deckDepth / 2],
          [-deckWidth / 2, deckDepth / 2]
        ];
  // Local X,-Z surface axes produce an upward-facing right-handed frame.
  const faces: SupportFace[] = [
    {
      points: boundary
        .slice()
        .reverse()
        .map((p) => point(p[0], topY, p[1])),
      uv: boundary
        .slice()
        .reverse()
        .map((p) => [p[0] + width / 2, depth / 2 - p[1]])
    }
  ];
  const deckFace = faces[0];
  const roofHoles = (input.roofOpenings ?? []).filter((h) => h.polygon.length >= 3).map(({ polygon }) => ({ polygon }));
  let deckRegions = [surfaceBoundary(deckFace.uv)];
  for (const hole of roofHoles) {
    const cutter = surfaceBoundary(hole.polygon);
    deckRegions = deckRegions.flatMap((region) => subtractSurfacePolygon(region, cutter));
  }
  // Only the deck owns this metre chart. Parapet face charts may overlap it;
  // never apply roof aperture masks to those unrelated surfaces.
  const deckFaces = effectiveSurfaceRegions(deckRegions).map((region) => ({
    uv: region.points,
    points: region.points.map(([u, v]) => point(u - width / 2, topY, depth / 2 - v))
  }));
  for (const cell of placeSurfaceUnits({
    geometry: {
      id,
      width,
      depth,
      outward,
      topY,
      point,
      tangent: [c, 0, s],
      bitangent: [s, 0, -c],
      normal: [0, 1, 0],
      halfSpan: (z0, z1) =>
        shape.type === "circle"
          ? Math.sqrt(Math.max(0, (deckWidth / 2) ** 2 - Math.max(z0 * z0, z1 * z1)))
          : deckWidth / 2
    },
    unit: { material, footprint: input.footprint },
    rule,
    variationKey: input.variationKey
  }))
    cells.push(cell);
  // The native mode-1 final course uses .69 spacing, even subdivision count,
  // .05 / span jitter and drops even indices (from_curve 0x101038b30).
  // The band is a host geometry domain; random courses within it use mode 1.
  // Native scene-wide wall phase is not implied by this local band adaptation.
  const perimeter = shapeCurve(shape, 0.2),
    wallTopY = topY;
  const perimeterOccupancy: Array<{ u0: number; u1: number; minY: number; maxY: number; occupied: boolean }> = [];
  if (input.rim) {
    const length = perimeter.length;
    const sample = (u: number) => {
      let i = 0;
      while (i + 1 < perimeter.knots.length - 1 && perimeter.knots[i + 1] < u) i++;
      const t = (u - perimeter.knots[i]) / (perimeter.knots[i + 1] - perimeter.knots[i]);
      return perimeter.points[i].map((x, k) => x + (perimeter.points[i + 1][k] - x) * t);
    };
    const published = shapeCurve(shape, 0.5);
    const holes = finalizeWallConnectionHoles(input.holes ?? [], published.length, true);
    const publishedU = (u: number) => {
      if (u <= 0) return 0;
      if (u >= 1) return published.length;
      const p = sample(u);
      let distance = Infinity,
        result = 0;
      for (let i = 1; i < published.points.length; i++) {
        const a = published.points[i - 1],
          b = published.points[i],
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
        const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dz) ** 2;
        if (d < distance) {
          distance = d;
          result = (published.knots[i - 1] + t * (published.knots[i] - published.knots[i - 1])) * published.length;
        }
      }
      return result;
    };
    const frame = (
      u0: number,
      u1: number,
      y0: number,
      y1: number,
      key: string,
      unitDepth: number
    ): SupportCell | undefined => {
      const a = sample(u0),
        b = sample(u1);
      let span = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (span < 1e-6) return;
      const tx = (b[0] - a[0]) / span,
        tz = (b[1] - a[1]) / span,
        originalX = (a[0] + b[0]) / 2,
        originalZ = (a[1] + b[1]) / 2;
      const halfDepth = unitDepth / 2;
      const mount = input.wallEnvelope ? input.wallEnvelope.nominalOuter - unit.depth / 2 : 0;
      let x = originalX - tz * mount,
        z = originalZ + tx * mount;
      if (shape.type === "rectangle" && input.wallEnvelope) {
        const corners = [
          0,
          shape.depth / perimeter.length,
          (shape.depth + shape.width) / perimeter.length,
          (2 * shape.depth + shape.width) / perimeter.length,
          1
        ];
        const start = corners.some((k) => Math.abs(k - u0) < 1e-7) ? outward : 0;
        const end = corners.some((k) => Math.abs(k - u1) < 1e-7) ? outward : 0;
        x += (tx * (end - start)) / 2;
        z += (tz * (end - start)) / 2;
        span += start + end;
      } else if (shape.type === "circle" && input.wallEnvelope) {
        const r = Math.hypot(originalX - shape.center[0], originalZ - shape.center[1]);
        x = shape.center[0] + ((originalX - shape.center[0]) * (shape.radius + mount)) / r;
        z = shape.center[1] + ((originalZ - shape.center[1]) * (shape.radius + mount)) / r;
      }
      const localX = c * (originalX - shape.center[0]) + s * (originalZ - shape.center[1]),
        localZ = -s * (originalX - shape.center[0]) + c * (originalZ - shape.center[1]);
      const cell: SupportCell = {
        id: key,
        logical_id: key,
        surface_id: id,
        anchor_uv: [localX + width / 2, depth / 2 - localZ],
        center: [x, (y0 + y1) / 2, z],
        tangent: [tx, 0, tz],
        bitangent: [0, 1, 0],
        normal: [-tz, 0, tx],
        size: [span, y1 - y0, 2 * halfDepth]
      };
      return cell;
    };

    const cuts =
      shape.type === "rectangle"
        ? [0, shape.depth / length, (shape.depth + shape.width) / length, (2 * shape.depth + shape.width) / length, 1]
        : [0, 1];
    const geometry = {
      id,
      variationKey: input.variationKey,
      length,
      cuts,
      publishedU,
      holes,
      frame,
      courseOriginY: Math.min(input.courseOriginY ?? topY, topY)
    };
    const preset = boundaryUnitDefaults(material, input.footprint);
    const unit = preset.unit;
    // Geometry owns the physical band. The rule owns random rows, alternating
    // top slots and source shape data; explicit upper rules retain lower rows.
    const bands = [
      {
        id: "parapet",
        minY: topY,
        maxY: topY + 0.69,
        publishOccupancy: true,
        rule: { ...preset.rule, upper: input.boundaryRule }
      }
    ];
    {
      const placed = placeBoundaryUnits({ geometry, unit, bands, seed: input.seed ?? 0 });
      for (const cell of placed.cells) {
        connection_cells.push(cell);
        for (const face of supportCellFaces(cell)) faces.push(face);
        const visibleFaces = supportCellFaces(cell, material);
        for (const face of visibleFaces) visualRimFaces.push(face);
        // The exterior face and its original wall chart travel together. This
        // retains cut endpoints and deformed corners without re-projecting meshes.
        const outside = visibleFaces[1],
          interval = cell.boundaryU!;
        finishFaces.push(outside);
        for (const [i, p] of outside.points.entries()) finishWallUV.push([interval[i === 0 || i === 3 ? 0 : 1], p[1]]);
      }
      for (const slot of placed.occupancy) perimeterOccupancy.push(slot);
    }
  }
  const rimFaces = faces.slice(1);
  const support = constructionSupport(id, material, [...deckFaces, ...rimFaces]);
  const deck = constructionSupport(id, material, [deckFace]);
  const rim = constructionSupport(id, material, rimFaces);
  return {
    ...support,
    // Preview retains original deck triangles so tiny fragments inherit the
    // original UV map and stable plane during structural comparison.
    deckGeometry: { ...deck.geometry, holes: roofHoles },
    rimGeometry: rim.geometry,
    rimVisualGeometry: constructionSupport(id, material, visualRimFaces).geometry,
    finishSupport: { geometry: constructionSupport(id, material, finishFaces).geometry, wallUV: finishWallUV },
    cells,
    connection_cells,
    perimeter_cells: connection_cells,
    perimeterOccupancy,
    wallTopY,
    rule,
    topY
  };
}
