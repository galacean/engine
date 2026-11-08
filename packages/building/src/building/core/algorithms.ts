import { positive, type Vec3 } from "./math";
import type { EffectiveGeometry, Frame, GeometryElement, Rect } from "./geometry";
import type { Random } from "./random";
import { unitAxisAlong, unitExtent, unitFits, unitNominal, type BuildingUnit } from "./unit";

/** One laid copy of the part's unit prototype, as a laying algorithm outputs it.
 * The key is local and stable: it must come from the unit's own coordinates, never
 * from a running counter, so unrelated edits keep it unchanged. */
export interface LaidUnitSpec {
  readonly key: string;
  /** Where the unit's pivot lands, and how the unit is oriented there. */
  readonly frame: Frame;
  /** Laid size per unit-local axis, in metres. Default: the nominal size. The core
   * checks it against the prototype's range. */
  readonly size?: Vec3;
  /** Opaque values for the unit's renderer. The core passes them through. */
  readonly params?: Readonly<Record<string, unknown>>;
}
export interface LayingContext<P = Record<string, unknown>> {
  readonly geometry: EffectiveGeometry;
  readonly unit: BuildingUnit;
  readonly params: P;
  /** Seed of one laid unit, derived from the part identity, the unit seed and the key.
   * A channel names one random attribute, such as "size" or "tint". Each channel is an
   * independent stream, so adding or changing one attribute never shifts the others. */
  seed(key: string, channel?: string): number;
  random(key: string, channel?: string): Random;
}
/** What a part keeps after design: the number of unit slots and the small data that
 * `unitAt` needs. Laid units are never stored; any consumer expands them on demand,
 * on the CPU for checks and queries, or on the GPU for rendering. */
export interface UnitLayout<D = unknown> {
  readonly count: number;
  /** Plain JSON. Its size must not grow with the number of units. */
  readonly data: D;
}
export type GeometryKind = GeometryElement["kind"];
/** What a laying algorithm tells people and tools about itself, like an entry in a list of
 * easing functions: the geometry it lays, one line of description and its parameters. */
export interface LayingInfo {
  readonly accepts: readonly GeometryKind[];
  readonly summary: string;
  /** Parameter name → one line of description, including its default. */
  readonly params?: Readonly<Record<string, string>>;
  /** True when the units are computed together on the CPU, so the GPU cannot lay them. */
  readonly cpuOnly?: boolean;
}
/** Laying algorithm, in two steps:
 * - `plan` runs once per part and returns the layout.
 * - `unitAt` is pure: one slot index gives one laid unit, or undefined for an empty slot.
 *   Slots are independent of each other, so they can be computed in parallel. */
export interface LayingAlgorithm<P = any, D = any> {
  readonly info?: LayingInfo;
  plan(context: LayingContext<P>): UnitLayout<D>;
  unitAt(context: LayingContext<P>, data: D, index: number): LaidUnitSpec | undefined;
}

function select(context: LayingContext<{ elements?: string[] }>, kind: GeometryElement["kind"]): string[] {
  const available = context.geometry.ids(kind);
  const requested = context.params.elements;
  if (requested === undefined) return available;
  if (!Array.isArray(requested)) throw Error("elements must be a list of element ids");
  // An element a rule removed lays nothing; an element the geometry never had is an error.
  const original = context.geometry.original.elements;
  for (const id of requested)
    if (!available.includes(id) && original[id]?.kind !== kind) throw Error(`No ${kind} element "${id}"`);
  return requested.filter((id) => available.includes(id));
}
function extent(context: LayingContext<unknown>, label: string): Vec3 {
  const size = unitExtent(context.unit);
  if (!size) throw Error(`${label} needs explicit spacing or a unit with bounds`);
  return size;
}
function budget(count: number, limit: unknown) {
  const max = limit === undefined ? 100000 : positive(limit, "limit");
  if (count > max) throw Error(`Unit budget exceeded: ${count} > ${max}`);
}
/** Span left for a unit after the joint. `limit` caps the joint as a fraction of the span. */
function joint(span: number, gap: number, limit?: number): number {
  return span - (limit === undefined ? gap : Math.min(gap, span * limit));
}
/** Laid size with the spans measured along the laying frame's x and y axes. */
function sized(unit: BuildingUnit, spanX?: number, spanY?: number): Vec3 {
  const size = [...unitNominal(unit)] as [number, number, number];
  if (spanX !== undefined) size[unitAxisAlong(unit, 0)] = spanX;
  if (spanY !== undefined) size[unitAxisAlong(unit, 1)] = spanY;
  return size;
}
/** Abutting units over a length: stretch along the laying axis to fill it exactly when
 * the prototype's range allows, otherwise keep the nominal size and leave the rest free. */
