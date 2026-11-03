import { wallRoofJointHeight, type ConstructionWallRoofJoint } from "./ConstructionWallRoofJoint";
import { insetMaterialSpan } from "./ConstructionCell";
import { unitFootprintScale } from "./MaterialFootprint";
import { resolvedArrangement, type MasonryBinding } from "./MasonryDocument";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallInstance } from "./WallTypes";
import { finalizeWallConnectionHoles } from "./RecoveredWallConnectionHoles";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
/** Material defaults select a rule; the rule emits placements independent of the
 * selected mesh. Generic charts are a host extension, not recovered native code. */
export function nativeWallCells(id: string, instances: WallInstance[], profile: PublishedWallProfile) {
  return instances.map((instance) => {
    const d = new DataView(instance.domain96.buffer, instance.domain96.byteOffset, 96);
    const columns = [0, 1, 2].map((c) => [0, 1, 2].map((i) => d.getFloat32((c * 3 + i) * 4, true)));
    const size = columns.map((c) => Math.hypot(...c));
    const center = [0, 1, 2].map((i) => d.getFloat32(36 + i * 4, true));
    return {
      id: instance.id,
      logical_id: instance.id,
      surface_id: id,
      anchor_uv: [(d.getFloat32(84, true) + d.getFloat32(88, true)) / 2, center[1] - profile.minGround],
      center,
      tangent: columns[0].map((v) => v / (size[0] || 1)),
      bitangent: columns[1].map((v) => v / (size[1] || 1)),
      normal: columns[2].map((v) => v / (size[2] || 1)),
      size
    };
  });
}
export function wallSurfaceGeometry(id: string, p: PublishedWallProfile, joint?: ConstructionWallRoofJoint) {
  const vertices: number[][] = [],
    uv: number[][] = [],
    triangles: number[][] = [];
  const upper = (i: number) => (joint ? p.maxYGable : p.top[i] + 0.12);
  let u = 0;
  for (let i = 1; i < p.points.length; i++) {
    const a = p.points[i - 1],
      b = p.points[i],
      l = Math.hypot(b[0] - a[0], b[2] - a[2]),
      base = vertices.length;
    // The wall profile owns the lower support boundary, including arch cuts.
    // Keep the original metric UV chart: raising its lower edge does not reset
    // paint coordinates or shift edits elsewhere on this wall.
    const lowerA = a[1] + Math.max(0, p.third[i - 1]),
      lowerB = b[1] + Math.max(0, p.third[i]);
    vertices.push(
      lowerA === a[1] ? a : [a[0], lowerA, a[2]],
      lowerB === b[1] ? b : [b[0], lowerB, b[2]],
      [b[0], upper(i), b[2]],
      [a[0], upper(i - 1), a[2]]
    );
    uv.push(
      [u, lowerA - p.minGround],
      [u + l, lowerB - p.minGround],
      [u + l, upper(i) - p.minGround],
      [u, upper(i - 1) - p.minGround]
    );
    triangles.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
    u += l;
  }
  return {
    id,
    type: "triangulated",
    vertices,
    uv,
    triangles,
    width: u,
    height: p.maxYGable + 0.12 - p.minGround,
    holes: []
  };
}
function subtractRect(r: number[], h: number[]): number[][] {
  const [x, y, X, Y] = r,
    [a, b, A, B] = h;
  if (A <= x || a >= X || B <= y || b >= Y) return [r];
  const lo = Math.max(x, a),
    hi = Math.min(X, A),
    bot = Math.max(y, b),
    top = Math.min(Y, B);
  return [
    [x, y, lo, Y],
    [hi, y, X, Y],
    [lo, y, hi, bot],
    [lo, top, hi, Y]
  ].filter((q) => q[2] - q[0] > 1e-5 && q[3] - q[1] > 1e-5);
}
export function arrangedWallCells(
  binding: MasonryBinding,
  p: PublishedWallProfile,
  holes: WallConnectionWipHole[],
  nominalOuter?: number,
  joint?: ConstructionWallRoofJoint
) {
  const rule = resolvedArrangement(binding),
    cells: any[] = [];
  const scale = unitFootprintScale(binding.footprint);
  const pitch =
    rule === "parallel_rows"
      ? 0.22 * scale.width
      : rule === "horizontal_rows"
        ? 1.4 * scale.width
        : binding.footprint.width;
  const rowHeight =
    rule === "parallel_rows"
      ? Math.max(0.2, p.maxYGable - p.minGround + 0.12) * scale.height
      : rule === "horizontal_rows"
        ? 0.3944 * scale.height
        : binding.footprint.height;
  const cut = finalizeWallConnectionHoles(holes, p.control.length, true).map((h) => [h.minU, h.minY, h.maxU, h.maxY]);
  let u = 0;
  for (let edge = 1; edge < p.points.length; edge++) {
    const a = p.points[edge - 1],
      b = p.points[edge],
      l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (l < 1e-8) continue;
    const tangent = [(b[0] - a[0]) / l, 0, (b[2] - a[2]) / l],
      normal = [-tangent[2], 0, tangent[0]];
    for (let row = 0; row < Math.ceil((p.maxYGable + 0.12 - p.minGround) / rowHeight); row++) {
      const shift = rule === "staggered_rows" || rule === "overlap_rows" ? (row % 2) * 0.5 : 0;
      for (let col = Math.floor(u / pitch - shift); col < Math.ceil((u + l) / pitch - shift); col++) {
        const x = Math.max(u, (col + shift) * pitch),
          X = Math.min(u + l, (col + shift + 1) * pitch),
          t = ((x + X) / 2 - u) / l;
        const lowerA = a[1] + Math.max(0, p.third[edge - 1]),
          lowerB = b[1] + Math.max(0, p.third[edge]);
        const bottom =
            p.third[edge - 1] > 0 || p.third[edge] > 0
              ? Math.max(lowerA + ((x - u) / l) * (lowerB - lowerA), lowerA + ((X - u) / l) * (lowerB - lowerA))
              : a[1] + t * (b[1] - a[1]),
          top = joint
            ? Math.max(
                ...[x, (x + X) / 2, X].map((q) => {
                  const s = (q - u) / l;
                  return wallRoofJointHeight(
                    joint,
                    a[0] + s * (b[0] - a[0]) + normal[0] * (nominalOuter ?? 0),
                    a[2] + s * (b[2] - a[2]) + normal[2] * (nominalOuter ?? 0)
                  );
                })
              )
            : p.top[edge - 1] + t * (p.top[edge] - p.top[edge - 1]) + 0.12;
        const y = Math.max(bottom, p.minGround + row * rowHeight),
          Y = Math.min(top, p.minGround + (row + (rule === "overlap_rows" ? 1.15 : 1)) * rowHeight);
        if (X - x < 0.015 || Y - y < 0.015) continue;
        let pieces = [[x, y, X, Y]];
        for (const h of cut) pieces = pieces.flatMap((q) => subtractRect(q, h));
        pieces.forEach((q, n) => {
          const width = q[2] - q[0],
            height = q[3] - q[1];
          // Cuts may leave a sliver smaller than the nominal 8 mm joint. Keep
          // the joint proportional there so it cannot invert the affine axes.
          const size = [insetMaterialSpan(width, 0.008), insetMaterialSpan(height, 0.008), binding.footprint.depth];
          const s = ((q[0] + q[2]) / 2 - u) / l,
            id = `${binding.geometry_id}/${edge}/${row}/${col}/${n}`;
          cells.push({
            id,
            logical_id: id,
            surface_id: binding.geometry_id,
            anchor_uv: [(q[0] + q[2]) / 2, (q[1] + q[3]) / 2 - p.minGround],
            center: [
              a[0] + s * (b[0] - a[0]) + normal[0] * (nominalOuter === undefined ? 0 : nominalOuter - size[2] / 2),
              (q[1] + q[3]) / 2,
              a[2] + s * (b[2] - a[2]) + normal[2] * (nominalOuter === undefined ? 0 : nominalOuter - size[2] / 2)
            ],
            tangent,
            bitangent: [0, 1, 0],
            normal,
            size
          });
        });
      }
    }
    u += l;
  }
  return cells;
}
/** A shared UV lattice sampled on finite chart triangles; shared cell centers
 * are emitted once. Roof boundaries remain supplied by the original generator. */
