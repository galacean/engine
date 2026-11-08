// COMPAT(online-parity): houses render through the online pipeline for everything except
// the wall bricks, which come from the core's masonryCourses. The roof, previews, backing,
// palette and decorations are still the online ones until their part types migrate.
// See ../MIGRATION.md.
import { expandUnits, type BuildingDesignResult, type BuildingRegistry } from "../core";
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
  return input;
}
