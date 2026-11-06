/** Semantic roof owner -> shared original support + framework metric chart.
 * No bundle, binary, Python, captured instance fitting or filesystem dependency.
 */
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import { gothicHostSurface, roofMaterialSurface, type GothicSupportMesh } from "./GothicHostSurface";
import { dormerSupportClip } from "./GothicClip";
import {
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  unit,
  area,
  clean,
  subtractConvex,
  planeClip
} from "./RecoveredRoofGeometry";
export interface RoofHostInput {
  id: string | number;
  surface: RoofSurface;
  footprint: RoofFootprint;
  renderSlot: number;
  holes?: Array<{ id: string | number; raw48: Uint8Array }>;
}
export interface RoofPatch {
  triangle_index: number;
  geometry: {
    type: "plane";
    id: string;
    origin: number[];
    u_axis: number[];
    v_axis: number[];
    width: number;
    height: number;
    holes: Array<{ polygon: number[][] }>;
  };
  native_world_triangle: number[][];
  native_mesh_uv: number[][];
  source_unoriented_uv: number[];
  surface_chart_uv?: number[][];
  surface_triangle_uv: number[][];
  cutters: Array<{ polygon: number[][]; source_decorator_id: string | number }>;
  uncut_area: number;
  retained_area: number;
}
export interface RoofMapping {
  status: string;
  wall_id: string | number;
  slot: number;
  shape_tag: 0 | 1;
  patches: RoofPatch[];
  native_holes: Array<{
    decorator_id: string | number;
    raw48: Uint8Array;
    planes: ReturnType<typeof dormerSupportClip>["planes"];
    support_clip: ReturnType<typeof dormerSupportClip>;
  }>;
  duplicates_removed: Array<{ triangle: number; same_geometry_as: number }>;
  degenerate_triangles_skipped: number[];
  area: number;
  hole_area: number;
  geometry: any;
  uv_mapping: any;
}
function sharedGeometry(m: RoofMapping, canonicalCircularSeam: boolean, chartScale?: readonly [number, number]) {
  const cap = m.shape_tag === 0 ? m.patches.filter((p) => p.native_mesh_uv.every((q) => q[1] > 1)) : [],
    first = cap[0],
    last = cap.at(-1);
  const seamFrom = last?.source_unoriented_uv.slice(2, 4),
    seamTo = first?.source_unoriented_uv.slice(0, 2);
  const chartUV = (p: RoofPatch) =>
    p.native_mesh_uv.map((q) =>
      canonicalCircularSeam && p === last && seamFrom && seamTo && q[0] === seamFrom[0] && q[1] === seamFrom[1]
        ? [...seamTo]
        : q
    );
  const edges = new Map<string, { uv: number[][]; world: number[][]; length: number; triangle_index: number }>();
  for (const p of m.patches)
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3,
        a = p.native_mesh_uv[i],
        b = p.native_mesh_uv[j],
        x = p.native_world_triangle[i],
        y = p.native_world_triangle[j],
        key = JSON.stringify([a, b].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
      if (!edges.has(key))
        edges.set(key, { uv: [a, b], world: [x, y], length: length(sub(x, y)), triangle_index: p.triangle_index });
    }
  const profileU = m.shape_tag === 0 ? 0 : 0.25,
    ue = [...edges.values()].filter(
      (e) => e.uv.every((p) => Math.abs(p[1]) < 1e-7) && Math.abs(e.uv[1][0] - e.uv[0][0]) > 1e-7
    ),
    ve = [...edges.values()].filter(
      (e) =>
        e.uv.every((p) => Math.abs(p[0] - profileU) < 1e-7 && p[1] >= -1e-7 && p[1] <= 1 + 1e-7) &&
        Math.abs(e.uv[1][1] - e.uv[0][1]) > 1e-7
    );
  if (!ue.length || !ve.length) throw Error("Original roof UV metric boundary absent");
  const ratio = (e: typeof ue, i: number) =>
      e.reduce((s, v) => s + v.length, 0) / e.reduce((s, v) => s + Math.abs(v.uv[1][i] - v.uv[0][i]), 0),
    us = chartScale?.[0] ?? ratio(ue, 0),
    vs = chartScale?.[1] ?? ratio(ve, 1),
    vertices: number[][] = [],
    uvs: number[][] = [],
    nativeuv: number[][] = [],
    indices: number[][] = [],
    holes: Array<{ polygon: number[][] }> = [],
    vertexMap = new Map<string, number>();
  for (const p of m.patches) {
    p.surface_chart_uv = chartUV(p);
    const keys = p.native_world_triangle.map((world, i) => {
      const uv = chartUV(p)[i],
        k = JSON.stringify([...world, ...uv]);
      if (!vertexMap.has(k)) {
        vertexMap.set(k, vertices.length);
        vertices.push(world);
        nativeuv.push(p.native_mesh_uv[i]);
        uvs.push([uv[0] * us, uv[1] * vs]);
      }
      return vertexMap.get(k)!;
    });
    if (area(keys.map((i) => uvs[i])) < 0) [keys[1], keys[2]] = [keys[2], keys[1]];
    indices.push(keys);
    const g = p.geometry,
      loc = p.native_world_triangle.map((w) => [dot(sub(w, g.origin), g.u_axis), dot(sub(w, g.origin), g.v_axis)]),
      [a, b, c] = loc,
      d1 = sub(b, a),
      d2 = sub(c, a),
      det = d1[0] * d2[1] - d1[1] * d2[0];
    for (const cutter of p.cutters) {
      const polygon = clean(
        cutter.polygon.map((q) => {
          const d = sub(q, a),
            beta = (d[0] * d2[1] - d[1] * d2[0]) / det,
            gamma = (d1[0] * d[1] - d1[1] * d[0]) / det;
          return [0, 1].map(
            (k) =>
              [1 - beta - gamma, beta, gamma].reduce((s, w, i) => s + w * chartUV(p)[i][k], 0) * (k === 0 ? us : vs)
          );
        })
      );
      if (polygon.length) holes.push({ polygon });
    }
  }
  return {
    geometry: {
      type: "triangulated",
      id: `native-roof-${m.wall_id}`,
      width: Math.max(...uvs.map((q) => q[0])),
      height: Math.max(...uvs.map((q) => q[1])),
      vertices,
      uv: uvs,
      triangles: indices,
      holes
    },
    uv_mapping: {
      original_uv: nativeuv,
      scale: [us, vs],
      chart_normalization:
        canonicalCircularSeam && cap.length
          ? {
              kind: "periodic-cap-seam",
              from: seamFrom,
              to: seamTo,
              max_native_uv_delta: Math.max(...seamFrom!.map((v, i) => Math.abs(v - seamTo![i])))
            }
          : null,
      scale_u_edges: ue,
      scale_v_edges: ve,
      metric_convention: {
        shape_tag: m.shape_tag,
        u: "original lower-rim length / U span",
        v_profile_u: profileU,
        v: "original profile-edge length / V span",
        is_isometric: false
      }
    }
  };
}
export function buildRoofContext(
  host: RoofHostInput,
  {
    slopesOnly = true,
    worldTolerance = 0.0001,
    canonicalCircularSeam = true,
    preparedSupport,
    chartScale
  }: {
    slopesOnly?: boolean;
    worldTolerance?: number;
    canonicalCircularSeam?: boolean;
    /** Borrow only from this exact immutable surface/footprint generation. */
    preparedSupport?: GothicSupportMesh;
    /** Reuse the author chart's metric when sampling a separate render skin. */
    chartScale?: readonly [number, number];
  } = {}
) {
  const capture = preparedSupport ?? gothicHostSurface(host.surface, host.footprint),
    holes = (host.holes ?? []).map((h) => {
      const support_clip = dormerSupportClip(h.raw48, worldTolerance);
      if (support_clip.domain.wall_slot_id !== host.renderSlot) throw Error("Dormer source owner slot mismatch");
      return { decorator_id: h.id, raw48: h.raw48.slice(), planes: support_clip.planes, support_clip };
    });
  const m: RoofMapping = {
    status: "mapped-native-roof-support-patches",
    wall_id: host.id,
    slot: host.renderSlot,
    shape_tag: "radius" in host.footprint ? 0 : 1,
    patches: [],
    native_holes: holes,
    duplicates_removed: [],
    degenerate_triangles_skipped: [],
    area: 0,
    hole_area: 0,
    geometry: null,
    uv_mapping: null
  };
  const seen = new Map<string, number>(),
    excluded: number[] = [];
  for (let i = 0; i < capture.triangles.length; i++) {
    const uv = capture.uvs[i].map((v) => [...v]),
      sourceUV = uv.flat(),
      tri = capture.triangles[i].map((p) => add(p, [0, host.surface.base_height, 0])),
      key = JSON.stringify([...tri].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
    if (seen.has(key)) {
      m.duplicates_removed.push({ triangle: i, same_geometry_as: seen.get(key)! });
      continue;
    }
    seen.set(key, i);
    let normal = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    if (length(normal) < 1e-10) {
      m.degenerate_triangles_skipped.push(i);
      continue;
    }
    if (dot(normal, capture.normals[i][0]) < 0) {
      [tri[1], tri[2]] = [tri[2], tri[1]];
      [uv[1], uv[2]] = [uv[2], uv[1]];
      normal = scale(normal, -1);
    }
    if (slopesOnly && m.shape_tag === 1 && !uv.every((q) => q[1] >= -1e-7 && q[1] <= 1 + 1e-7)) {
      if (!uv.every((q) => Math.abs(q[1] - 2) < 1e-6 || Math.abs(q[1] - Math.fround(2.1)) < 1e-6))
        throw Error("Unknown roof UV chart");
      excluded.push(i);
      continue;
    }
    const n = unit(normal),
      u = unit(sub(tri[1], tri[0])),
      v = cross(n, u);
    let origin = tri[0],
      local = tri.map((p) => [dot(sub(p, origin), u), dot(sub(p, origin), v)]);
    const xmin = Math.min(...local.map((p) => p[0])),
      ymin = Math.min(...local.map((p) => p[1]));
    origin = add(origin, add(scale(u, xmin), scale(v, ymin)));
    local = clean(local.map((p) => [p[0] - xmin, p[1] - ymin]));
    const width = Math.max(...local.map((p) => p[0])),
      height = Math.max(...local.map((p) => p[1])),
      outside = subtractConvex(
        [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height]
        ],
        local
      ),
      cutters: RoofPatch["cutters"] = [];
    for (const h of holes) {
      let polygon = tri;
      for (const [axis, d] of h.planes) polygon = planeClip(polygon, axis, d);
      const q = clean(polygon.map((p) => [dot(sub(p, origin), u), dot(sub(p, origin), v)]));
      if (q.length) cutters.push({ polygon: q, source_decorator_id: h.decorator_id });
    }
    let remaining = [local];
    for (const c of cutters) remaining = remaining.flatMap((p) => subtractConvex(p, c.polygon));
    const uncut = area(local),
      retained = remaining.reduce((s, p) => s + area(p), 0);
    m.area += uncut;
    m.hole_area += uncut - retained;
    m.patches.push({
      triangle_index: i,
      geometry: {
        type: "plane",
        id: `native-roof-${host.id}-triangle-${i}`,
        origin,
        u_axis: u,
        v_axis: v,
        width,
        height,
        holes: [...outside.map((p) => ({ polygon: p })), ...cutters.map((c) => ({ polygon: c.polygon }))]
      },
      native_world_triangle: tri,
      native_mesh_uv: uv,
      source_unoriented_uv: sourceUV,
      surface_triangle_uv: local,
      cutters,
      uncut_area: uncut,
      retained_area: retained
    });
  }
  Object.assign(m, sharedGeometry(m, canonicalCircularSeam, chartScale));
  return {
    schema: "native-shingle-context-v2",
    wall_id: host.id,
    slot: host.renderSlot,
    geometry: m.geometry,
    mapping: m,
    roof_descriptor: host.surface,
    building_footprint: host.footprint,
    native_ridge_patches_excluded: excluded,
    shader_clip: {
      raw48: holes.map((h) => h.raw48),
      require_original_cubic_predicate: true,
      editor_side_error_bound_world: Math.max(0, ...holes.map((h) => h.support_clip.side_error_bound_world))
    },
    provenance: {
      execution: "Recovered TS support generator; framework projection and inward editor chords",
      rendering: "Raw48 must bind original GPU cubic predicate; editor hole polygons are not a rendering substitute"
    }
  };
}

/** Visible material support shares the author's metric chart without inheriting
 * the native interaction envelope. Hole48 remains the same finite GPU domain. */
export function buildRoofMaterialContext(host: RoofHostInput, authorChart: ReturnType<typeof buildRoofContext>) {
  const context = buildRoofContext(host, {
    preparedSupport: roofMaterialSurface(host.surface, host.footprint),
    chartScale: authorChart.mapping.uv_mapping.scale
  });
  context.geometry.id = authorChart.geometry.id;
  return context;
}
