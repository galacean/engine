import { decorationConstraintFact, type MeasuredDecorationConstraint } from "./ConstructionDecorationCatalog";
import { recoveredRoofAttachmentForward } from "./RecoveredRoofAttachment";
import { decodeDormer } from "./GothicClip";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import { supportShapeFrame } from "./ConstructionSupportFrame";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import type { DecorationAssembly } from "./ConstructionDecorationAssembly";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { ConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { WallConnectionShape } from "./WallConnectionTypes";

/** Roof openings use the same metre chart as the flat deck's geometry/cells. */
export interface DecorationRoofOpening {
  id: string;
  /** Exact metre-chart section of raw48 at the deck, empty when raised above it. */
  polygon: number[][];
  /** Original oriented volume consumed by every resident material shader. */
  raw48: Uint8Array;
}
export interface RoofDecorationOccupancy {
  id: string;
  polygon: number[][];
  minY: number;
  maxY: number;
}
/** Host adapter: normalized roof uv addresses the published flat deck. Source
 * X/Z follow the original roof attachment direction; source Y remains up. Original
 * model pivots are retained (a hatch extends below its mounting plane).
 * Width/height are source X/Y spans; depth follows width's uniform XZ scale.
 */
export function compileFlatRoofDecoration(
  building: ConstructionBuilding,
  shape: WallConnectionShape,
  deckY: number,
  spec: ConstructionDecorationSpec,
  assembly: DecorationAssembly,
  type: string,
  occupied: RoofDecorationOccupancy[],
  result: CompiledConstructionDecorations,
  wallSlot: number
) {
  const frame = supportShapeFrame(shape),
    b = assembly.bounds;
  const sx = spec.width / (b.max[0] - b.min[0]),
    sy = spec.height / (b.max[1] - b.min[1]);
  const x = spec.uv![0] * frame.width - frame.width / 2,
    z = frame.depth / 2 - spec.uv![1] * frame.depth;
  const hatch = type === "hatch-cottage" || type === "hatch-gothic";
  const [nx, nz] = hatch ? recoveredRoofAttachmentForward(shape, x, z) : [-frame.s, frame.c];
  const axes: [number[], number[], number[]] = [
    [nz * sx, 0, -nx * sx],
    [0, sy, 0],
    [nx * sx, 0, nz * sx]
  ];
  const local = (px: number, pz: number): [number, number] => {
    const dx = (nz * px + nx * pz) * sx,
      dz = (-nx * px + nz * pz) * sx;
    return [x + frame.c * dx + frame.s * dz, z - frame.s * dx + frame.c * dz];
  };
  const polygon = [
    [b.min[0], b.min[2]],
    [b.max[0], b.min[2]],
    [b.max[0], b.max[2]],
    [b.min[0], b.max[2]]
  ].map(([px, pz]) => local(px, pz));
  const minY = deckY + spec.bottom + b.min[1] * sy,
    maxY = deckY + spec.bottom + b.max[1] * sy;
  const inside = polygon.every(([px, pz]) =>
    shape.type === "circle"
      ? px * px + pz * pz <= shape.radius * shape.radius
      : Math.abs(px) <= frame.width / 2 && Math.abs(pz) <= frame.depth / 2
  );
  if (!inside) {
    const constraints: MeasuredDecorationConstraint[] =
      shape.type === "circle"
        ? [
            {
              metric: "roof_footprint_radius_squared",
              measured: Math.max(...polygon.map(([px, pz]) => px * px + pz * pz)),
              limit: shape.radius * shape.radius,
              relation: "<=",
              unit: "m2"
            }
          ]
        : [
            {
              metric: "roof_footprint_abs_x",
              measured: Math.max(...polygon.map((p) => Math.abs(p[0]))),
              limit: frame.width / 2,
              relation: "<=",
              unit: "m"
            },
            {
              metric: "roof_footprint_abs_z",
              measured: Math.max(...polygon.map((p) => Math.abs(p[1]))),
              limit: frame.depth / 2,
              relation: "<=",
              unit: "m"
            }
          ];
    result.diagnostics.push({
      id: spec.id,
      code: "INSUFFICIENT_SPACE",
      reason: "Decoration footprint exceeds the flat roof boundary",
      constraints: constraints.filter((c) => c.measured > c.limit).map(decorationConstraintFact)
    });
    return;
  }
  if (type === "hatch-cottage" || type === "hatch-gothic") {
    // Native rectangle inset is (fullSize - 1.859999895) / 2;
    // circles reject intersecting/tangent radius-.9299999475 boundaries.
    // The public resize extension scales this installation clearance with XZ.
    const clearance = Math.fround(1.859999895) * 0.5 * sx;
    const fits =
      shape.type === "circle"
        ? shape.radius > clearance && Math.hypot(x, z) < shape.radius - clearance
        : Math.abs(x) <= frame.width / 2 - clearance && Math.abs(z) <= frame.depth / 2 - clearance;
    if (!fits) {
      const constraints: MeasuredDecorationConstraint[] =
        shape.type === "circle"
          ? [
              {
                metric: "roof_center_radius",
                measured: Math.hypot(x, z),
                limit: shape.radius - clearance,
                relation: "<",
                unit: "m"
              }
            ]
          : [
              {
                metric: "roof_center_abs_x",
                measured: Math.abs(x),
                limit: frame.width / 2 - clearance,
                relation: "<=",
                unit: "m"
              },
              {
                metric: "roof_center_abs_z",
                measured: Math.abs(z),
                limit: frame.depth / 2 - clearance,
                relation: "<=",
                unit: "m"
              }
            ];
      result.diagnostics.push({
        id: spec.id,
        code: "INSUFFICIENT_SPACE",
        reason: `Hatch installation requires its center to remain ${clearance.toFixed(4)} metres from the roof edge`,
        constraints: constraints
          .filter((c) => (c.relation === "<" ? c.measured >= c.limit : c.measured > c.limit))
          .map(decorationConstraintFact)
      });
      return;
    }
  }
  const overlaps = occupied.filter((p) => minY < p.maxY && maxY > p.minY && overlapFootprints(polygon, p.polygon));
  if (overlaps.length) {
    result.diagnostics.push({
      id: spec.id,
      code: "OVERLAP",
      reason: "Roof decoration overlaps an existing attachment",
      relatedIds: overlaps.map((p) => p.id)
    });
    return;
  }
  occupied.push({ id: spec.id, polygon, minY, maxY });
  const filament =
    type === "roof-lantern"
      ? assembly.parts.find((part) => part.material === DecorationMaterial.lanternEmission)?.emissionOrigin
      : undefined;
  if (type === "roof-lantern" && !filament) throw Error("Roof lamp Prefab requires an authored emission origin");
  const parts = decorationAssemblyGeometry(building, spec, assembly, type === "roof-lantern" ? "lantern" : "hatch", {
    origin: frame.point(x, deckY + spec.bottom, z),
    axes,
    lightPosition: filament
      ? (frame.point(x + filament[0], deckY + spec.bottom + filament[1], z + filament[2]) as [number, number, number])
      : undefined,
    editUV: (source) => {
      const [px, pz] = local(source[0], source[2]);
      return [px + frame.width / 2, frame.depth / 2 - pz];
    }
  });
  for (const part of parts) result.parts.push(part);
  if (type === "hatch-cottage" || type === "hatch-gothic") {
    // generate_trap_doors 0x1011b…: cottage SSBO full size is
    // [1.125,.375,1.125], not half extents. Native floor clipping admits
    // abs(localXZ)<.5 and -.5<localY<.5 after division by that full size.
    // Host resizing scales the same original cut and visible assembly.
    const raw48 = new Uint8Array(48),
      view = new DataView(raw48.buffer);
    frame.point(x, deckY + spec.bottom, z).forEach((v, i) => view.setFloat32(i * 4, v, true));
    view.setUint32(12, wallSlot, true);
    [1.125 * sx, 0.375 * sy, 1.125 * sx].forEach((v, i) => view.setFloat32(16 + i * 4, v, true));
    view.setFloat32(32, nx, true);
    view.setFloat32(36, nz, true);
    view.setFloat32(40, 1, true);
    view.setFloat32(44, -50, true);
    const d = decodeDormer(raw48),
      section: number[][] = [];
    const dy = (deckY - d.position[1]) / d.size[1];
    if (dy > -0.5 && dy < 0.5) {
      for (const [a, b] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5]
      ]) {
        // Inverse of the native normalized axes; use decoded f32 values so
        // CPU geometry and GPU clipping share one stored volume representation.
        const wx = d.position[0] - d.normal[2] * d.size[0] * a + d.normal[0] * d.size[2] * b;
        const wz = d.position[2] + d.normal[0] * d.size[0] * a + d.normal[2] * d.size[2] * b;
        const dx = wx - shape.center[0],
          dz = wz - shape.center[1];
        section.push([frame.c * dx + frame.s * dz + frame.width / 2, frame.depth / 2 + frame.s * dx - frame.c * dz]);
      }
    }
    result.roofOpenings.push({ id: spec.id, polygon: section, raw48 });
  }
}

/** Separating axes of both oriented boxes; AABB overlap is only a broad phase
 * and would incorrectly reject valid neighbouring rotated attachments. */
function overlapFootprints(a: number[][], b: number[][]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        axis = [q[1] - p[1], p[0] - q[0]];
      const project = (points: number[][]) => points.map((p) => p[0] * axis[0] + p[1] * axis[1]);
      const x = project(a),
        y = project(b);
      if (Math.max(...x) <= Math.min(...y) || Math.max(...y) <= Math.min(...x)) return false;
    }
  return true;
}
