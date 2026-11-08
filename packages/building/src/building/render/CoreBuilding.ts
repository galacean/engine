// Render adapter: a core design result -> everything the building renderer consumes.
// - Resident detail: unit draw groups, backing and surface parts, palette, placement document.
// - Distance view and queries: surface parts with distance appearance, structural parts,
//   focus poses and grounding.
// Units are laid once per part and shared by every output. The house part types are known
// here: walls and corner stones are masonry, roof slopes and their caps are roof tiles, a
// roof deck is paving, a parapet is masonry and a spire is a prefab.
import {
  bindSurfaces,
  EffectiveGeometry,
  expandUnits,
  hashString,
  type BuildingDesignResult,
  type AssetFacts,
  type BuildingEnvironment,
  type BuildingGroupDef,
  type BuildingRegistry,
  type LaidUnit,
  type Rect,
  type ResolvedPart
} from "../core";
import type { WallChartParams } from "../partTypes/House";
import type { RoofDeckParams } from "../partTypes/Roof";
import type { BuildingRenderInput, BuildingUnitDrawGroup } from "../runtime/BuildingRenderPackage";
import type { BuildingUnitAssets } from "../runtime/BuildingUnitAssets";
import type { BuildingPaletteSlot } from "../runtime/BuildingGlobals";
import type { ConstructionGrounding } from "../runtime/TerrainField";
import type { ConstructionUnitRole } from "../runtime/ConstructionUnitRender";
import type { SupportCell } from "../runtime/PlacementSupport";
import type { MaterialUnit } from "../runtime/UnitPlacementStyle";
import {
  constructionBrickColor,
  roofPalette,
  woodPalette,
  type ConstructionPreviewPart,
  type ConstructionSurfacePart
} from "../runtime/ProfilePreview";
import { constructionLodAppearance, type ConstructionLodCell } from "../runtime/ConstructionLodAppearance";
import { constructionSurfaceFrame, projectConstructionSurface } from "../runtime/ConstructionSurfaceFrame";
import {
  effectiveSurfaceRegions,
  subtractSurfacePolygon,
  surfaceBoundary,
  surfaceMaskTriangles
} from "../runtime/SurfacePolygon";
import { plasterPalette } from "../runtime/ConstructionPlasterPalette";
import { decorationAssemblyGeometry } from "../runtime/ConstructionDecorationGeometry";
import { decorationMesh } from "../runtime/ConstructionDecorationMeshes";
import { masonryTintRoles, whiteMasonryVertexColors } from "../runtime/MasonryAppearance";
import type {
  CompiledConstructionDecorations,
  ConstructionDecorationPart,
  ConstructionDecorationStone
} from "../runtime/ConstructionDecorations";
import type { ConstructionDecorationFrame } from "../runtime/ConstructionDecorationFrames";
import type { DecorationStoneInstance } from "../runtime/DecorationStoneInstance";
import { decorationStoneBounds } from "../runtime/DecorationStoneBounds";
import type { ConstructionJunctionGroup } from "../runtime/ConstructionJunctionLayout";
import type { ConstructionWoodArchPart, ConstructionWoodArchPillar } from "../runtime/ConstructionWoodArchRender";
import { wallChartSampler } from "../partTypes/House";
import { packConstructionUnits } from "../runtime/ConstructionUnitRender";
import { encodeCompleteConstructionDormerBins } from "../runtime/DormerBins";
import { placeProfileRoofSpire } from "../runtime/ProfileRoofSpire";
import { wallRoofJointHeight } from "../runtime/ConstructionWallRoofJoint";
import { f32BitsToHalf } from "../runtime/UnitPacking.js";
import type { RetainedWallUnits } from "../runtime/ConstructionWallLod";

/** How the renderer draws the units of each part type. */
type Family = "wall" | "parapet" | "roof" | "spire" | "plaster" | "prefab" | "enclosure";
const FAMILIES: Readonly<Record<string, Family>> = {
  freeWall: "enclosure",
  fencePost: "enclosure",
  fenceRail: "enclosure",
  steps: "enclosure",
  wall: "wall",
  cornerStone: "wall",
  wallSeam: "wall",
  floorBand: "wall",
  parapet: "parapet",
  roof: "roof",
  hipCap: "roof",
  ridgeCap: "roof",
  rakeCap: "roof",
  roofDeck: "roof",
  spire: "spire",
  plaster: "plaster",
  window: "prefab",
  door: "prefab",
  lamp: "prefab"
};
const MATERIALS = new Set<string>(["brick", "roof_tile", "wooden_plank"]);
const NO_CLIP = [0, 1, 0, 65504];

/** The environment a design runs in: the ground, and the asset layer's facts about the
 * building prefabs of an asset kit, which units name as `{ prefab: key }`. */
export function coreBuildingEnvironment(
  ground: BuildingEnvironment["ground"],
  assets?: BuildingUnitAssets
): BuildingEnvironment {
  return {
    ...(ground && { ground }),
    ...(assets && {
      asset: (source) => {
        const key = typeof source === "object" ? source.prefab : undefined;
        return typeof key === "string" ? (assets.prefabs?.[key] as unknown as AssetFacts | undefined) : undefined;
      }
    })
  };
}
export interface CoreBuildingOptions {
  /** Must be the environment the design ran with. */
  readonly environment?: BuildingEnvironment;
}
interface LaidPart {
  readonly part: ResolvedPart;
  readonly units: readonly LaidUnit[];
}
/** The parts of one group that share a material binding and a placement chart. */
interface CoreBinding {
  readonly id: string;
  readonly owner: string;
  readonly family: Family;
  readonly material: MaterialUnit;
  readonly parts: readonly LaidPart[];
}
interface CoreOwner {
  readonly group: BuildingGroupDef;
  /** Palette slot: the index of the group. */
  readonly slot: number;
  readonly palette: BuildingPaletteSlot;
  readonly bindings: readonly CoreBinding[];
}
/** A design result with every unit laid once. */
export interface CoreBuildingLayout {
  readonly result: BuildingDesignResult;
  readonly owners: readonly CoreOwner[];
  readonly surfaces: ReturnType<typeof bindSurfaces>;
  readonly registry: BuildingRegistry;
}

/** Lays every unit of the design once and sorts the parts into material bindings. */
export function coreBuildingLayout(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  options: CoreBuildingOptions = {}
): CoreBuildingLayout {
  // Parts that failed have no layout and lay nothing; the caller decides whether the
  // design's diagnostics are acceptable.
  const environment = options.environment ?? {};
  const owners = result.groups.map((group, slot): CoreOwner => {
    const appearance = (group.shared?.appearance ?? {}) as { wall?: number; roof?: number; wood?: number };
    const byFamily = new Map<Family, LaidPart[]>();
    for (const part of result.parts) {
      if (part.group !== group.id) continue;
      const family = FAMILIES[part.type];
      if (!family) throw Error(`The renderer has no family for part type "${part.type}"`);
      const list = byFamily.get(family) ?? [];
      list.push({ part, units: expandUnits(part, registry, { environment }) });
      byFamily.set(family, list);
    }
    const bindings = [...byFamily].map(([family, parts]): CoreBinding => {
      const unitSource = parts.find((p) => p.part.unit)?.part.unit?.source;
      const source = typeof unitSource === "string" ? unitSource : "";
      if (family !== "spire" && family !== "plaster" && family !== "prefab" && !MATERIALS.has(source))
        throw Error(`Unsupported unit source ${JSON.stringify(unitSource)}`);
      return { id: `${group.id}-${family}`, owner: group.id, family, material: source as MaterialUnit, parts };
    });
    return {
      group,
      slot,
      palette: {
        seed: group.seed,
        wallColor: appearance.wall ?? 0,
        roofColor: appearance.roof ?? 2,
        woodColor: appearance.wood ?? 0
      },
      bindings
    };
  });
  return { result, owners, surfaces: bindSurfaces(registry.surfaces, environment), registry };
}

