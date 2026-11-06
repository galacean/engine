/** Framework support-triangle intersections, not original extra joint pieces.
 * Original pitched roofs compose independent owners through depth testing.
 */
import type { RoofMapping, RoofPatch } from "./RecoveredRoofContext";
import { add, sub, scale, dot, cross, length, unit, area, clean, intersect, turn } from "./RecoveredRoofGeometry";
function section(tri: number[][], n: number[], o: number[], tol: number) {
  const ds = tri.map((p) => dot(n, sub(p, o))),
    points: number[][] = [];
  if (Math.min(...ds) > tol || Math.max(...ds) < -tol) return points;
  for (let i = 0; i < 3; i++) {
    const a = ds[i],
      b = ds[(i + 1) % 3],
      p = tri[i],
      q = tri[(i + 1) % 3];
    if (Math.abs(a) <= tol) points.push(p);
    if ((a < -tol && b > tol) || (a > tol && b < -tol)) points.push(add(p, scale(sub(q, p), a / (a - b))));
  }
  return points.filter((p, i) => !points.slice(0, i).some((q) => length(sub(p, q)) <= tol));
}
function weights(p: number[], tri: number[][]) {
  const [a, b, c] = tri,
    v0 = sub(b, a),
    v1 = sub(c, a),
    v2 = sub(p, a),
    d00 = dot(v0, v0),
    d01 = dot(v0, v1),
    d11 = dot(v1, v1),
    den = d00 * d11 - d01 * d01;
  if (den <= 0) throw Error("Degenerate support");
  const beta = (d11 * dot(v2, v0) - d01 * dot(v2, v1)) / den,
    gamma = (d00 * dot(v2, v1) - d01 * dot(v2, v0)) / den;
  return [1 - beta - gamma, beta, gamma];
}
function insideInterval(a: number[], b: number[], poly: number[][]): number[] | null {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      first = turn(p, q, a),
      last = turn(p, q, b),
      delta = last - first;
    if (Math.abs(delta) < 1e-15) {
      if (first < 0) return null;
      continue;
    }
    const bound = -first / delta;
    if (delta > 0) lo = Math.max(lo, bound);
    else hi = Math.min(hi, bound);
    if (hi < lo) return null;
  }
  return hi >= lo ? [Math.max(0, lo), Math.min(1, hi)] : null;
}
function outsideHoles(world: number[][], patches: RoofPatch[], tol: number) {
  let remaining = [[0, 1]];
  const removed: any[] = [];
  for (const p of patches) {
    const g = p.geometry,
      [a, b] = world.map((w) => [dot(sub(w, g.origin), g.u_axis), dot(sub(w, g.origin), g.v_axis)]);
    for (const cutter of p.cutters) {
      const interval = insideInterval(a, b, cutter.polygon);
      if (!interval || interval[1] <= interval[0]) continue;
      const [lo, hi] = interval,
        updated: number[][] = [];
      for (const [x, y] of remaining) {
        if (hi <= x || lo >= y) {
          updated.push([x, y]);
          continue;
        }
        if (x < lo) updated.push([x, Math.min(lo, y)]);
        if (hi < y) updated.push([Math.max(hi, x), y]);
      }
      remaining = updated;
      removed.push({ triangle_index: p.triangle_index, source_decorator_id: cutter.source_decorator_id, interval });
    }
  }
  const size = length(sub(world[1], world[0]));
  return { remaining: remaining.filter((r) => (r[1] - r[0]) * size > tol), removed };
}
export function deriveRoofContact(a: RoofMapping, b: RoofMapping, tolerance = 1e-6) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw Error("Positive contact tolerance required");
  if (a.wall_id === b.wall_id) throw Error("Distinct roof owners required");
  const segments: any[] = [],
    unknown: any[] = [],
    point_contacts: any[] = [],
    clipped: any[] = [];
  let examined = 0,
    candidates = 0;
  for (const pa of a.patches) {
    const ta = pa.native_world_triangle,
      na = cross(sub(ta[1], ta[0]), sub(ta[2], ta[0]));
    for (const pb of b.patches) {
      examined++;
      const tb = pb.native_world_triangle;
      if (
        [0, 1, 2].some(
          (k) =>
            Math.max(...ta.map((p) => p[k])) < Math.min(...tb.map((p) => p[k])) - tolerance ||
            Math.max(...tb.map((p) => p[k])) < Math.min(...ta.map((p) => p[k])) - tolerance
        )
      )
        continue;
      candidates++;
      const pair = [pa.triangle_index, pb.triangle_index],
        nb = cross(sub(tb[1], tb[0]), sub(tb[2], tb[0]));
      if (length(na) <= tolerance * tolerance || length(nb) <= tolerance * tolerance) {
        unknown.push({ triangle_indices: pair, reason: "degenerate_support_triangle" });
        continue;
      }
      const an = unit(na),
        bn = unit(nb);
      let direction = cross(an, bn);
      // Use the same world-space plane tolerance as section(). Float32 support
      // triangles can be coplanar within that tolerance while their normals
      // differ slightly. Treating a three-point section as a line then invents
      // endpoints outside both triangles.
      const coplanar =
        tb.every((p) => Math.abs(dot(an, sub(p, ta[0]))) <= tolerance) &&
        ta.every((p) => Math.abs(dot(bn, sub(p, tb[0]))) <= tolerance);
      if (coplanar || length(direction) <= 1e-10) {
        if (coplanar) {
          const axis = unit(sub(ta[1], ta[0])),
            other = cross(an, axis),
            project = (p: number[]) => [dot(sub(p, ta[0]), axis), dot(sub(p, ta[0]), other)],
            overlap = intersect(clean(ta.map(project)), clean(tb.map(project)));
          if (overlap.length && Math.abs(area(overlap)) > tolerance * tolerance)
            unknown.push({ triangle_indices: pair, reason: "coplanar_overlap", overlap_area: Math.abs(area(overlap)) });
        }
        continue;
      }
      direction = unit(direction);
      // Broad contact tolerance is for classification, not for constructing an
      // intersection line: admitting a nearby off-plane vertex shifts that line
      // outside slender triangles. Interpolate the actual plane crossing here.
      const planeEpsilon = Math.min(tolerance, 1e-10),
        sa = section(ta, bn, tb[0], planeEpsilon),
        sb = section(tb, an, ta[0], planeEpsilon);
      if (!sa.length || !sb.length) continue;
      const ia = sa.map((p) => dot(p, direction)),
        ib = sb.map((p) => dot(p, direction)),
        lo = Math.max(Math.min(...ia), Math.min(...ib)),
        hi = Math.min(Math.max(...ia), Math.max(...ib));
      if (hi < lo - tolerance) continue;
      const origin = sa[0],
        at = (t: number) => add(origin, scale(direction, t - dot(origin, direction)));
      if (hi - lo <= tolerance) {
        point_contacts.push({ triangle_indices: pair, world: at((lo + hi) / 2) });
        continue;
      }
      const world = [at(lo), at(hi)],
        { remaining, removed } = outsideHoles(world, [pa, pb], tolerance);
      if (removed.length)
        clipped.push({ triangle_indices: pair, uncut_world: world, removed, retained_intervals: remaining });
      for (const [x, y] of remaining) {
        const line = [x, y].map((t) => add(world[0], scale(sub(world[1], world[0]), t))),
          owners: any[] = [];
        let residual = 0,
          baryError = 0;
        for (const [m, p, n] of [
          [a, pa, an],
          [b, pb, bn]
        ] as [RoofMapping, RoofPatch, number[]][]) {
          const ws = line.map((q) => weights(q, p.native_world_triangle)),
            uv = ws.map((w) => [0, 1].map((k) => w.reduce((s, v, i) => s + v * p.native_mesh_uv[i][k], 0))),
            sc = m.uv_mapping.scale;
          residual = Math.max(residual, ...line.map((q) => Math.abs(dot(n, sub(q, p.native_world_triangle[0])))));
          baryError = Math.max(baryError, ...ws.map((w) => Math.max(0, -Math.min(...w), Math.max(...w) - 1)));
          owners.push({
            wall_id: m.wall_id,
            triangle_index: p.triangle_index,
            support_triangle: p.native_world_triangle,
            native_triangle_uv: p.native_mesh_uv,
            native_uv: uv,
            surface_uv: ws.map((w) =>
              [0, 1].map(
                (k) => w.reduce((s, v, i) => s + v * (p.surface_chart_uv ?? p.native_mesh_uv)[i][k], 0) * sc[k]
              )
            ),
            barycentric: ws
          });
        }
        if (residual > tolerance * 4 || baryError > tolerance * 4)
          throw Error("Roof contact residual exceeds tolerance");
        segments.push({
          world: line,
          length: length(sub(line[1], line[0])),
          participants: owners,
          max_plane_residual: residual,
          max_barycentric_outside: baryError
        });
      }
    }
  }
  return {
    schema: "pitched-roof-support-contact-v1",
    status: segments.length
      ? unknown.length
        ? "partial"
        : "intersecting"
      : unknown.length
        ? "unknown"
        : point_contacts.length
          ? "touching"
          : "disjoint",
    participants: [a, b].map((m) => ({ wall_id: m.wall_id })),
    segments,
    unknown,
    point_contacts,
    hole_clipping: clipped,
    coverage: {
      examined_triangle_pairs: examined,
      aabb_candidate_pairs: candidates,
      tolerance,
      coplanar_overlap: "unknown",
      source_degenerate_triangles_skipped: [a.degenerate_triangles_skipped, b.degenerate_triangles_skipped],
      support_hole_approximation: [a, b].map((m) => ({
        wall_id: m.wall_id,
        holes: m.native_holes.map((h) => ({
          decorator_id: h.decorator_id,
          method: h.support_clip.method,
          side_error_bound_world: h.support_clip.side_error_bound_world
        }))
      }))
    },
    provenance: {
      derivation: "Framework finite original-support intersections; not original extra-piece generation",
      rendered_tile_skin: "Not intersected: support differs from deformed tile mesh",
      placement: "No units emitted"
    }
  };
}
export function pitchedRoofTopology(mappings: RoofMapping[]) {
  const ids = new Set(mappings.map((m) => m.wall_id));
  if (ids.size !== mappings.length) throw Error("Duplicate roof owner");
  const sorted = [...mappings].sort((a, b) =>
      String(a.wall_id).localeCompare(String(b.wall_id), undefined, { numeric: true })
    ),
    pairs: any[] = [];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      pairs.push({
        wall_pair: [sorted[i].wall_id, sorted[j].wall_id],
        geometry: deriveRoofContact(sorted[i], sorted[j]),
        mechanism: { type: "independent_original_roof_owners_depth_composition", extra_joint_units: 0 },
        cell_ids: [],
        candidates: [],
        source_unit_counts: {},
        reservation_holes40: [],
        emission_status: "independent_roof_owners_no_extra_units",
        emitted_unit_count: 0
      });
  return {
    schema: "roof-contact-topology-v1",
    status: "recovered_ts_semantic_generation",
    owners: sorted.map((m) => ({ wall_id: m.wall_id, is_pitched: true, is_flat: false })),
    pairs: [],
    pitched_pairs: pairs,
    unsupported_pitched_owners: [],
    composition: {
      policy: "Original each-owner roof generation, own-plane and dormer GPU clipping, depth selects visible fragments"
    },
    identity: "Persistent semantic owner pair; support fragments are edit locators",
    detector_executed: false,
    provenance: "Recovered producer semantics and framework support intersection; no native detector replay"
  };
}