export function arrangedSurfaceCells(binding: MasonryBinding, g: any) {
  const rule = resolvedArrangement(binding),
    cells: any[] = [],
    emitted = new Set<string>();
  const scale = unitFootprintScale(binding.footprint);
  const w =
      rule === "parallel_rows"
        ? 0.22 * scale.width
        : rule === "horizontal_rows"
          ? 1.4 * scale.width
          : binding.footprint.width,
    h =
      rule === "parallel_rows"
        ? 1.2 * scale.height
        : rule === "horizontal_rows"
          ? 0.3944 * scale.height
          : binding.footprint.height;
  for (let piece = 0; piece < g.triangles.length; piece++) {
    const tri = g.triangles[piece],
      uv = tri.map((i: number) => g.uv[i]),
      v = tri.map((i: number) => g.vertices[i]);
    const [a, b, c] = uv,
      det = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(det) < 1e-10) continue;
    const du = v[0].map(
      (_: number, i: number) => ((v[1][i] - v[0][i]) * (c[1] - a[1]) - (v[2][i] - v[0][i]) * (b[1] - a[1])) / det
    );
    const dv = v[0].map(
      (_: number, i: number) => ((v[2][i] - v[0][i]) * (b[0] - a[0]) - (v[1][i] - v[0][i]) * (c[0] - a[0])) / det
    );
    const norm = (q: number[]) => {
      const l = Math.hypot(...q);
      return q.map((x) => x / l);
    };
    const tangent = norm(du),
      normal = norm([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]),
      bitangent = [
        normal[1] * tangent[2] - normal[2] * tangent[1],
        normal[2] * tangent[0] - normal[0] * tangent[2],
        normal[0] * tangent[1] - normal[1] * tangent[0]
      ];
    for (
      let row = Math.floor(Math.min(...uv.map((p: number[]) => p[1])) / h);
      row < Math.ceil(Math.max(...uv.map((p: number[]) => p[1])) / h);
      row++
    ) {
      const shift = rule === "staggered_rows" || rule === "overlap_rows" ? (row % 2) * 0.5 : 0;
      for (
        let col = Math.floor(Math.min(...uv.map((p: number[]) => p[0])) / w - shift);
        col < Math.ceil(Math.max(...uv.map((p: number[]) => p[0])) / w - shift);
        col++
      ) {
        const x = (col + shift + 0.5) * w,
          y = (row + 0.5) * h,
          k = `${row}/${col}`;
        const u = ((x - a[0]) * (c[1] - a[1]) - (y - a[1]) * (c[0] - a[0])) / det,
          t = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / det;
        if (u < -1e-8 || t < -1e-8 || u + t > 1 + 1e-8 || emitted.has(k)) continue;
        emitted.add(k);
        const id = binding.geometry_id + "/" + k;
        cells.push({
          id,
          logical_id: id,
          surface_id: binding.geometry_id,
          surface_piece: piece,
          anchor_uv: [x, y],
          center: v[0].map((p: number, i: number) => p + u * (v[1][i] - p) + t * (v[2][i] - p)),
          tangent,
          bitangent,
          normal,
          size: [w * 0.98, h * (rule === "overlap_rows" ? 1.15 : 0.98), binding.footprint.depth]
        });
      }
    }
  }
  return cells;
}