const chartOf = (part: ResolvedPart): WallChartParams | undefined => {
  const face = part.original.elements.face;
  return face?.kind === "surface" && face.surface.kind === "wallChart"
    ? (face.surface.params as WallChartParams)
    : undefined;
};
/** Part identity in unit ids: the author id, or a hash of a derived part's key. */
const partId = (part: ResolvedPart) =>
  part.identity.kind === "author" ? part.identity.id : `d${hashString(part.key).toString(36)}`;
/** Lowest wall chart base of a masonry binding: v = 0 of its placement chart. */
const chartBase = (binding: CoreBinding) =>
  Math.min(...binding.parts.flatMap((p) => (chartOf(p.part) ? [chartOf(p.part)!.minGround] : [])));

/** Masonry cells. Their placement chart runs along the house perimeter, with height above
 * the lowest wall base. */
function masonryCells(
  binding: CoreBinding,
  parts: readonly LaidPart[] = binding.parts,
  base = chartBase(binding)
): SupportCell[] {
  return parts.flatMap(({ part, units }) =>
    units.map((u) => {
      const id = `${binding.id}/${partId(part)}/${u.key}`;
      const span = u.params?.wallU as [number, number] | undefined;
      if (!span) throw Error(`Masonry unit ${id} has no wall span`);
      return {
        id,
        logical_id: id,
        surface_id: binding.id,
        anchor_uv: [(span[0] + span[1]) / 2, u.frame.origin[1] - base],
        center: [...u.frame.origin],
        tangent: [...u.frame.x],
        bitangent: [...u.frame.y],
        normal: [...u.frame.z],
        size: [...u.size!],
        brick_deformation: [...(u.params!.deformation as number[])],
        brick_flags: u.params!.flags as number,
        brick_seed: u.seed & 0x7fffffff,
        brick_accent: !!u.params!.accent,
        brick_span: [span[0], span[1]]
      };
    })
  );
}

/** Unit quaternion [x, y, z, w] of a frame, rounded to float32. */
function frameQuaternion(u: LaidUnit): number[] {
  const { x, y, z } = u.frame;
  const trace = x[0] + y[1] + z[2];
  let q: number[];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4];
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2;
    q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  } else if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2;
    q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  } else {
    const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2;
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
  }
  return q.map(Math.fround);
}
/** The rotation the roof packer reads back from a quaternion, with its arithmetic. */
function quaternionBasis(q: number[]): number[][] {
  const k = Math.sqrt(q.reduce((s, v) => s + v * v, 0)),
    [x, y, z, w] = q.map((v) => v / k);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  ];
}
const toHalf = (v: number) => {
  const f = new DataView(new ArrayBuffer(4));
  f.setFloat32(0, v, true);
  return f32BitsToHalf(f.getUint32(0, true));
};
interface RoofRecords {
  cells: SupportCell[];
  records: { cell_id: string; initial64_hex: string; quaternion_f32: number[]; world_height_origin: number }[];
}
/** The roof's lowest eave: the height the roof records and the entrance animation start from. */
function roofBase(binding: CoreBinding): number {
  let base = Infinity;
  for (const { part } of binding.parts) {
    const element = part.original.elements.slope;
    if (element?.kind === "surface") base = Math.min(base, (element.surface.params as { base: number }).base);
  }
  return base;
}
/** One roof tile as a cell and its 64-byte roof record: position relative to the roof base,
 * clip plane, size, shade and rotation as half floats, palette slot, variation seed, the
 * circular flag and the entrance flag. Roof cells are anchored by their plan position. */
function roofEntry(target: RoofRecords, id: string, surface: string, u: LaidUnit, base: number, slot: number) {
  const q = frameQuaternion(u);
  const size = u.size!.map(Math.fround);
  const position = [u.frame.origin[0], u.frame.origin[1] - base, u.frame.origin[2]].map(Math.fround);
  const plane = (u.params?.clip as number[] | undefined) ?? NO_CLIP;
  // The plane moves with the record's heights.
  const clip = [plane[0], plane[1], plane[2], Math.min(65504, plane[3] + plane[1] * base)];
  const bytes = new Uint8Array(64),
    view = new DataView(bytes.buffer);
  position.forEach((v, i) => view.setFloat32(i * 4, v, true));
  [...clip, ...size, (u.params?.shade as number | undefined) ?? 0, ...q].forEach((v, i) =>
    view.setUint16(16 + i * 2, toHalf(v), true)
  );
  view.setUint32(40, slot, true);
  view.setUint32(52, u.seed >>> 0, true);
  view.setUint32(56, u.params?.circular ? 1 : 0, true);
  view.setUint32(60, (u.params?.flag as number | undefined) ?? 1, true);
  const [tangent, bitangent, normal] = quaternionBasis(q);
  target.cells.push({
    id,
    logical_id: id,
    surface_id: surface,
    anchor_uv: [u.frame.origin[0], u.frame.origin[2]],
    center: [position[0], position[1] + base, position[2]],
    tangent,
    bitangent,
    normal,
    size
  });
  target.records.push({
    cell_id: id,
    initial64_hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    quaternion_f32: q,
    world_height_origin: base
  });
}
/** Roof tiles fall into place over one second; a flat roof falls twice as fast. */
function roofEntrance(base: number, count: number, flat = false) {
  const dt = 1 / 60;
  let t = 0;
  return Array.from({ length: 60 }, () => {
    t = Math.min(1, t + (flat ? 2 : 1) * dt * 2.857142925262451);
    return { dt, first_instance: 0, instance_count: count, wall_height_delta: 0, roof_pivot_y: base, animation_t: t };
  });
}
/** Paving and other plain units: the generic packer derives every record from the cell. */
/** A laid unit's size: the size the algorithm chose, or the prototype's scaled and stretched box. */
function laidSize(part: ResolvedPart, u: LaidUnit): number[] {
  if (u.size) return [...u.size];
  const bounds = part.unit?.bounds,
    scale = part.unit?.scale ?? [1, 1, 1];
  if (!bounds) throw Error(`Unit of ${part.key} has neither a laid size nor bounds`);
  return [0, 1, 2].map((a) => (bounds.max[a] - bounds.min[a]) * scale[a] * u.stretch[a]);
}
/** The center of a laid unit's box: the prototype's bounds center through the unit's matrix. */
function laidCenter(part: ResolvedPart, u: LaidUnit): number[] {
  const bounds = part.unit?.bounds;
  if (!bounds) return [...u.frame.origin];
  const c = [0, 1, 2].map((a) => (bounds.min[a] + bounds.max[a]) / 2),
    m = u.matrix;
  return [0, 1, 2].map((k) => m[k] * c[0] + m[4 + k] * c[1] + m[8 + k] * c[2] + m[12 + k]);
}
function plainCells(binding: CoreBinding): SupportCell[] {
  return binding.parts.flatMap(({ part, units }) =>
    units.map((u) => {
      const id = `${binding.id}/${partId(part)}/${u.key}`;
      return {
        id,
        logical_id: id,
        surface_id: binding.id,
        anchor_uv: [u.frame.origin[0], u.frame.origin[2]],
        center: laidCenter(part, u),
        tangent: [...u.frame.x],
        bitangent: [...u.frame.y],
        normal: [...u.frame.z],
        size: laidSize(part, u)
      };
    })
  );
}

