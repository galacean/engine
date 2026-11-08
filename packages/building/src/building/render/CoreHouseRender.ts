// COMPAT(online-parity): houses render through the online pipeline for everything except
// the wall bricks, which come from the core's masonryCourses, and the tiles and caps of
// rectangular pitched roofs, which come from the core's roof slopes. Round and flat roofs,
// previews, backing, palette and decorations are still the online ones until their part
// types migrate.
// See ../MIGRATION.md.
import { expandUnits, type BuildingDesignResult, type BuildingRegistry, type LaidUnit } from "../core";
import type { RoofSlopeParams } from "../partTypes/Roof";
import type { BuildingRenderInput } from "../runtime/BuildingRenderPackage";
import type { BuildingUnitAssets } from "../runtime/BuildingUnitAssets";
import type { TerrainHeight } from "../runtime/PublishedWallProfile";
import type { SupportCell } from "../runtime/PlacementSupport";
import { packConstructionUnits } from "../runtime/ConstructionUnitRender";
import { f32BitsToHalf } from "../runtime/UnitPacking.js";
import { European } from "../parts/architecture/European";
import { designBuilding } from "../parts/architecture/BuildingDesign";
import { implementBuilding } from "../parts/architecture/BuildingImplementation";
import type { CoreHouseParameters } from "../application/CoreEuropean";

/** Wall bricks and corner stones of a core house as the renderer's support cells. */
export function coreWallCells(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  houseId: string,
  terrain: TerrainHeight
): SupportCell[] {
  const geometryId = houseId + "-wall";
  const parts = result.parts.filter((p) => p.group === houseId && (p.type === "wall" || p.type === "cornerStone"));
  if (!parts.some((p) => p.type === "wall")) throw Error("No wall in house " + houseId);
  return parts.flatMap((part, n) =>
    expandUnits(part, registry, { environment: { ground: terrain } }).map((u) => {
      const deformation = u.params?.deformation as number[] | undefined;
      const id = `${geometryId}/${part.type}-${n}/${u.key}`;
      return {
        id,
        logical_id: id,
        surface_id: geometryId,
        anchor_uv: u.params!.anchor_uv as number[],
        center: [...u.frame.origin],
        tangent: [...u.frame.x],
        bitangent: [...u.frame.y],
        normal: [...u.frame.z],
        size: [...u.size!],
        ...(deformation && { brick_deformation: [...deformation] }),
        ...(u.params?.flags !== undefined && { brick_flags: u.params.flags as number }),
        // COMPAT(online-parity): the online brick shader treats seeds below 10 as accent stones.
        brick_seed: u.params?.accent ? u.seed % 10 : 10 + ((u.seed & 0x7fffffff) % 0x7ffffff0)
      } as SupportCell;
    })
  );
}

/** The wall-space span of every cell, in the same order as `coreWallCells`. */
function wallSpans(result: BuildingDesignResult, registry: BuildingRegistry, houseId: string, terrain: TerrainHeight) {
  return result.parts
    .filter((p) => p.group === houseId && (p.type === "wall" || p.type === "cornerStone"))
    .flatMap((part) =>
      expandUnits(part, registry, { environment: { ground: terrain } }).map(
        (u) => u.params?.wallU as number[] | undefined
      )
    );
}

/** Column-major rotation of a frame as a quaternion [x, y, z, w]. */
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
/** The rotation the roof packer reads back from a quaternion, with the same arithmetic. */
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
interface RoofBatch {
  cells: SupportCell[];
  records: { cell_id: string; initial64_hex: string; quaternion_f32: number[]; world_height_origin: number }[];
}
/** One laid roof unit as a cell and its 64-byte roof record. Heights in the record are
 * relative to the roof base, as the roof gravity pass expects. */
function roofEntry(batch: RoofBatch, id: string, surface: string, u: LaidUnit, base: number, slot: number) {
  const q = frameQuaternion(u);
  const size = u.size!.map(Math.fround);
  const position = [u.frame.origin[0], u.frame.origin[1] - base, u.frame.origin[2]].map(Math.fround);
  const plane = (u.params?.clip as number[] | undefined) ?? [0, 1, 0, 65504];
  // The plane moves with the record's heights.
  const clip = [plane[0], plane[1], plane[2], Math.min(65504, plane[3] + plane[1] * base)];
  const bytes = new Uint8Array(64),
    view = new DataView(bytes.buffer);
  position.forEach((v, i) => view.setFloat32(i * 4, v, true));
  [...clip, ...size, (u.params?.shade as number | undefined) ?? 0, ...q].forEach((v, i) =>
    view.setUint16(16 + i * 2, toHalf(v), true)
  );
  view.setUint32(40, slot, true);
  // COMPAT(online-parity): the online roof record has no seed lane; the unit seed goes into
  // the ordinal lane, which the roof shader uses for variation.
  view.setUint32(52, u.seed >>> 0, true);
  view.setUint32(60, (u.params?.flag as number | undefined) ?? 1, true);
  const [tangent, bitangent, normal] = quaternionBasis(q);
  batch.cells.push({
    id,
    logical_id: id,
    surface_id: surface,
    // COMPAT(online-parity): online roof cells carry a projection onto the roof chart; the
    // core roof has none yet, and the distance appearance still uses the online roof.
    anchor_uv: [0, 0],
    center: [position[0], position[1] + base, position[2]],
    tangent,
    bitangent,
    normal,
    size
  } as SupportCell);
  batch.records.push({
    cell_id: id,
    initial64_hex: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    quaternion_f32: q,
    world_height_origin: base
  });
}
/** Tiles of the core roof slopes, and their caps and eave closures, as the online roof
 * groups take them: ordinary tiles in the layout group, everything else in the connection
 * group. Undefined when the house has no roof slopes. */