function abut(unit: BuildingUnit, length: number, nominal: number, closed: boolean) {
  const axis = unitAxisAlong(unit, 0);
  const lo = unit.range ? unit.range.min[axis] : 1,
    hi = unit.range ? unit.range.max[axis] : 1;
  const ideal = length / nominal;
  for (const count of [...new Set([Math.round(ideal), Math.floor(ideal), Math.ceil(ideal)])]) {
    if (count < 1) continue;
    const k = ideal / count;
    if (k >= lo - 1e-9 && k <= hi + 1e-9) return { count, pitch: length / count, fill: k !== 1 };
  }
  const count = Math.floor(ideal + 1e-9);
  return {
    count: closed ? Math.max(1, count) : count,
    pitch: closed ? length / Math.max(1, count) : nominal,
    fill: false
  };
}
/** Units spaced by a fixed pitch. Closed lengths adjust the gaps, never the units. */
function spaced(length: number, spacing: number, closed: boolean) {
  if (closed) {
    const count = Math.max(1, Math.round(length / spacing));
    return { count, pitch: length / count, fill: false };
  }
  return { count: Math.floor(length / spacing + 1e-9), pitch: spacing, fill: false };
}

/** Finds the entry that owns a slot in a list of entries with consecutive slot ranges. */
function owner<T extends { offset: number; count: number }>(entries: readonly T[], index: number) {
  for (const entry of entries) if (index >= entry.offset && index < entry.offset + entry.count) return entry;
  throw Error(`Unit slot ${index} is out of range`);
}

/** The simple form of a custom algorithm: one function that returns every unit, like an
 * easing function f(t). The core runs it whole on the CPU and keeps its output as the
 * layout, so it cannot be laid on the GPU. Use the two-step form when that matters. */
export function simpleLaying<P = Record<string, unknown>>(
  info: Omit<LayingInfo, "cpuOnly">,
  lay: (context: LayingContext<P>) => readonly LaidUnitSpec[]
): LayingAlgorithm<P, LaidUnitSpec[]> {
  return {
    info: { ...info, cpuOnly: true },
    plan(context) {
      const units = [...lay(context)];
      return { count: units.length, data: units };
    },
    unitAt: (_context, data, index) => data[index]
  };
}
/** The algorithm a part gets when it names none: one unit per point, or one unit per
 * straight segment of a line, stretched to the segment. A surface must name one. */
export function defaultLaying(kinds: ReadonlySet<GeometryKind>): { type: string; params?: Record<string, unknown> } {
  if (kinds.has("surface")) throw Error("A surface part must name a laying algorithm");
  if (kinds.has("curve") && kinds.has("point"))
    throw Error("Name a laying algorithm: the geometry has both points and lines");
  if (kinds.has("curve")) return { type: "alongCurves", params: { perSegment: true, stretch: true } };
  if (kinds.has("point")) return { type: "placeAtPoints" };
  return { type: "none" };
}

export const noLaying: LayingAlgorithm = {
  info: { accepts: ["point", "curve", "surface"], summary: "Lays nothing." },
  plan: () => ({ count: 0, data: null }),
  unitAt: () => undefined
};

/** One unit at every point element. */
export const placeAtPoints: LayingAlgorithm<
  { elements?: string[]; unitParams?: Readonly<Record<string, unknown>> },
  { ids: string[] }
> = {
  info: {
    accepts: ["point"],
    summary: "One unit at every point.",
    params: {
      elements: "Point ids to use. Default: all points.",
      unitParams: "Renderer values given to every unit, such as a prefab's shape parameters. Default: none."
    }
  },
  plan(context) {
    const ids = select(context, "point");
    return { count: ids.length, data: { ids } };
  },
  unitAt: (context, data, index) => ({
    key: data.ids[index],
    frame: context.geometry.point(data.ids[index]),
    ...(context.params.unitParams && { params: context.params.unitParams })
  })
};

/** One continuous unit per surface element, such as a surface finish: the unit covers
 * the element's effective surface, and the renderer draws it from that surface. */
export const coverSurfaces: LayingAlgorithm<
  { elements?: string[]; unitParams?: Readonly<Record<string, unknown>> },
  { ids: string[] }