interface DrawPlan {
  role: ConstructionUnitRole;
  cells: SupportCell[];
  design?: RoofRecords;
  gravity?: ReturnType<typeof roofEntrance>;
  wallRoofJoint?: WallChartParams["joint"];
}
/** The draw groups of one binding, and the dependencies between its cells. */
function bindingDraws(binding: CoreBinding, slot: number) {
  const draws: DrawPlan[] = [];
  const dependencies: { parent_cell_id: string; child_cell_id: string }[] = [];
  if (binding.family === "wall" || binding.family === "parapet") {
    const joint = binding.parts.map((p) => chartOf(p.part)?.joint).find(Boolean);
    // Floor bands are masonry of the same binding, drawn as their own group.
    const bands = binding.parts.filter((p) => p.part.type === "floorBand");
    const body = binding.parts.filter((p) => p.part.type !== "floorBand");
    const base = chartBase(binding);
    draws.push({ role: "wall", cells: masonryCells(binding, body, base), ...(joint && { wallRoofJoint: joint }) });
    if (bands.length) draws.push({ role: "floor-band", cells: masonryCells(binding, bands, base) });
  } else if (binding.family === "enclosure") {
    draws.push({ role: "enclosure", cells: plainCells(binding) });
  } else if (binding.family === "roof") {
    const deck = binding.parts.filter((p) => p.part.type === "roofDeck");
    if (deck.length) draws.push({ role: "platform", cells: plainCells({ ...binding, parts: deck }) });
    const pitched = binding.parts.filter((p) => p.part.type !== "roofDeck");
    if (pitched.length) {
      const base = roofBase(binding);
      const tiles: RoofRecords = { cells: [], records: [] },
        edges: RoofRecords = { cells: [], records: [] };
      for (const { part, units } of pitched)
        for (const u of units) {
          const id = `${binding.id}/${partId(part)}/${u.key}`;
          const closure = u.key.startsWith("eave/");
          roofEntry(part.type === "roof" && !closure ? tiles : edges, id, binding.id, u, base, slot);
          // A closure belongs to the first-row tile above it.
          if (closure)
            dependencies.push({
              parent_cell_id: `${binding.id}/${partId(part)}/0/${u.key.slice(5)}`,
              child_cell_id: id
            });
        }
      if (tiles.cells.length)
        draws.push({
          role: "layout",
          cells: tiles.cells,
          design: tiles,
          gravity: roofEntrance(base, tiles.cells.length)
        });
      if (edges.cells.length)
        draws.push({
          role: "connections",
          cells: edges.cells,
          design: edges,
          gravity: roofEntrance(base, edges.cells.length)
        });
    }
  }
  // Ring tiles have no row-0 parent for every closure; keep only dependencies inside the binding.
  const ids = new Set(draws.flatMap((d) => d.cells.map((c) => c.id)));
  return { draws, dependencies: dependencies.filter((d) => ids.has(d.parent_cell_id) && ids.has(d.child_cell_id)) };
}

// ---------------------------------------------------------------- surfaces

const colorOf = (palette: BuildingPaletteSlot, material: ConstructionPreviewPart["material"]) =>
  material === "wooden_plank"
    ? woodPalette[palette.woodColor % woodPalette.length]
    : material === "roof_tile"
      ? roofPalette[palette.roofColor % roofPalette.length]
      : constructionBrickColor(palette.wallColor);
interface Mesh {
  positions: number[];
  indices: number[];
  uvs: number[][];
}
const emptyMesh = (): Mesh => ({ positions: [], indices: [], uvs: [] });
function quad(mesh: Mesh, v: number[][], uv: number[][]) {
  const base = mesh.positions.length / 3;
  for (const p of v) mesh.positions.push(p[0], p[1], p[2]);
  mesh.uvs.push(...uv);
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** The outer face of the walls of one binding, unrolled along the perimeter: u = perimeter
 * metres, v = height above the binding's chart base. The top follows the roof joint. The
 * areas removed from the walls, such as openings, stay open: `holes` are rects of perimeter
 * metres and heights. */
function wallSurface(binding: CoreBinding, holes: readonly Rect[]) {
  const walls = binding.parts
    .flatMap((p) => (chartOf(p.part) ? [chartOf(p.part)!] : []))
    .sort((a, b) => (a.uOffset ?? 0) - (b.uOffset ?? 0));
  const base = chartBase(binding);
  const mesh = emptyMesh();
  // Corner joins: each chart's first point is the previous chart's last point.
  const ring: { p: readonly number[]; top: number; third: number; u: number }[] = [];
  for (const chart of walls) {
    let u = chart.uOffset ?? 0;
    chart.points.forEach((p, i) => {
      if (i > 0) u += Math.hypot(p[0] - chart.points[i - 1][0], p[2] - chart.points[i - 1][2]);
      const last = ring[ring.length - 1];
      if (last && Math.hypot(last.p[0] - p[0], last.p[2] - p[2]) < 1e-9) return;
      ring.push({ p, top: chart.top[i], third: chart.third[i], u });
    });
  }
  const closed =
    ring.length > 2 && Math.hypot(ring[0].p[0] - ring.at(-1)!.p[0], ring[0].p[2] - ring.at(-1)!.p[2]) < 1e-6;
  if (closed) ring.pop();
  const chart = walls[0];
  const n = ring.length,
    edges = closed ? n : n - 1;
  const normalOf = (i: number) => {
    const a = ring[i % n].p,
      b = ring[(i + 1) % n].p,
      l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return [-(b[2] - a[2]) / l, (b[0] - a[0]) / l];
  };
  // Offset a ring vertex outward by `d`, mitred between its two edges.
  const offset = (i: number, d: number) => {
    const p = ring[i % n].p;
    const prev = closed || i > 0 ? normalOf((i - 1 + n) % n) : normalOf(0);
    const next = closed || i < n - 1 ? normalOf(i % n) : normalOf(n - 2);
    const m = [prev[0] + next[0], prev[1] + next[1]],
      k = d / Math.max(0.2, 1 + prev[0] * next[0] + prev[1] * next[1]);
    return [p[0] + m[0] * k, p[2] + m[1] * k];
  };
  const outer = (i: number) => offset(i, chart.nominalOuter);
  const perimeter = ring.length
    ? closed
      ? ring.at(-1)!.u + Math.hypot(...[0, 2].map((k) => ring[0].p[k] - ring.at(-1)!.p[k]))
      : ring.at(-1)!.u
    : 0;
  for (let e = 0; e < edges; e++) {
    const a = ring[e],
      b = ring[(e + 1) % n];
    const [ax, az] = outer(e),
      [bx, bz] = outer((e + 1) % n);
    const ua = a.u,
      ub = closed && e === n - 1 ? perimeter : b.u;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    const at = (t: number) => {
      const x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      const bottom = a.p[1] + (b.p[1] - a.p[1]) * t + Math.max(0, a.third + (b.third - a.third) * t);
      const top = chart.joint ? wallRoofJointHeight(chart.joint, x, z) : a.top + (b.top - a.top) * t;
      return { x, z, bottom, top, u: ua + (ub - ua) * t };
    };
    for (let s = 0; s < steps; s++) {
      const p = at(s / steps),
        q = at((s + 1) / steps);
      // Split the strip at the edges of the holes it meets; each piece leaves out the
      // heights its holes cover.
      const cuts = holes.filter((h) => h[0] < q.u && h[2] > p.u);
      const breaks = [p.u, ...cuts.flatMap((h) => [h[0], h[2]]).filter((u) => u > p.u && u < q.u), q.u].sort(
        (x, y) => x - y
      );
      for (let k = 0; k < breaks.length - 1; k++) {
        const a = at((s + (breaks[k] - p.u) / (q.u - p.u)) / steps),
          b = at((s + (breaks[k + 1] - p.u) / (q.u - p.u)) / steps);
        const mid = (breaks[k] + breaks[k + 1]) / 2;
        const gaps: [number, number][] = [];
        let low = -Infinity;
        for (const h of cuts.filter((h) => h[0] <= mid && h[2] >= mid).sort((x, y) => x[1] - y[1])) {
          gaps.push([low, h[1]]);
          low = Math.max(low, h[3]);
        }
        gaps.push([low, Infinity]);
        for (const [lo, hi] of gaps) {
          const a0 = Math.max(a.bottom, lo),
            a1 = Math.max(a0, Math.min(a.top, hi)),
            b0 = Math.max(b.bottom, lo),
            b1 = Math.max(b0, Math.min(b.top, hi));
          if (a1 <= a0 && b1 <= b0) continue;
          quad(
            mesh,
            [
              [a.x, a0, a.z],
              [b.x, b0, b.z],
              [b.x, b1, b.z],
              [a.x, a1, a.z]
            ],
            [
              [a.u, a0 - base],
              [b.u, b0 - base],
              [b.u, b1 - base],
              [a.u, a1 - base]
            ]
          );
        }
      }
    }
  }
  // The finish face around the house: units beyond it stand out of the wall.
  const finish = closed ? ring.map((_, i) => offset(i, chart.finishOuter)) : undefined;
  return { mesh, perimeter, inset: 0.04 + 0.02 * (chart.depthScale ?? 1), finish };
}

function insidePolygon(polygon: readonly number[][], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Whether a unit's box reaches beyond a footprint outline. */
function standsOut(cell: SupportCell, outline: readonly number[][]) {
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        const at = (k: number) =>
          cell.center[k] +
          x * cell.size[0] * cell.tangent[k] +
          y * cell.size[1] * cell.bitangent[k] +
          z * cell.size[2] * cell.normal[k];
        if (!insidePolygon(outline, at(0), at(2))) return true;
      }
  return false;
}

/** Mitred outline of a closed wall chart, `d` metres out from its points: position and outward
 * normal at perimeter coordinate u. */
function ringAt(chart: WallChartParams, d: number) {
  const pts = chart.points.slice();
  if (Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][2] - pts.at(-1)![2]) < 1e-9) pts.pop();
  const n = pts.length;
  const knots = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i],
      b = pts[(i + 1) % n];
    knots.push(knots[i] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const length = knots[n];
  const normal = (i: number) => {
    const a = pts[((i % n) + n) % n],
      b = pts[(((i + 1) % n) + n) % n],
      l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return [-(b[2] - a[2]) / l, (b[0] - a[0]) / l];
  };
  const corner = (i: number) => {
    const [p, q] = [normal(i - 1), normal(i)];
    const m = [p[0] + q[0], p[1] + q[1]],
      k = 1 / Math.max(0.2, 1 + p[0] * q[0] + p[1] * q[1]);
    return { x: pts[i % n][0] + m[0] * k * d, z: pts[i % n][2] + m[1] * k * d, n: [m[0] * k, m[1] * k] };
  };
  return {
    length,
    at(u: number) {
      const w = ((u % length) + length) % length;
      let i = 0;
      while (i < n - 1 && knots[i + 1] <= w) i++;
      const t = (w - knots[i]) / (knots[i + 1] - knots[i]);
      const a = corner(i),
        b = corner(i + 1);
      const nx = a.n[0] + (b.n[0] - a.n[0]) * t,
        nz = a.n[1] + (b.n[1] - a.n[1]) * t,
        nl = Math.hypot(nx, nz) || 1;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, normal: [nx / nl, 0, nz / nl] };
    }
  };
}
/** The finish over a wall chart as a preview part: the chart's region without removed areas,
 * cut into cells no taller than 0.4 m, lifted to the finish face. Each vertex keeps its
 * distance to the finish's edge, where the shader wears it off. */
