/** Authoring truth = geometry + arrangement rule + material unit.
 * The GPU cache is derived. Local edits address stable owners and metric domains,
 * never transient triangle or instance indices.
 */
export const units = new Set(["brick", "roof_tile", "wooden_plank"]);
const canonical = (value) =>
  Array.isArray(value)
    ? "[" + value.map(canonical).join(",") + "]"
    : value && typeof value === "object"
      ? "{" +
        Object.keys(value)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
          .join(",") +
        "}"
      : JSON.stringify(value);
export function placementKey(document) {
  const derived = new Set(document.geometries.filter((g) => g.source?.type === "connection").map((g) => g.id));
  return canonical({
    ...document,
    geometries: document.geometries.filter((g) => !derived.has(g.id)),
    overrides: [],
    bindings: document.bindings
      .filter((b) => !derived.has(b.geometry_id))
      .map((b) => ({ ...b, unit_id: b.rule.type === "auto" ? b.unit_id : null }))
  });
}
const EPS = 1e-8;
export function contains(polygon, point) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i],
      cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (
      Math.abs(cross) <= EPS &&
      x >= Math.min(a[0], b[0]) - EPS &&
      x <= Math.max(a[0], b[0]) + EPS &&
      y >= Math.min(a[1], b[1]) - EPS &&
      y <= Math.max(a[1], b[1]) + EPS
    )
      return true;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function resolveDocument(cache, document) {
  if (placementKey(cache.document) !== placementKey(document))
    throw Error("几何、排列规则或占位尺寸已变化，需要重新编译铺设缓存；当前画面与草稿保留。");
  const assignments = new Map(),
    bindings = new Map(document.bindings.map((b) => [b.id, b]));
  const cells = [],
    seams = new Map(),
    geometries = new Map(document.geometries.map((g) => [g.id, g]));
  for (const b of document.bindings) {
    const g = geometries.get(b.geometry_id);
    if (g?.source?.type !== "connection") continue;
    const source = g.source;
    if (b.footprint !== "source" || b.seed !== "source")
      throw Error("Connection placement must inherit source dimensions");
    if (
      source.kind === "roof_boundaries" &&
      b.rule.type === "roof_boundary_assembly" &&
      source.bindings?.length === 1
    ) {
      const parent = source.bindings[0];
      if (seams.has(parent) || !cache.plans.some((p) => p.binding_id === parent))
        throw Error("Unknown or duplicate connection owner");
      if (b.unit_id !== "source" && !units.has(b.unit_id)) throw Error("Unsupported connection material");
      seams.set(parent, b);
    } else if (source.kind === "roof_contacts" && b.rule.type === "roof_roof_intersection" && b.unit_id === "source") {
      const refs = source.geometries || source.bindings.map((id) => bindings.get(id)?.geometry_id);
      if (
        refs.length !== 2 ||
        new Set(refs).size !== 2 ||
        refs.some((id) => !cache.document.bindings.some((b) => b.geometry_id === id))
      )
        throw Error("Unknown roof contact participants");
      if (document.overrides.some((o) => o.binding_id === b.id))
        throw Error("Roof intersection edits belong to the participating roof");
    } else throw Error("Connection requires recompilation with a supported placement producer");
  }
  // A material may retain a whole unit for GPU clipping while another uses
  // CPU fragments. Availability belongs to the group, not authored overrides.
  const availability = new Map();
  for (const group of cache.groups) {
    if (!group.materialUnits) continue;
    if (!group.materialUnits.length || group.materialUnits.some((u) => !units.has(u)))
      throw Error("Invalid material placement availability");
    let byCell = availability.get(group.binding_id);
    if (!byCell) availability.set(group.binding_id, (byCell = new Map()));
    const allowed = new Set(group.materialUnits);
    for (const cell of group.cells) {
      const previous = byCell.get(cell.id);
      // Share the immutable group set; only overlapping representations need a union.
      byCell.set(cell.id, previous ? new Set([...previous, ...allowed]) : allowed);
    }
  }
  for (const plan of cache.plans) {
    const b = bindings.get(plan.binding_id);
    if (!b || !units.has(b.unit_id)) throw Error("Unsupported material binding");
    const byId = new Map(),
      logical = new Map();
    for (const c of plan.cells) {
      if (byId.has(c.id)) throw Error("Duplicate placement identity");
      byId.set(c.id, c);
      const id = c.logical_id || c.id;
      if (!logical.has(id)) logical.set(id, { fragments: [], matches: new Set(), parents: new Set(), children: [] });
      logical.get(id).fragments.push(c);
    }
    const records = (document.overrides || []).filter((o) => o.binding_id === b.id);
    for (const row of logical.values()) {
      const anchors = row.fragments.filter((c) => c.anchor_uv).map((c) => c.anchor_uv),
        anchor = anchors[0];
      if (
        records.length &&
        (!anchor ||
          anchors.some((a) => a.some((v, i) => Math.abs(v - anchor[i]) > Math.max(EPS, Math.abs(anchor[i]) * 1e-10))))
      )
        throw Error("Missing or inconsistent logical UV anchor");
      for (const o of records) {
        if (o.region.space !== "surface_uv" || o.region.on_geometry_id || o.region.on_binding_id)
          throw Error("This compiled cache requires a surface UV selector");
        if (o.effect.unit_id && !units.has(o.effect.unit_id)) throw Error("Unsupported override unit");
        if (contains(o.region.polygon, anchor)) row.matches.add(o.id);
      }
    }
    for (const edge of plan.dependencies || []) {
      const p = byId.get(edge.parent_cell_id),
        c = byId.get(edge.child_cell_id);
      if (!p || !c) throw Error("Missing placement dependency");
      const parent = p.logical_id || p.id,
        child = c.logical_id || c.id;
      if (parent === child) throw Error("Self placement dependency");
      logical.get(child).parents.add(parent);
    }
    for (const [id, row] of logical) {
      row.remaining = row.parents.size;
      for (const p of row.parents) logical.get(p).children.push(id);
    }
    const queue = [...logical.keys()].filter((id) => logical.get(id).remaining === 0);
    for (let i = 0; i < queue.length; i++) {
      const row = logical.get(queue[i]);
      for (const child of row.children) {
        const next = logical.get(child);
        for (const id of row.matches) next.matches.add(id);
        if (--next.remaining === 0) queue.push(child);
      }
    }
    if (queue.length !== logical.size) throw Error("Cyclic placement dependencies");
    const owned = new Map();
    assignments.set(b.id, owned);
    for (const c of plan.cells) {
      const matched = logical.get(c.logical_id || c.id).matches;
      let unit = b.unit_id,
        hidden = false;
      const applied = [];
      for (const o of records)
        if (matched.has(o.id)) {
          unit = o.effect.unit_id || unit;
          hidden ||= o.effect.hidden === true;
          applied.push(o.id);
        }
      const seam = seams.get(b.id),
        isEdge =
          seam &&
          cache.groups.some(
            (g) => g.binding_id === b.id && g.role === "connections" && g.cells.some((x) => x.id === c.id)
          );
      let owner = b;
      if (isEdge) {
        owner = seam;
        if (seam.unit_id !== "source") {
          unit = seam.unit_id;
          for (let i = applied.length - 1; i >= 0; i--)
            if (!records.find((o) => o.id === applied[i])?.effect.hidden) applied.splice(i, 1);
        }
        for (const o of document.overrides.filter((o) => o.binding_id === seam.id)) {
          if (
            o.region.space !== "surface_uv" ||
            (o.region.on_geometry_id && o.region.on_geometry_id !== b.geometry_id) ||
            (o.region.on_binding_id && o.region.on_binding_id !== b.id)
          )
            throw Error("Unknown connection UV participant");
          if (contains(o.region.polygon, c.anchor_uv)) {
            unit = o.effect.unit_id || unit;
            hidden ||= o.effect.hidden === true;
            applied.push(o.id);
          }
        }
      }
      owned.set(c.id, { unit, hidden });
      const allowed = availability.get(b.id)?.get(c.id);
      if (allowed && !allowed.has(unit)) continue;
      cells.push({
        ...c,
        placement_binding_id: b.id,
        binding_id: owner.id,
        geometry_id: owner.geometry_id,
        unit_id: unit,
        hidden,
        applied_override_ids: applied
      });
    }
  }
  const selections = cache.groups.map((group) => {
    const selected = { brick: [], roof_tile: [], wooden_plank: [] };
    group.cells.forEach((cell, index) => {
      const a = assignments.get(group.binding_id)?.get(cell.id);
      if (!a) throw Error("Unresolved cell");
      if (!a.hidden && (!group.materialUnits || group.materialUnits.includes(a.unit))) selected[a.unit].push(index);
    });
    return {
      group: group.id,
      binding_id:
        group.role === "connections" && seams.has(group.binding_id) ? seams.get(group.binding_id).id : group.binding_id,
      selections: selected
    };
  });
  return { selections, cells };
}
export function resolvePlacements(cache, document) {
  return resolveDocument(cache, document).selections;
}
