/** Geometry-owned metric chart and edit anchors. Runs in browsers or workers.
 * This is the framework's surface mapping, not a claim about Tiny Glade topology.
 * A chart is validated once per instance. Projection preserves finite-patch
 * ranking, unclamped UVs and the established lexicographic seam tie policy.
 */
const EPS = 1e-10;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.sqrt(dot(a, a));
const turn = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const unit = (a) => {
  const n = length(a);
  if (n <= EPS) throw Error("Zero direction");
  return scale(a, 1 / n);
};
const number = (v, positive = false) => {
  if (typeof v !== "number" || !Number.isFinite(v) || (positive && v <= 0))
    throw Error("Finite geometry coordinate required");
  return v;
};
const vec = (v, n) => {
  if (!Array.isArray(v) || v.length !== n) throw Error(`Expected ${n} coordinates`);
  return v.map((x) => number(x));
};
const area = (p) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + (a[0] * b[1] - b[0] * a[1]);
  }, 0) / 2;
function clean(poly) {
  if (!Array.isArray(poly)) throw Error("Polygon must be an array");
  const out = [];
  for (const p of poly) {
    const v = vec(p, 2);
    if (!out.length || length(sub(v, out.at(-1))) > EPS) out.push(v);
  }
  if (out.length > 1 && length(sub(out[0], out.at(-1))) <= EPS) out.pop();
  if (out.length < 3 || Math.abs(area(out)) <= EPS) return [];
  if (area(out) < 0) out.reverse();
  return out;
}
function halfplane(poly, a, b) {
  // Inputs are already clean, CCW polygons. Use exactly the clipping predicate:
  // a separate AABB epsilon would disagree on very thin / oblique charts.
  let inside = 0;
  for (const p of poly) if (turn(a, b, p) >= -EPS) inside++;
  if (!inside) return [];
  // clean() can expose a second near-duplicate at the closing edge, and
  // reversing a near-degenerate polygon can change its rounded signed area.
  // Reuse only its fixed point; otherwise preserve the original cleanup.
  if (inside === poly.length) return length(sub(poly[0], poly.at(-1))) > EPS && area(poly) > EPS ? poly : clean(poly);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dp = turn(a, b, p),
      dq = turn(a, b, q),
      pin = dp >= -EPS,
      qin = dq >= -EPS;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = dp / (dp - dq);
      out.push(p.map((v, k) => v + (q[k] - v) * t));
    }
  }
  return clean(out);
}
function intersection(poly, clip) {
  for (let i = 0; i < clip.length && poly.length; i++) poly = halfplane(poly, clip[i], clip[(i + 1) % clip.length]);
  return poly;
}
function validateHole(value) {
  let p = value;
  if (value && !Array.isArray(value) && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length !== 1 || !["polygon", "aabb"].includes(keys[0])) throw Error("Invalid hole fields");
    p = value[keys[0]];
  }
  if (Array.isArray(p) && p.length === 4 && p.every((v) => typeof v === "number")) {
    p.forEach((v) => number(v));
    if (p[2] <= p[0] || p[3] <= p[1]) throw Error("Empty hole");
    return;
  }
  p = clean(p);
  if (!p.length) throw Error("Empty hole");
  for (let i = 0; i < p.length; i++)
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length];
      const overlap = [0, 1].every(
        (k) =>
          Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) <=
          Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) + EPS
      );
      if (overlap && turn(a, b, c) * turn(a, b, d) <= EPS * EPS && turn(c, d, a) * turn(c, d, b) <= EPS * EPS)
        throw Error("Self-intersecting hole");
    }
}
/** Immutable prepared geometry; caller changes require a new owner. */
export class SurfaceProjector {
  constructor(data) {
    const allowed = [
      "id",
      "type",
      "height",
      "holes",
      "width",
      ...(data.type === "triangulated" ? ["vertices", "uv", "triangles"] : ["origin", "u_axis", "v_axis"])
    ];
    if (!["plane", "triangulated"].includes(data.type) || Object.keys(data).some((k) => !allowed.includes(k)))
      throw Error("Unsupported surface fields");
    if ("id" in data && (typeof data.id !== "string" || !data.id)) throw Error("Invalid surface ID");
    const width = number(data.width, true),
      height = number(data.height, true),
      holes = data.holes ?? [];
    if (!Array.isArray(holes)) throw Error("Holes must be an array");
    holes.forEach(validateHole);
    const pieces = [];
    if (data.type === "plane") {
      const origin = vec(data.origin ?? [0, 0, 0], 3),
        u = unit(vec(data.u_axis ?? [1, 0, 0], 3)),
        v = unit(vec(data.v_axis ?? [0, 1, 0], 3));
      if (Math.abs(dot(u, v)) > 1e-7) throw Error("Plane axes must be orthogonal");
      pieces.push({
        origin,
        u,
        v,
        domain: [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height]
        ]
      });
    } else {
      if (!Array.isArray(data.vertices) || !Array.isArray(data.uv) || !Array.isArray(data.triangles))
        throw Error("Mesh arrays required");
      const vertices = data.vertices.map((p) => vec(p, 3)),
        uv = data.uv.map((p) => vec(p, 2));
      if (vertices.length < 3 || vertices.length !== uv.length || !data.triangles.length)
        throw Error("Mismatched mesh arrays");
      if (uv.some((p) => p[0] < -EPS || p[0] > width + EPS || p[1] < -EPS || p[1] > height + EPS))
        throw Error("UV exceeds domain");
      for (const tri of data.triangles) {
        if (
          !Array.isArray(tri) ||
          tri.length !== 3 ||
          new Set(tri).size !== 3 ||
          tri.some((i) => !Number.isInteger(i) || i < 0 || i >= vertices.length)
        )
          throw Error("Invalid triangle");
        const [a, b, c] = tri.map((i) => vertices[i]),
          [q0, q1, q2] = tri.map((i) => uv[i]),
          qx = sub(q1, q0),
          qy = sub(q2, q0),
          e1 = sub(b, a),
          e2 = sub(c, a);
        const det = qx[0] * qy[1] - qy[0] * qx[1];
        if (Math.abs(det) <= EPS || length(cross(e1, e2)) <= EPS) throw Error("Degenerate triangle or UV");
        const u = scale(sub(scale(e1, qy[1]), scale(e2, qx[1])), 1 / det),
          v = scale(sub(scale(e2, qx[0]), scale(e1, qy[0])), 1 / det);
        pieces.push({ origin: sub(a, add(scale(u, q0[0]), scale(v, q0[1]))), u, v, domain: clean([q0, q1, q2]) });
      }
      // Preserve the existing tolerant polygon predicate, including boundaries.
      for (let i = 0; i < pieces.length; i++)
        for (let j = 0; j < i; j++) {
          const overlap = intersection(pieces[i].domain, pieces[j].domain);
          if (overlap.length && area(overlap) > EPS) throw Error("Triangle UV interiors overlap");
        }
    }
    this.pieces = pieces.map(({ origin, u, v, domain }) => {
      const uv = dot(u, v),
        uu = dot(u, u),
        vv = dot(v, v),
        normal = unit(cross(u, v));
      const edges = domain.map((a, i) => {
        const b = domain[(i + 1) % domain.length],
          wa = add(origin, add(scale(u, a[0]), scale(v, a[1]))),
          wb = add(origin, add(scale(u, b[0]), scale(v, b[1]))),
          edge = sub(wb, wa);
        return { a, delta: sub(b, a), wa, edge, length: dot(edge, edge) };
      });
      return { origin, u, v, uv, uu, vv, det: uu * vv - uv * uv, normal, edges };
    });
  }
  choices(point, pieceIndex) {
    return this._choices(point, pieceIndex, false);
  }
  _choices(point, pieceIndex, nearestOnly) {
    point = vec(point, 3);
    if (
      pieceIndex !== undefined &&
      (!Number.isInteger(pieceIndex) || pieceIndex < 0 || pieceIndex >= this.pieces.length)
    )
      throw Error("Invalid piece index");
    let choices = [],
      bestScore = Infinity;
    for (
      let index = pieceIndex ?? 0;
      index < (pieceIndex === undefined ? this.pieces.length : pieceIndex + 1);
      index++
    ) {
      const { origin, u, v, uv, uu, vv, det, normal, edges } = this.pieces[index];
      // Preserve the vector operations' evaluation order, including the initial
      // +0 in dot(), without allocating vectors for every candidate patch.
      const dx = point[0] - origin[0],
        dy = point[1] - origin[1],
        dz = point[2] - origin[2];
      const a = 0 + dx * u[0] + dy * u[1] + dz * u[2];
      const b = 0 + dx * v[0] + dy * v[1] + dz * v[2];
      const coordinate = [(a * vv - uv * b) / det, (b * uu - uv * a) / det];
      const distance = 0 + dx * normal[0] + dy * normal[1] + dz * normal[2];
      let score = distance * distance,
        closest = coordinate,
        inside = true;
      for (const e of edges) {
        if (!(e.delta[0] * (coordinate[1] - e.a[1]) - e.delta[1] * (coordinate[0] - e.a[0]) >= -1e-9)) {
          inside = false;
          break;
        }
      }
      if (!inside) {
        score = Infinity;
        for (const e of edges) {
          const px = point[0] - e.wa[0],
            py = point[1] - e.wa[1],
            pz = point[2] - e.wa[2];
          const t = Math.max(0, Math.min(1, (0 + px * e.edge[0] + py * e.edge[1] + pz * e.edge[2]) / e.length));
          const ex = point[0] - (e.wa[0] + e.edge[0] * t);
          const ey = point[1] - (e.wa[1] + e.edge[1] * t);
          const ez = point[2] - (e.wa[2] + e.edge[2] * t);
          const candidate = 0 + ex * ex + ey * ey + ez * ez;
          if (candidate < score) {
            score = candidate;
            closest = [e.a[0] + e.delta[0] * t, e.a[1] + e.delta[1] * t];
          }
        }
      }
      // Anchors consume only nearest/equal-distance candidates. Avoid sorting
      // every rejected face, retaining the original strict tie threshold and
      // input order for equal scores. Rare overflow preserves exhaustive behavior.
      if (nearestOnly) {
        if (!Number.isFinite(score)) return this._choices(point, pieceIndex, false);
        if (score < bestScore) {
          bestScore = score;
          choices = choices.filter((candidate) => Math.abs(candidate._score - bestScore) < 1e-12);
        } else if (!(Math.abs(score - bestScore) < 1e-12)) continue;
      }
      choices.push({
        u: coordinate[0],
        v: coordinate[1],
        closest_uv: closest,
        normal_distance: distance,
        piece_index: index,
        _score: score
      });
    }
    choices.sort((a, b) => a._score - b._score);
    return choices;
  }
  project(point, pieceIndex) {
    const choices = this.choices(point, pieceIndex),
      { _score, ...result } = choices[0],
      ties = choices.filter((r) => Math.abs(r._score - _score) < 1e-12).map((r) => r.piece_index);
    return { ...result, ambiguous_piece_indices: ties.length > 1 ? ties : [] };
  }
  anchor(point) {
    const choices = this._choices(point, undefined, true),
      chosen = choices[0];
    let candidates = choices.filter((r) => Math.abs(r._score - chosen._score) < 1e-12);
    const ties = candidates.length > 1 ? candidates.map((r) => r.piece_index) : [];
    if (!ties.length) candidates = [chosen];
    const selected = candidates.reduce((a, b) =>
      b.u < a.u || (b.u === a.u && (b.v < a.v || (b.v === a.v && b.piece_index < a.piece_index))) ? b : a
    );
    return [
      [selected.u, selected.v],
      {
        method: "geometry.Surface.project",
        triangle: selected.piece_index,
        normal_distance: selected.normal_distance,
        ambiguous_piece_indices: ties,
        tie_policy: "lexicographic (u,v,piece_index) among owner-reported equal-distance patches",
        candidate_uvs: candidates.map((q) => [q.u, q.v, q.piece_index]),
        uv_policy:
          "Owner returns plane-projected UV of nearest finite patch; boundary overshoot is preserved for editor anchors, not clamped or used to generate placement."
      }
    ];
  }
  anchors(points) {
    return points.map((p) => this.anchor(p));
  }
}