function plasterPart(
  layout: CoreBuildingLayout,
  owner: CoreOwner,
  binding: CoreBinding,
  part: ResolvedPart,
  unit: LaidUnit
): ConstructionPreviewPart | undefined {
  const id = unit.params!.element as string;
  const element = part.original.elements[id];
  if (element?.kind !== "surface" || element.surface.kind !== "wallChart") return;
  const chart = element.surface.params as WallChartParams;
  const surface = new EffectiveGeometry(part.original, part.modifications, layout.surfaces).surface(id);
  const ring = ringAt(chart, chart.finishOuter);
  const outline = surface.region();
  const shifts = surface.domain.closedU ? [-ring.length, 0, ring.length] : [0];
  const holes = surface.removed.flatMap((r) =>
    shifts.map((k) => ({
      rect: [r[0] + k, r[1], r[2] + k, r[3]] as Rect,
      boundary: surfaceBoundary([
        [r[0] + k, r[1]],
        [r[2] + k, r[1]],
        [r[2] + k, r[3]],
        [r[0] + k, r[3]]
      ])
    }))
  );
  // The region is a band over u: bottom along its first half, top back along its second.
  // Each slice between two samples splits into rows no taller than 0.4 m, which keeps the
  // shader's warp smooth; only the cells that meet a removed area are clipped.
  const half = outline.length / 2;
  const triangles: number[][][] = [];
  const lerp = (a: readonly number[], b: readonly number[], t: number) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t
  ];
  for (let i = 0; i < half - 1; i++) {
    const [b0, b1] = [outline[i], outline[i + 1]],
      [t1, t0] = [outline[outline.length - 2 - i], outline[outline.length - 1 - i]];
    const rows = Math.max(1, Math.ceil(Math.max(t0[1] - b0[1], t1[1] - b1[1]) / 0.4));
    for (let r = 0; r < rows; r++) {
      const cell = [
        lerp(b0, t0, r / rows),
        lerp(b1, t1, r / rows),
        lerp(b1, t1, (r + 1) / rows),
        lerp(b0, t0, (r + 1) / rows)
      ];
      const u0 = Math.min(cell[0][0], cell[3][0]),
        u1 = Math.max(cell[1][0], cell[2][0]),
        v0 = Math.min(cell[0][1], cell[1][1]),
        v1 = Math.max(cell[2][1], cell[3][1]);
      const cuts = holes.filter(({ rect: h }) => h[0] < u1 && h[2] > u0 && h[1] < v1 && h[3] > v0);
      if (!cuts.length) {
        triangles.push([cell[0], cell[1], cell[2]], [cell[0], cell[2], cell[3]]);
        continue;
      }
      let pieces = [surfaceBoundary(cell)];
      for (const hole of cuts) pieces = pieces.flatMap((q) => subtractSurfacePolygon(q, hole.boundary));
      for (const piece of effectiveSurfaceRegions(pieces))
        for (const tri of surfaceMaskTriangles(piece.points)) triangles.push(tri.points);
    }
  }
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[][] = [],
    indices: number[] = [],
    distances: number[] = [];
  const index = new Map<string, number>();
  const vertex = ([u, v]: number[]) => {
    const key = `${u.toFixed(6)}/${v.toFixed(6)}`;
    let k = index.get(key);
    if (k === undefined) {
      const at = ring.at(u);
      k = uvs.length;
      positions.push(at.x, v, at.z);
      normals.push(...at.normal);
      uvs.push([u, v - chart.minGround]);
      distances.push(surface.edgeDistance(u, v, 1));
      index.set(key, k);
    }
    return k;
  };
  for (const t of triangles) {
    // Keep the face pointing out of the wall.
    const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
    const ordered = area >= 0 ? t : [t[0], t[2], t[1]];
    indices.push(...ordered.map(vertex));
  }
  if (!indices.length) return;
  const wear = (unit.params?.wear as number | undefined) ?? 0.3,
    color = (unit.params?.color as number | undefined) ?? 0;
  return {
    owner: owner.group.id,
    material: "brick",
    bindingId: binding.id,
    geometryId: binding.id,
    positions,
    normals,
    indices,
    uvs,
    colors: Array(positions.length).fill(1),
    emission: Array(positions.length / 3).fill(0),
    color: plasterPalette[color % plasterPalette.length].slice(),
    plaster: { wear, color, wallLength: ring.length, edgeDistances: distances }
  };
}

/** A metric unrolling of a surface: rows along v at arc length t, and along each row the
 * signed distance s from the middle. Returns the mesh and the chart of any (u, v). */