export function coreRoofBatches(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  houseId: string,
  terrain: TerrainHeight,
  slot: number
) {
  const parts = result.parts.filter((p) => p.group === houseId);
  const slopes = parts.filter((p) => p.type === "roof" && p.original.elements.slope);
  if (!slopes.length) return;
  const base = (slopes[0].original.elements.slope as { surface: { params: RoofSlopeParams } }).surface.params.base;
  const surface = houseId + "-roof";
  const layout: RoofBatch = { cells: [], records: [] },
    connections: RoofBatch = { cells: [], records: [] };
  const pairs: { parent_cell_id: string; child_cell_id: string }[] = [];
  parts
    .filter((p) => ["roof", "hipCap", "ridgeCap", "rakeCap"].includes(p.type))
    .forEach((part, n) => {
      if (part.type === "roof" && !part.original.elements.slope) return;
      const prefix = `${surface}/${part.type}-${n}/`;
      for (const u of expandUnits(part, registry, { environment: { ground: terrain } })) {
        const closure = u.key.startsWith("eave/");
        const tile = part.type === "roof" && !closure;
        roofEntry(tile ? layout : connections, prefix + u.key, surface, u, base, slot);
        if (closure) pairs.push({ parent_cell_id: prefix + "0/" + u.key.slice(5), child_cell_id: prefix + u.key });
      }
    });
  return { layout, connections, pairs };
}

export async function coreHouseRenderInput(
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  house: CoreHouseParameters,
  terrain: TerrainHeight,
  assets: BuildingUnitAssets
): Promise<BuildingRenderInput> {
  if (result.diagnostics.length) throw Error(result.diagnostics.map((d) => d.source + ": " + d.message).join("\n"));
  // The online entry point takes the same parameters, without the core-only choices.
  const online: Record<string, unknown> = { ...house };
  delete online.walls;
  delete online.footprint;
  const draft = European.buildHouses(online as never);
  const input = (await implementBuilding(designBuilding(draft, terrain, assets))).renderInput;
  const binding = house.id + "-wall/placement";
  const group = input.groups.find((g) => g.role === "wall" && g.binding_id === binding);
  if (!group) throw Error("The online house has no wall group " + binding);
  const cells = coreWallCells(result, registry, house.id, terrain);
  group.cells = cells;
  group.units = await packConstructionUnits({ cells, slot: 0, role: "wall", source: {} });
  // COMPAT(online-parity): the cell format has no field for the wall-space span, so write it
  // into the packed brick records directly (lanes 21 and 22, half floats at bytes 46 and 48).
  const view = new DataView(group.units.brick.buffer, group.units.brick.byteOffset, group.units.brick.byteLength);
  const half = (v: number) => {
    const f = new DataView(new ArrayBuffer(4));
    f.setFloat32(0, v, true);
    return f32BitsToHalf(f.getUint32(0, true));
  };
  wallSpans(result, registry, house.id, terrain).forEach((span, i) => {
    if (!span) return;
    view.setUint16(i * 64 + 46, half(span[0]), true);
    view.setUint16(i * 64 + 48, half(span[1]), true);
  });
  for (const plan of input.plans) if (plan.binding_id === binding) plan.cells = cells;
  await replaceRoof(input, result, registry, house.id, terrain);
  return input;
}

/** Put the core roof tiles and caps into the online roof groups and their plan. */
async function replaceRoof(
  input: BuildingRenderInput,
  result: BuildingDesignResult,
  registry: BuildingRegistry,
  houseId: string,
  terrain: TerrainHeight
) {
  const binding = houseId + "-roof/placement";
  const group = (role: string) => input.groups.find((g) => g.role === role && g.binding_id === binding);
  const layout = group("layout"),
    connections = group("connections");
  if (!layout || !connections) return;
  // COMPAT(online-parity): the palette slot comes from the online roof records.
  const units = layout.units.roof_tile;
  const slot = new DataView(units.buffer, units.byteOffset, units.byteLength).getUint32(40, true);
  const batches = coreRoofBatches(result, registry, houseId, terrain, slot);
  if (!batches) return;
  for (const [target, batch, role] of [
    [layout, batches.layout, "layout"],
    [connections, batches.connections, "connections"]
  ] as const) {
    target.cells = batch.cells;
    target.units = await packConstructionUnits({
      cells: batch.cells,
      slot,
      role,
      roofDesign: { schema: "roof-design-v1", records: batch.records }
    });
    const gravity = (target as { gravity?: { instance_count: number }[] }).gravity;
    if (gravity) for (const step of gravity) step.instance_count = batch.cells.length;
  }
  const plan = input.plans.find((p) => p.binding_id === binding);
  if (plan) {
    plan.cells = [...batches.layout.cells, ...batches.connections.cells];
    plan.dependencies = batches.pairs;
  }
}