> = {
  info: {
    accepts: ["surface"],
    summary: "One continuous unit covering each surface, drawn from the effective surface.",
    params: {
      elements: "Surface ids to cover. Default: all surfaces.",
      unitParams: "Renderer values given to every unit, such as a finish colour. Default: none."
    }
  },
  plan(context) {
    const ids = select(context, "surface");
    return { count: ids.length, data: { ids } };
  },
  unitAt(context, data, index) {
    const id = data.ids[index];
    const { u, v } = context.geometry.surface(id).domain;
    return {
      key: id,
      frame: context.geometry.surface(id).frame((u[0] + u[1]) / 2, (v[0] + v[1]) / 2),
      params: { ...context.params.unitParams, element: id }
    };
  }
};

interface CurveEntry {
  id: string;
  offset: number;
  count: number;
  start: number;
  pitch: number;
  perSegment: boolean;
  fill: boolean;
}
/** Units along curves. Each unit reports its arc-length parameter as `params.s`.
 * - Default: abutting units, stretched to fill when the range allows.
 * - `spacing`: a fixed pitch; units keep their size.
 * - `perSegment`: one unit on each straight segment of the curve, such as a member
 *   between two posts.
 * `stretch` sizes each unit to its span, less `gap` (at most `gapLimit` of the span). */
export const alongCurves: LayingAlgorithm<
  {
    spacing?: number;
    perSegment?: boolean;
    stretch?: boolean;
    gap?: number;
    gapLimit?: number;
    start?: number;
    elements?: string[];
    limit?: number;
  },
  CurveEntry[]
> = {
  info: {
    accepts: ["curve"],
    summary: "Units along lines: abutting, at a fixed spacing, or one per straight segment.",
    params: {
      spacing: "Fixed pitch in metres; units keep their size. Default: abut.",
      perSegment: "One unit per straight segment. Default: false.",
      stretch: "Size each unit to its span, within the unit's range. Default: false.",
      gap: "Joint between neighbours in metres. Default: 0.",
      gapLimit: "Largest joint as a fraction of the span. Default: no limit.",
      start: "Offset of the first unit on open lines, in metres. Default: 0.",
      elements: "Line ids to use. Default: all lines.",
      limit: "Largest number of units. Default: 100000."
    }
  },
  plan(context) {
    const p = context.params;
    if (p.spacing !== undefined) positive(p.spacing, "spacing");
    const nominal =
      p.spacing === undefined && !p.perSegment ? positive(extent(context, "alongCurves")[0], "Unit length") : undefined;
    const entries: CurveEntry[] = [];
    let offset = 0;
    for (const id of select(context, "curve")) {
      const curve = context.geometry.curve(id);
      const start = curve.closed ? 0 : (p.start ?? 0);
      const lay = p.perSegment
        ? { count: curve.segmentCount, pitch: 0, fill: false }
        : nominal === undefined
          ? spaced(curve.length - start, p.spacing!, curve.closed)
          : abut(context.unit, curve.length - start, nominal, curve.closed);
      entries.push({
        id,
        offset,
        count: lay.count,
        start,
        pitch: lay.pitch,
        perSegment: !!p.perSegment,
        fill: lay.fill
      });
      offset += lay.count;
    }
    budget(offset, p.limit);
    return { count: offset, data: entries };
  },
  unitAt(context, data, index) {
    const p = context.params,
      e = owner(data, index),
      j = index - e.offset;
    const curve = context.geometry.curve(e.id);
    const [s0, s1] = e.perSegment
      ? [curve.vertex(j), curve.vertex(j + 1)]
      : [e.start + j * e.pitch, e.start + (j + 1) * e.pitch];
    if (!curve.isFree(s0, s1)) return;
    const size = p.stretch || e.fill ? sized(context.unit, joint(s1 - s0, p.gap ?? 0, p.gapLimit)) : undefined;
    if (size && !unitFits(context.unit, size)) return;
    const s = (s0 + s1) / 2;
    return { key: `${e.id}:${j}`, frame: curve.frame(s), ...(size && { size }), params: { s } };
  }
};

interface GridEntry {
  id: string;
  offset: number;
  count: number;
  /** Cell pitch along u and v. */
  w: number;
  h: number;
  /** First row and the number of slots per row. */
  r0: number;
  columns: number;
  /** First and end column for even and odd rows. */
  c0: [number, number];
  c1: [number, number];
  stagger: number;
  closed: boolean;
  fill: boolean;
}
/** Rows and columns over surfaces: abutting by default, or at a fixed `cell` pitch.
 * Row and column indices are anchored at u = 0, v = 0, so adding or removing area
 * never renumbers the units that remain. Only closed surfaces fill their period.
 * `trim` shortens units that cross the surface bounds instead of dropping them, and
 * `gap` leaves a joint between neighbours, at most `gapLimit` of the span when given.
 * Both stay inside the unit's range; a unit that cannot is not laid.
 * Each unit reports the surface parameter of its center as `params.uv`. */