function unrolledSurface(surface: ReturnType<EffectiveGeometry["surface"]>, offset: number, nu: number, nv: number) {
  const {
    u: [u0, u1],
    v: [v0, v1]
  } = surface.domain;
  const point = (u: number, v: number): number[] => [...surface.frame(u, v).origin];
  const vs = Array.from({ length: nv + 1 }, (_, j) => v0 + ((v1 - v0) * j) / nv);
  const us = Array.from({ length: nu + 1 }, (_, i) => u0 + ((u1 - u0) * i) / nu);
  const mid = (u0 + u1) / 2;
  const ts = [0];
  for (let j = 1; j <= nv; j++) ts.push(ts[j - 1] + Math.hypot(...sub3(point(mid, vs[j]), point(mid, vs[j - 1]))));
  // Arc length along a row from its middle.
  const along = (u: number, v: number) => {
    const steps = 8;
    let s = 0;
    let prev = point(mid, v);
    for (let k = 1; k <= steps; k++) {
      const next = point(mid + ((u - mid) * k) / steps, v);
      s += Math.hypot(...sub3(next, prev));
      prev = next;
    }
    return u < mid ? -s : s;
  };
  const tAt = (v: number) => {
    const x = ((v - v0) / (v1 - v0)) * nv,
      j = Math.min(nv - 1, Math.max(0, Math.floor(x)));
    return ts[j] + (ts[j + 1] - ts[j]) * (x - j);
  };
  const chart = (u: number, v: number) => [offset + along(u, v), tAt(v)];
  const mesh = emptyMesh();
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const corners = [
        [us[i], vs[j]],
        [us[i + 1], vs[j]],
        [us[i + 1], vs[j + 1]],
        [us[i], vs[j + 1]]
      ];
      quad(
        mesh,
        corners.map(([u, v]) => point(u, v)),
        corners.map(([u, v]) => chart(u, v))
      );
    }
  let width = 0;
  for (const v of vs) width = Math.max(width, along(u1, v) - along(u0, v));
  return { mesh, chart, width };
}
const sub3 = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2]
];

/** A roof deck in its own plane coordinates: the square, or the inscribed disc. */
function deckSurface(p: RoofDeckParams, offset: number) {
  const [W, D] = p.size;
  const at = (u: number, v: number) => [0, 1, 2].map((k) => p.origin[k] + p.x[k] * u + p.y[k] * v);
  const chart = (u: number, v: number) => [offset + u, v];
  const mesh = emptyMesh();
  if (!p.round)
    quad(mesh, [at(0, 0), at(W, 0), at(W, D), at(0, D)], [chart(0, 0), chart(W, 0), chart(W, D), chart(0, D)]);
  else {
    const n = Math.max(24, Math.ceil((Math.PI * W) / 0.35));
    const ring = Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return [W / 2 + (Math.cos(a) * W) / 2, D / 2 + (Math.sin(a) * D) / 2];
    });
    const center = mesh.positions.length / 3;
    mesh.positions.push(...at(W / 2, D / 2));
    mesh.uvs.push(chart(W / 2, D / 2));
    for (const [u, v] of ring) {
      mesh.positions.push(...at(u, v));
      mesh.uvs.push(chart(u, v));
    }
    for (let i = 0; i < n; i++) mesh.indices.push(center, center + 1 + i, center + 1 + ((i + 1) % n));
  }
  return { mesh, chart, width: W };
}
/** Six faces of a unit box, for solid units such as a parapet's merlons. The box is the
 * prototype's bounds through the unit's matrix, or the laid size around the frame. Each face
 * is charted in metres around `anchor` when one is given, else from its own corner. */
