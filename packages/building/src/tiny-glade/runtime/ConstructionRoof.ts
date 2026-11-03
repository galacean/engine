import { isFlatRoofHeight } from "./RoofMode";
/** Semantic roof construction and logical rest-pose edit anchors. GPU feedback
 * owns animation; this module never reads the rendered position buffer. */
import { f32, add, mul } from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint, UnitMetrics } from "./RecoveredRoofMath";
import { generateCircularRoof } from "./RecoveredRoofPlacement";
import type { RoofEmission } from "./RecoveredRoofPlacement";
import { generateRectangularRoof } from "./RecoveredRectangularRoof";
import { buildRoofContext, type RoofHostInput } from "./RecoveredRoofContext";
import { SurfaceProjector } from "./SurfaceProjector.js";
export interface ConstructionRoofInput {
  id: string;
  nativeId: number | bigint;
  slot: number;
  surface: RoofSurface;
  footprint: RoofFootprint;
  /** Every attachment uses the same oriented opening volumes, irrespective of style. */
  holes?: RoofHostInput["holes"];
  geometryId?: string;
  seed?: bigint;
  unitMetrics?: UnitMetrics;
}
const ownership: Record<string, [string, string | null]> = {
  "0x10058c960": ["corner_line_trim", "roof_ridge_or_end_strip"],
  "0x10058cf38": ["ridge_first", "roof_side_strip"],
  "0x10058d0a4": ["ridge_rest", "roof_side_strip"],
  "0x10058def8": ["ordinary_slope", null],
  "0x10058e104": ["first_row_closure", "roof_eave_closure"],
  "0x10055bcd0": ["ordinary_slope", null],
  "0x10055bea0": ["first_row_closure", "roof_eave_closure"]
};
export const roofBytes = (hex: string) => {
  if (!/^(?:[a-f0-9]{2}){64}$/i.test(hex)) throw Error("Roof initial ABI must be 64 bytes");
  return Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16));
};
function half(v: number) {
  const s = v & 32768 ? -1 : 1,
    e = (v >>> 10) & 31,
    m = v & 1023;
  return s * (e === 0 ? (2 ** -14 * m) / 1024 : e === 31 ? (m ? NaN : Infinity) : 2 ** (e - 15) * (1 + m / 1024));
}
/** Same stored half-float plane consumed by the native roof vertex shader. */
export function roofClipPlane(bytes: Uint8Array): number[] {
  if (bytes.byteLength !== 64) throw Error("Roof unit requires one complete 64-byte record");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const plane = [0, 1, 2, 3].map((i) => half(view.getUint16(16 + i * 2, true)));
  if (!plane.every(Number.isFinite)) throw Error("Nonfinite roof clipping plane");
  return plane;
}
export function roofBasis(q: number[]) {
  const k = Math.sqrt(q.reduce((s, x) => s + x * x, 0));
  if (!(k > 0)) throw Error("Invalid roof quaternion");
  const [x, y, z, w] = q.map((v) => v / k);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  ];
}
export function roofGravityTimeline(surface: RoofSurface, count: number) {
  let first = 0,
    second = 0;
  const dt = f32(1 / 60),
    factor = isFlatRoofHeight(surface.height_parameter) ? 2 : 1,
    steps = [];
  for (let i = 0; i < 60; i++) {
    const da = mul(factor, mul(dt, f32(2.857142925262451))),
      db = first > f32(0.99) ? mul(factor, mul(dt, f32(3.3333332538604736))) : 0;
    first = Math.min(1, Math.max(0, add(first, da)));
    second = Math.min(1, Math.max(0, add(second, db)));
    steps.push({
      dt: 1 / 60,
      first_instance: 0,
      instance_count: count,
      wall_height_delta: 0,
      roof_pivot_y: surface.base_height,
      animation_t: first
    });
  }
  return { steps, animation: [first, second] };
}
export function roofLogicalPlacements(
  geometry: any,
  pivot: number,
  raw: { observed_native_emits: RoofEmission[]; native_entry: string }
) {
  const projector = new SurfaceProjector(geometry),
    cells: any[] = [],
    edges: any[] = [],
    records: any[] = [],
    edgeRecords: any[] = [],
    provenance: any[] = [],
    pairs: any[] = [],
    ordinals = new Map<string, number>(),
    parts = new Map<string, string[]>();
  raw.observed_native_emits.forEach((emission, i) => {
    const owner = ownership[emission.callsite];
    if (!owner) throw Error("Unknown original roof callsite " + emission.callsite);
    const [role, rule] = owner,
      row = emission.row_context,
      key = role + (row ? "/side" + row.side_index + "/row" + row.row_index : ""),
      ordinal = ordinals.get(key) ?? 0;
    ordinals.set(key, ordinal + 1);
    const id = geometry.id + "/" + key + "/" + ordinal,
      bytes = roofBytes(emission.initial64_hex),
      v = new DataView(bytes.buffer),
      precision = emission.source_full_precision ?? {
        quaternion: [0, 1, 2, 3].map((i) => half(v.getUint16(32 + i * 2, true))),
        scale: [0, 1, 2].map((i) => half(v.getUint16(24 + i * 2, true)))
      },
      center = [v.getFloat32(0, true), v.getFloat32(4, true) + pivot, v.getFloat32(8, true)],
      [uv, anchor] = projector.anchor(center) as [number[], { triangle: number }],
      axes = roofBasis(precision.quaternion),
      cell = {
        id,
        logical_id: id,
        surface_id: geometry.id,
        surface_piece: anchor.triangle,
        anchor_uv: uv,
        center,
        tangent: axes[0],
        bitangent: axes[1],
        normal: axes[2],
        size: precision.scale
      },
      record = {
        cell_id: id,
        initial64_hex: emission.initial64_hex,
        quaternion_f32: precision.quaternion,
        world_height_origin: pivot
      };
    (role === "ordinary_slope" ? cells : edges).push(cell);
    (role === "ordinary_slope" ? records : edgeRecords).push(record);
    provenance.push({ cell_id: id, role, append_index: i, entry: raw.native_entry, emit_callsite: emission.callsite });
    if (rule) {
      if (!parts.has(rule)) parts.set(rule, []);
      parts.get(rule)!.push(id);
    }
    if (role === "first_row_closure") {
      if (i === 0 || provenance[i - 1].role !== "ordinary_slope" || row?.row_index !== 0)
        throw Error("First row closure lost its parent");
      pairs.push({ ordinary_cell_id: provenance[i - 1].cell_id, connection_cell_id: id });
    }
  });
  return {
    status: "generated",
    rule: "overlap_rows",
    cells,
    connection_cells: edges,
    roof_design: { schema: "roof-design-v1", records },
    connection_roof_design: { schema: "roof-design-v1", records: edgeRecords },
    first_row_closure_pairs: pairs,
    cell_provenance: provenance,
    connection_arrangement: {
      rule: { type: "roof_boundary_assembly" },
      components: [...parts].map(([type, cell_ids]) => ({ rule: { type }, cell_ids }))
    },
    placement_state: "authored-rest-pose",
    dynamic_state: "GPU feedback; no CPU state download"
  };
}
/** One authored-axis adapter for resident units and the distance appearance. */
export function generateConstructionRoofUnits(
  surface: RoofSurface,
  footprint: RoofFootprint,
  seed: bigint,
  metrics: UnitMetrics,
  slot: number
) {
  if ("radius" in footprint) return generateCircularRoof(surface, footprint, seed, metrics, slot);
  // The recovered kernel owns a ridge-X frame. Preserve world coordinates by
  // rotating the footprint frame together with swapping its dimensions.
  return surface.axis === 1
    ? generateRectangularRoof(
        { ...surface, axis: 0 },
        {
          ...footprint,
          width: footprint.depth,
          depth: footprint.width,
          orientation: [-footprint.orientation[1], footprint.orientation[0]]
        },
        seed,
        metrics,
        slot
      )
    : generateRectangularRoof(surface, footprint, seed, metrics, slot);
}
export function buildConstructionRoof(input: ConstructionRoofInput) {
  const { id, surface, footprint, slot } = input;
  if (
    !id ||
    (typeof input.nativeId === "bigint"
      ? input.nativeId < 1n
      : !Number.isSafeInteger(input.nativeId) || input.nativeId < 1)
  )
    throw Error("Stable semantic and native owner identities required");
  if (isFlatRoofHeight(surface.height_parameter))
    return {
      status: "flat" as const,
      id,
      nativeId: input.nativeId,
      slot,
      context: null,
      plan: null,
      raw: null,
      initial64: new Uint8Array(),
      gravity: roofGravityTimeline(surface, 0)
    };
  const context = buildRoofContext({ id, surface, footprint, renderSlot: slot, holes: input.holes });
  context.geometry.id = input.geometryId ?? "roof-" + id;
  const metrics = input.unitMetrics ?? { width: 0.5, height: 0.4375, depth: 0.1 },
    seed = input.seed ?? 0n,
    raw = generateConstructionRoofUnits(surface, footprint, seed, metrics, slot),
    plan = roofLogicalPlacements(context.geometry, surface.base_height, raw),
    initial64 = new Uint8Array(raw.observed_native_emits.length * 64);
  raw.observed_native_emits.forEach((e, i) => initial64.set(roofBytes(e.initial64_hex), i * 64));
  const gravity = roofGravityTimeline(surface, raw.observed_native_emits.length);
  return {
    status: "pitched" as const,
    id,
    nativeId: input.nativeId,
    slot,
    context,
    plan: { ...plan, gravity_timeline: gravity.steps },
    raw,
    initial64,
    gravity
  };
}