export const surfaceGrid: LayingAlgorithm<
  {
    cell?: readonly [number, number];
    stagger?: number;
    trim?: boolean;
    gap?: readonly [number, number];
    gapLimit?: number;
    elements?: string[];
    limit?: number;
  },
  GridEntry[]
> = {
  info: {
    accepts: ["surface"],
    summary: "Rows and columns over surfaces, optionally staggered, trimmed at the edges.",
    params: {
      cell: "Fixed pitch [u, v] in metres. Default: the unit's size, abutting.",
      stagger: "Shift of odd rows as a fraction of the pitch, in [0, 1). Default: 0.",
      trim: "Shorten units that cross the edge instead of dropping them. Default: false.",
      gap: "Joint [u, v] between neighbours in metres. Default: [0, 0].",
      gapLimit: "Largest joint as a fraction of the span. Default: no limit.",
      elements: "Surface ids to use. Default: all surfaces.",
      limit: "Largest number of units. Default: 100000."
    }
  },
  plan(context) {
    const p = context.params;
    const size = p.cell === undefined ? extent(context, "surfaceGrid") : undefined;
    const [width, height] = p.cell ?? [size![0], size![1]];
    positive(width, "Cell width");
    positive(height, "Cell height");
    const stagger = p.stagger ?? 0;
    if (!(stagger >= 0 && stagger < 1)) throw Error("stagger must be in [0, 1)");
    const entries: GridEntry[] = [];
    let offset = 0;
    for (const id of select(context, "surface")) {
      const surface = context.geometry.surface(id);
      const { u, v } = surface.bounds;
      const closed = surface.domain.closedU;
      const period = surface.domain.u[1] - surface.domain.u[0];
      const lay = !closed
        ? { count: 0, pitch: width, fill: false }
        : size
          ? abut(context.unit, period, width, true)
          : spaced(period, width, true);
      const w = lay.pitch;
      const r0 = Math.floor(v[0] / height + 1e-9),
        r1 = Math.ceil(v[1] / height - 1e-9);
      const range = (shift: number): [number, number] =>
        closed ? [0, lay.count] : [Math.floor((u[0] - shift * w) / w + 1e-9), Math.ceil((u[1] - shift * w) / w - 1e-9)];
      const [even, odd] = [range(0), range(stagger)];
      const columns = Math.max(0, even[1] - even[0], odd[1] - odd[0]);
      const count = Math.max(0, r1 - r0) * columns;
      entries.push({
        id,
        offset,
        count,
        w,
        h: height,
        r0,
        columns,
        c0: [even[0], odd[0]],
        c1: [even[1], odd[1]],
        stagger,
        closed,
        fill: lay.fill
      });
      offset += count;
    }
    budget(offset, p.limit);
    return { count: offset, data: entries };
  },
  unitAt(context, data, index) {
    const p = context.params,
      e = owner(data, index),
      local = index - e.offset;
    const r = e.r0 + Math.floor(local / e.columns),
      parity = ((r % 2) + 2) % 2;
    const c = e.c0[parity] + (local % e.columns);
    if (c >= e.c1[parity]) return;
    const surface = context.geometry.surface(e.id);
    const { u, v } = surface.bounds;
    const shift = parity === 1 ? e.stagger : 0;
    let rect: Rect = [(c + shift) * e.w, r * e.h, (c + 1 + shift) * e.w, (r + 1) * e.h];
    if (p.trim) {
      rect = [
        e.closed ? rect[0] : Math.max(rect[0], u[0]),
        Math.max(rect[1], v[0]),
        e.closed ? rect[2] : Math.min(rect[2], u[1]),
        Math.min(rect[3], v[1])
      ];
      if (!(rect[2] > rect[0] && rect[3] > rect[1])) return;
    }
    if (!surface.covers(rect)) return;
    const gap = p.gap ?? [0, 0];
    const resized = p.trim || e.fill || gap[0] || gap[1];
    const size = resized
      ? sized(context.unit, joint(rect[2] - rect[0], gap[0], p.gapLimit), joint(rect[3] - rect[1], gap[1], p.gapLimit))
      : undefined;
    // A unit trimmed below its range is not laid at all.
    if (size && !unitFits(context.unit, size)) return;
    const uv = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
    return { key: `${e.id}:${r}:${c}`, frame: surface.frame(uv[0], uv[1]), params: { uv }, ...(size && { size }) };
  }
};