function unitBox(mesh: Mesh, part: ResolvedPart, u: LaidUnit, anchor?: number[]) {
  const bounds = part.unit?.bounds,
    m = u.matrix;
  const axes = [u.frame.x, u.frame.y, u.frame.z],
    size = laidSize(part, u);
  const corner = (x: number, y: number, z: number) => {
    if (u.size || !bounds)
      return u.frame.origin.map(
        (c, k) => c + (x * size[0] * axes[0][k] + y * size[1] * axes[1][k] + z * size[2] * axes[2][k]) / 2
      );
    const p = [x, y, z].map((t, a) => (t < 0 ? bounds.min[a] : bounds.max[a]));
    return [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
  };
  const v = [-1, 1].flatMap((z) => [-1, 1].flatMap((y) => [-1, 1].map((x) => corner(x, y, z))));
  for (const face of [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
    [2, 6, 7, 3],
    [0, 1, 5, 4]
  ]) {
    const corners = face.map((i) => v[i]);
    const w = Math.hypot(...sub3(corners[1], corners[0])),
      h = Math.hypot(...sub3(corners[3], corners[0]));
    const [u0, v0] = anchor ? [anchor[0] - w / 2, anchor[1] - h / 2] : [0, 0];
    quad(mesh, corners, [
      [u0, v0],
      [u0 + w, v0],
      [u0 + w, v0 + h],
      [u0, v0 + h]
    ]);
  }
}

export interface CoreBuildingViewOptions {
  /** Units' footprints painted into each surface, for the distance view. */
  readonly includeAppearance?: boolean;
  /** Surface polygons for queries such as snapping and picking. */
  readonly includeStructure?: boolean;
  /** Required for prefab units such as the roof spire. */
  readonly assets?: BuildingUnitAssets;
  /** Keep each prefab's meshes as its own part, as Scene-bound views need; otherwise every
   * group's prefabs batch into one distance part. */
  readonly retainDecorationParts?: boolean;
}
/** Display, structure and distance geometry of a laid design, in the shape the building
 * renderer and the distance view consume. */
export function coreBuildingView(layout: CoreBuildingLayout, options: CoreBuildingViewOptions = {}) {
  const parts: ConstructionPreviewPart[] = [];
  const retainedWallUnits: RetainedWallUnits[] = [];
  const structure = new Map<string, ConstructionSurfacePart>();
  const capture = (owner: string, mesh: Mesh) => {
    if (!options.includeStructure) return;
    let target = structure.get(owner);
    if (!target) structure.set(owner, (target = { owner, positions: [], indices: [], regions: [] }));
    const base = target.positions.length / 3;
    target.positions.push(...mesh.positions);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3);
      const v = ids.map((k) => mesh.positions.slice(k * 3, k * 3 + 3));
      const frame = constructionSurfaceFrame(v[0], v[1], v[2]);
      target.indices.push(...ids.map((k) => k + base));
      target.regions!.push({
        indices: ids.map((k) => k + base),
        frame,
        boundary: surfaceBoundary(frame ? v.map((p) => projectConstructionSurface(frame, p)) : [])
      });
    }
  };
  const add = (owner: CoreOwner, binding: CoreBinding, mesh: Mesh, extra: Partial<ConstructionPreviewPart>) => {
    if (!mesh.indices.length) return;
    capture(owner.group.id, mesh);
    parts.push({
      owner: owner.group.id,
      material: binding.material,
      bindingId: binding.id,
      geometryId: binding.id,
      color: colorOf(owner.palette, binding.material),
      ...mesh,
      ...extra
    });
  };
  for (const owner of layout.owners)
    for (const binding of owner.bindings) {
      if (binding.family === "wall") {
        // Removed areas of each wall, along the perimeter.
        const holes = binding.parts.flatMap(({ part }) => {
          const chart = chartOf(part);
          if (!chart) return [];
          const offset = chart.uOffset ?? 0;
          return new EffectiveGeometry(part.original, part.modifications, layout.surfaces)
            .surface("face")
            .removed.map((r): Rect => [r[0] + offset, r[1], r[2] + offset, r[3]]);
        });
        const { mesh, perimeter, inset, finish } = wallSurface(binding, holes);
        const base = chartBase(binding);
        // Units that stand out of the finish face, such as corner stones, stay solid at a
        // distance.
        if (options.includeAppearance && finish) {
          const body = binding.parts.filter((p) => p.part.type !== "floorBand");
          const cells = masonryCells(binding, body).filter((cell) => standsOut(cell, finish));
          const joint = binding.parts.map((p) => chartOf(p.part)?.joint).find(Boolean);
          if (cells.length)
            retainedWallUnits.push({
              ownerId: owner.group.id,
              slot: owner.slot,
              material: binding.material,
              cells,
              ...(joint && { wallRoofJoint: joint })
            });
        }
        add(owner, binding, mesh, {
          supportInset: inset,
          ...(options.includeAppearance && {
            lodAppearance: constructionLodAppearance(
              mesh.uvs,
              binding.parts.flatMap(({ part, units }) =>
                units.map((u): ConstructionLodCell => {
                  const span = u.params!.wallU as number[];
                  return {
                    id: `${partId(part)}/${u.key}`,
                    anchor_uv: [(span[0] + span[1]) / 2, u.frame.origin[1] - base],
                    size: [span[1] - span[0], u.size![1]]
                  };
                })
              ),
              perimeter
            )
          })
        });
        // Floor bands are long solid bricks: the view draws them as boxes whose faces keep the
        // wall chart around each brick's anchor, textured with the bands' joints.
        const bands = emptyMesh(),
          bandCells: ConstructionLodCell[] = [];
        for (const { part, units } of binding.parts)
          if (part.type === "floorBand")
            for (const u of units) {
              const span = u.params!.wallU as number[];
              const anchor = [(span[0] + span[1]) / 2, u.frame.origin[1] - base];
              unitBox(bands, part, u, anchor);
              bandCells.push({
                id: `${partId(part)}/${u.key}`,
                anchor_uv: anchor,
                size: [span[1] - span[0], u.size![1]]
              });
            }
        add(owner, binding, bands, {
          backing: false,
          ...(options.includeAppearance &&
            bandCells.length && { lodAppearance: constructionLodAppearance(bands.uvs, bandCells, perimeter) })
        });
      } else if (binding.family === "parapet" || binding.family === "enclosure") {
        // Merlons, free-standing walls and fences are solid: the distance view draws their
        // units as boxes.
        const mesh = emptyMesh();
        for (const { part, units } of binding.parts) for (const u of units) unitBox(mesh, part, u);
        add(owner, binding, mesh, { placement: "unit", backing: false });
      } else if (binding.family === "roof") {
        // Each slope, cone or deck unrolls into one chart; slopes lie side by side.
        const surfaces = binding.parts.filter(({ part }) =>
          Object.values(part.original.elements).some((e) => e.kind === "surface")
        );
        let offset = 0;
        const mesh = emptyMesh(),
          cells: ConstructionLodCell[] = [];
        const deck = surfaces.some(({ part }) => part.type === "roofDeck");
        for (const { part, units } of surfaces) {
          const geometry = new EffectiveGeometry(part.original, part.modifications, layout.surfaces);
          const id = geometry.ids("surface")[0];
          const surface = geometry.surface(id);
          const element = part.original.elements[id];
          const deckParams =
            element.kind === "surface" && element.surface.kind === "roofDeck"
              ? (element.surface.params as RoofDeckParams)
              : undefined;
          // A deck keeps its own metric plane; slopes and cones unroll. Slopes are straight
          // across their rows, cones need segments around.
          const unrolled = deckParams
            ? deckSurface(deckParams, offset)
            : unrolledSurface(surface, offset, surface.domain.closedU ? 48 : 1, 19);
          const base = mesh.positions.length / 3;
          mesh.positions.push(...unrolled.mesh.positions);
          mesh.uvs.push(...unrolled.mesh.uvs);
          mesh.indices.push(...unrolled.mesh.indices.map((k) => k + base));
          if (options.includeAppearance)
            for (const u of units) {
              const uv = u.params?.uv as number[] | undefined;
              if (!uv || u.key.startsWith("eave/")) continue;
              cells.push({
                id: `${partId(part)}/${u.key}`,
                anchor_uv: unrolled.chart(uv[0], uv[1]),
                size: [u.size![0], u.size![1]]
              });
            }
          offset += unrolled.width + 1;
        }
        add(owner, binding, mesh, {
          ...(!deck && { backing: false }),
          ...(options.includeAppearance &&
            mesh.uvs.length && { lodAppearance: constructionLodAppearance(mesh.uvs, cells) })
        });
      } else if (binding.family === "plaster") {
        for (const { part, units } of binding.parts)
          for (const u of units) {
            const finish = plasterPart(layout, owner, binding, part, u);
            if (finish) parts.push(finish);
          }
      } else if (binding.family === "prefab") {
        // Prefab meshes are collected per group below.
      } else if (binding.family === "spire") {
        const mesh = options.assets?.roofSpire;
        if (!mesh) throw Error("Missing roof spire mesh in building library");
        for (const { units } of binding.parts)
          for (const u of units) {
            const spire = placeProfileRoofSpire(
              owner.group.id,
              {
                origin: [...u.frame.origin],
                radius: u.params!.radius as number,
                profile: u.params!.profile as number
              },
              mesh
            );
            const roof = owner.bindings.find((b) => b.family === "roof");
            const part: ConstructionPreviewPart = {
              owner: owner.group.id,
              material: "wall",
              decoration: true,
              roofSpire: true,
              bindingId: roof?.id,
              geometryId: roof?.id,
              positions: spire.positions,
              normals: spire.normals,
              colors: spire.colors,
              emission: spire.emission,
              indices: spire.indices,
              uvs: spire.uvs!,
              color: [1, 1, 1]
            };
            capture(owner.group.id, { positions: spire.positions, indices: spire.indices, uvs: [] });
            parts.push(part);
          }
      }
    }
  const decorations = options.assets ? coreBuildingDecorations(layout, options.assets) : [];
  const decorationParts = decorations.flatMap((d) => d.parts);
  const stones = decorations.flatMap((d) => d.stones);
  if (options.retainDecorationParts)
    for (const p of decorationParts) capture(p.ownerId, { positions: p.positions, indices: p.indices, uvs: [] });
  else
    for (const owner of layout.owners) {
      const own = decorationParts.filter((p) => p.ownerId === owner.group.id);
      if (!own.length) continue;
      const batch = decorationBatch(owner.group.id, own);
      capture(owner.group.id, batch);
      parts.push(batch);
    }
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of decorationParts)
    for (let i = 0; i < p.positions.length; i++) {
      const margin = i % 3 === 1 ? 0 : 0.03;
      bounds.min[i % 3] = Math.min(bounds.min[i % 3], p.positions[i] - margin);
      bounds.max[i % 3] = Math.max(bounds.max[i % 3], p.positions[i] + margin);
    }
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i++) {
      bounds.min[i % 3] = Math.min(bounds.min[i % 3], p.positions[i]);
      bounds.max[i % 3] = Math.max(bounds.max[i % 3], p.positions[i]);
    }
  for (const stone of stones) {
    const b = decorationStoneBounds(options.assets?.stoneGeometry, stone);
    for (let a = 0; a < 3; a++) {
      bounds.min[a] = Math.min(bounds.min[a], b.min[a]);
      bounds.max[a] = Math.max(bounds.max[a], b.max[a]);
    }
  }
  // Units stand out of their surfaces; include them in the bounds.
  for (const owner of layout.owners)
    for (const binding of owner.bindings)
      for (const { units } of binding.parts)
        for (const u of units) {
          const size = u.size ?? [0, 0, 0];
          for (let a = 0; a < 3; a++) {
            const extent =
              (Math.abs(size[0] * u.frame.x[a]) + Math.abs(size[1] * u.frame.y[a]) + Math.abs(size[2] * u.frame.z[a])) /
              2;
            bounds.min[a] = Math.min(bounds.min[a], u.frame.origin[a] - extent);
            bounds.max[a] = Math.max(bounds.max[a], u.frame.origin[a] + extent);
          }
        }
  return {
    parts,
    decorationParts: options.retainDecorationParts ? decorationParts : [],
    retainedWallUnits,
    // Arches, stone frames and timber arches are not core parts yet.
    archGroups: [] as ConstructionJunctionGroup[],
    bounds,
    stones,
    frames: [] as ConstructionDecorationFrame[],
    woodArchFrames: [] as ConstructionWoodArchPart[],
    woodArchPillars: [] as ConstructionWoodArchPillar[],
    ...(options.includeStructure && { structuralParts: [...structure.values()] })
  };
}
export type CoreBuildingView = ReturnType<typeof coreBuildingView>;

/** Meshes of every prefab unit, one record per group, in the shape the building renderer
 * consumes. A prefab's members come with their poses baked in; the unit matrix places them
 * all. Their edit coordinates run along the house perimeter and up its walls. */
export function coreBuildingDecorations(
  layout: CoreBuildingLayout,
  assets: BuildingUnitAssets
): CompiledConstructionDecorations[] {
  const result: CompiledConstructionDecorations[] = [];
  for (const owner of layout.owners) {
    const prefabs = owner.bindings.filter((b) => b.family === "prefab");
    if (!prefabs.length) continue;
    const walls = owner.bindings
      .filter((b) => b.family === "wall")
      .flatMap((b) => b.parts.flatMap((p) => (chartOf(p.part) ? [chartOf(p.part)!] : [])));
    const perimeter = walls.reduce((n, c) => n + wallChartSampler(c).length, 0);
    const minimumY = Math.min(...walls.map((c) => c.minGround)),
      height = Math.max(0.01, Math.max(...walls.map((c) => c.topY)) - minimumY);
    const compiled: CompiledConstructionDecorations = {
      holes: [],
      windowCuts: [],
      roofOpenings: [],
      roofUnits: [],
      parts: [],
      stones: [],
      frames: [],
      diagnostics: [],
      resolved: []
    };
    for (const binding of prefabs)
      for (const { part, units } of binding.parts)
        for (const u of units) {
          const key = (part.unit?.source as { prefab: string }).prefab;
          const prefab = assets.prefabs?.[key];
          if (!prefab) throw Error(`Building prefab "${key}" is not in the asset kit`);
          const params = u.params ?? {};
          // The author id of the part: the runtime binds picking and poses by it.
          const id = partId(part);
          const m = u.matrix;
          const axes = [
            [m[0], m[1], m[2]],
            [m[4], m[5], m[6]],
            [m[8], m[9], m[10]]
          ] as const;
          const centerX = (prefab.bounds.min[0] + prefab.bounds.max[0]) / 2,
            scaleX = Math.hypot(...axes[0]),
            mountU = (params.u as number | undefined) ?? 0;
          const spec = {
            id,
            ...(params.woodColor !== undefined && { woodColor: params.woodColor as number }),
            ...(params.lightColor !== undefined && { lightColor: params.lightColor as number }),
            ...(params.lightIntensity !== undefined && { lightIntensity: params.lightIntensity as number })
          };
          const parts = prefab.members.map(([name, suffix, material, emissionOrigin]) => ({
            name,
            suffix,
            material,
            mesh: decorationMesh(assets.decorations, name),
            emissionOrigin,
            binding: { role: "body" as const }
          }));
          compiled.parts.push(
            ...decorationAssemblyGeometry(
              { id: owner.group.id, woodColor: owner.palette.woodColor },
              spec,
              { bounds: prefab.bounds, parts },
              params.kind === "lantern" ? "wall-lamp" : (params.kind as string),
              {
                origin: [m[12], m[13], m[14]],
                axes,
                editUV: (local, world) => [
                  mountU + ((local[0] - centerX) * scaleX) / perimeter,
                  (world[1] - minimumY) / height
                ]
              }
            )
          );
          // Unit members: rigid ones take the prefab's pose; the others bend along the wall
          // line their part samples under them.
          let follow = 0;
          for (const member of prefab.units) {
            const local = member.matrix;
            const pose = [0, 1, 2, 3].map((c) =>
              [0, 1, 2].map(
                (r) =>
                  m[r] * local[c * 4] +
                  m[4 + r] * local[c * 4 + 1] +
                  m[8 + r] * local[c * 4 + 2] +
                  (c === 3 ? m[12 + r] : 0)
              )
            );
            const scale = pose.slice(0, 3).map((axis) => Math.hypot(...axis)) as [number, number, number];
            const mesh = assets.stoneGeometry?.[member.unit];
            if (!mesh) throw Error(`Missing stone unit ${member.unit}`);
            const reach = ((mesh.bounds.max[0] - mesh.bounds.min[0]) * scale[0]) / 2;
            let instance: DecorationStoneInstance;
            const base = {
              seed: part.seed >>> 0,
              wallSlot: owner.slot,
              wallRange: [mountU * perimeter - reach, mountU * perimeter + reach] as [number, number],
              clipY: -100000
            };
            if (!member.span) {
              const axes = pose.slice(0, 3).map((axis, k) => axis.map((v) => v / scale[k]));
              const bone = {
                position: pose[3] as [number, number, number],
                normalXZ: [axes[2][0], axes[2][2]] as [number, number]
              };
              instance = { ...base, xform: [...axes.flat(), ...pose[3]], flags: 4, bones: [bone, bone, bone] };
            } else {
              const line = part.original.elements[`follow${follow++}`];
              if (line?.kind !== "curve") throw Error(`${part.key} has no wall line for ${member.path}`);
              const bones: DecorationStoneInstance["bones"] = [
                wallBone(line.curve.points, 0),
                wallBone(line.curve.points, 0.5),
                wallBone(line.curve.points, 1)
              ];
              const [left, right] = [bones[0].position, bones[2].position];
              const chord = Math.hypot(right[0] - left[0], right[2] - left[2]);
              const tx = (right[0] - left[0]) / chord,
                tz = (right[2] - left[2]) / chord;
              instance = {
                ...base,
                xform: [tx, 0, tz, 0, 1, 0, -tz, 0, tx, (left[0] + right[0]) / 2, left[1], (left[2] + right[2]) / 2],
                flags: 0,
                bones
              };
            }
            compiled.stones.push({
              id: `${owner.group.id}/${id}/${member.path}`,
              decorationId: id,
              ownerId: owner.group.id,
              template: member.unit,
              instance,
              geometryScale: scale
            });
          }
          const [type, rank] = key.split("/");
          compiled.resolved.push({ id, type, host: "wall", rank: Number(rank) });
        }
    result.push(compiled);
  }
  return result;
}
/** A bone of a member that bends along a wall line: the point at fraction `t` of the line's
 * length and the wall's outward normal there. */
function wallBone(points: readonly (readonly number[])[], t: number): DecorationStoneInstance["bones"][0] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]));
  const at = t * lengths[lengths.length - 1];
  let i = 1;
  while (i < points.length - 1 && lengths[i] < at) i++;
  const a = points[i - 1],
    b = points[i],
    l = lengths[i] - lengths[i - 1] || 1,
    k = (at - lengths[i - 1]) / l;
  const tx = (b[0] - a[0]) / l,
    tz = (b[2] - a[2]) / l;
  return {
    position: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
    normalXZ: [-tz, tx]
  };
}
/** All prefab meshes of a group as one distance part, keeping each vertex's colours, tint
 * role, normals and emission. */
function decorationBatch(owner: string, parts: readonly ConstructionDecorationPart[]): ConstructionPreviewPart {
  const batch: ConstructionPreviewPart = {
    owner,
    material: "wall",
    positions: [],
    indices: [],
    uvs: [],
    decoration: true,
    appearance: { materialUVs: [], kinds: [], colorIds: [], centers: [] },
    colors: [],
    neutralColors: [],
    tintRoles: [],
    normals: [],
    emission: [],
    color: [1, 1, 1],
    emissive: 0
  };
  for (const p of parts) {
    const count = p.positions.length / 3,
      offset = batch.positions.length / 3;
    batch.positions.push(...p.positions);
    batch.indices.push(...p.indices.map((i) => i + offset));
    batch.uvs.push(...(p.uvs ?? Array.from({ length: count }, () => [0, 0])));
    batch.appearance!.materialUVs.push(...(p.appearance?.materialUVs ?? Array.from({ length: count }, () => [0, 0])));
    batch.appearance!.kinds.push(...(p.appearance?.kinds ?? Array(count).fill(0)));
    batch.appearance!.colorIds.push(...(p.appearance?.colorIds ?? Array(count).fill(0)));
    batch.appearance!.centers.push(...(p.appearance?.centers ?? Array(p.positions.length).fill(0)));
    batch.colors!.push(...p.colors);
    batch.neutralColors!.push(...(p.tintRole ? whiteMasonryVertexColors(p.colors, p.tintMask) : p.colors));
    batch.tintRoles!.push(
      ...Array.from({ length: count }, (_, i) =>
        p.tintRole && p.tintMask?.[i] !== false ? masonryTintRoles.indexOf(p.tintRole) : -1
      )
    );
    batch.normals!.push(...p.normals);
    batch.emission!.push(...p.emission);
  }
  return batch;
}

/** Palette slots and color owners: one per group, in group order. */
export function coreBuildingPalette(layout: CoreBuildingLayout) {
  const colorOwners = layout.owners.map((o) => ({ id: o.group.id, ...o.palette }));
  return { colorOwners, paletteSlots: layout.owners.map((o) => ({ ...o.palette })) };
}

/** A focus pose for every author part: the center of its laid units. */
export function coreBuildingFocus(layout: CoreBuildingLayout) {
  const poses: { part: string; position: number[] }[] = [];
  for (const owner of layout.owners)
    for (const binding of owner.bindings)
      for (const { part, units } of binding.parts) {
        if (part.identity.kind !== "author" || !units.length) continue;
        const min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity];
        for (const u of units)
          for (let a = 0; a < 3; a++) {
            min[a] = Math.min(min[a], u.frame.origin[a]);
            max[a] = Math.max(max[a], u.frame.origin[a]);
          }
        poses.push({ part: part.identity.id, position: min.map((v, a) => (v + max[a]) / 2) });
      }
  return poses;
}

/** Ground contact and bounds of the walls, from the same terrain the design used. */
export function coreBuildingGrounding(
  layout: CoreBuildingLayout,
  view: CoreBuildingView,
  ground: { grounding: ConstructionGrounding; height(x: number, z: number): number }
): ConstructionGrounding {
  const grounding: ConstructionGrounding = { ...ground.grounding };
  const owners = layout.owners.flatMap((o) => {
    const charts = o.bindings
      .filter((b) => b.family === "wall")
      .flatMap((b) => b.parts.flatMap((p) => (chartOf(p.part) ? [chartOf(p.part)!] : [])));
    return charts.length ? [{ id: o.group.id, charts }] : [];
  });
  if (!owners.length) return grounding;
  const points = owners.flatMap((o) => o.charts.flatMap((c) => c.points));
  grounding.supports = owners.map((o) => ({
    id: o.id,
    minGround: Math.min(...o.charts.map((c) => c.minGround)),
    maxGround: Math.max(...o.charts.flatMap((c) => c.points.map((p) => p[1]))),
    topY: Math.max(...o.charts.map((c) => c.topY)),
    layoutOriginY: 0
  }));
  grounding.minWorldHeight = Math.min(...points.map((p) => p[1]));
  grounding.maxWorldHeight = Math.max(...points.map((p) => p[1]));
  const min = view.bounds.min.map((v) => v - 0.5) as [number, number, number],
    max = view.bounds.max.map((v) => v + 0.5) as [number, number, number];
  grounding.localBounds = { min, max };
  let sampleError = 0,
    aboveTerrain = 0,
    belowTerrain = 0,
    checks = 0;
  for (const o of owners)
    for (const chart of o.charts)
      for (let i = 1; i < chart.points.length; i++) {
        const a = chart.points[i - 1],
          b = chart.points[i];
        sampleError = Math.max(sampleError, Math.abs(a[1] - ground.height(a[0], a[2])));
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.125));
        for (let j = 0; j <= n; j++) {
          const t = j / n,
            error = a[1] + (b[1] - a[1]) * t - ground.height(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t);
          aboveTerrain = Math.max(aboveTerrain, error);
          belowTerrain = Math.max(belowTerrain, -error);
          checks++;
        }
      }
  grounding.contacts = { sampleError, aboveTerrain, belowTerrain, checks };
  return grounding;
}

/** Resident detail of a laid design: draw groups, backing, palette and the placement
 * document that edits address. */
export async function coreBuildingRenderInput(
  layout: CoreBuildingLayout,
  view: CoreBuildingView = coreBuildingView(layout),
  assets?: BuildingUnitAssets
): Promise<BuildingRenderInput> {
  const groups: BuildingUnitDrawGroup[] = [];
  const plans: { binding_id: string; cells: SupportCell[]; dependencies: unknown[] }[] = [];
  const geometries: unknown[] = [],
    bindings: unknown[] = [];
  for (const owner of layout.owners)
    for (const binding of owner.bindings) {
      // Prefabs and finishes are drawn from the view, not as unit groups.
      if (binding.family === "spire" || binding.family === "plaster" || binding.family === "prefab") continue;
      const { draws, dependencies } = bindingDraws(binding, owner.slot);
      for (const draw of draws)
        groups.push({
          id: groups.length,
          binding_id: binding.id,
          ownerId: owner.group.id,
          role: draw.role,
          cells: draw.cells,
          units: await packConstructionUnits({
            cells: draw.cells,
            slot: owner.slot,
            role: draw.role,
            ...(draw.design && { roofDesign: { schema: "roof-design-v1", records: draw.design.records } })
          }),
          ...(draw.gravity && { gravity: draw.gravity }),
          ...(draw.wallRoofJoint && { wallRoofJoint: draw.wallRoofJoint })
        });
      plans.push({ binding_id: binding.id, cells: draws.flatMap((d) => d.cells), dependencies });
      geometries.push({ id: binding.id, source: { type: "core", parts: binding.parts.map((p) => p.part.key) } });
      const algorithm = binding.parts[0].part.algorithm;
      bindings.push({
        id: binding.id,
        geometry_id: binding.id,
        unit_id: binding.material,
        rule: { type: algorithm.type },
        footprint: binding.parts[0].part.unit?.scale ?? [1, 1, 1],
        seed: owner.group.seed
      });
    }
  const palette = coreBuildingPalette(layout);
  return {
    paletteSlots: palette.paletteSlots,
    rawDraws: [],
    groups,
    decorations: assets ? coreBuildingDecorations(layout, assets) : [],
    dormerBins: encodeCompleteConstructionDormerBins([]),
    colorOwners: palette.colorOwners.map(({ id, seed }) => ({ id, seed })),
    backingParts: view.parts.filter(
      (p) => p.placement !== "unit" && p.backing !== false && !p.decoration && !p.plaster
    ),
    surfaceParts: view.parts,
    placementDocument: { version: 2, geometries, bindings, overrides: [] },
    plans
  };
}

export interface CoreBuildingEntryOptions extends CoreBuildingOptions {
  readonly assets?: BuildingUnitAssets;
}
/** What the distance view and queries need, before any resident detail: the view with
 * distance appearance and structure, the palette and the focus poses. */
export function prepareCoreBuilding(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  options: CoreBuildingEntryOptions = {}
) {
  const layout = coreBuildingLayout(result, registry, options);
  const preview = coreBuildingView(layout, { assets: options.assets, includeAppearance: true, includeStructure: true });
  return { layout, preview, appearance: coreBuildingPalette(layout), focus: coreBuildingFocus(layout) };
}
/** Resident detail of a design. */
export async function compileCoreBuilding(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  options: CoreBuildingEntryOptions = {}
) {
  const layout = coreBuildingLayout(result, registry, options);
  return {
    layout,
    renderInput: await coreBuildingRenderInput(
      layout,
      coreBuildingView(layout, { assets: options.assets }),
      options.assets
    )
  };
}
