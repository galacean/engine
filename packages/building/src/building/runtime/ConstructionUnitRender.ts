import { packUnits } from "./UnitPacking.js";
import type { ConstructionDrawInput } from "./ConstructionPackage";
import type { MaterialUnit } from "./UnitPlacementStyle";
import type { SupportCell } from "./PlacementSupport";

export type ConstructionUnitRole =
  | "wall"
  | "floor-band"
  | "foundation"
  | "enclosure"
  | "platform"
  | "platform-rim"
  | "layout"
  | "connections"
  | "dormer_roof"
  | "wall_junction"
  | "roof_junction"
  | "wall_arch";
export type ConstructionUnitDraw = {
  template: ConstructionDrawInput["template"];
  instances: Uint8Array;
  bindings?: ConstructionDrawInput["bindings"];
};

/** Material is independent of placement role: a tile on a wall is not a main
 * roof tile. Both resident and retained units cross this same ABI boundary. */
export async function packConstructionUnits(input: {
  cells: SupportCell[];
  slot: number;
  role: ConstructionUnitRole;
  roofApertures?: boolean;
  roofDesign?: unknown;
  roofRawRecords?: Map<string, Uint8Array>;
  materials?: readonly MaterialUnit[];
  source?: Partial<Record<MaterialUnit, Uint8Array>>;
}) {
  const units = await packUnits({
    cells: input.cells,
    slot: input.slot,
    roof_design: input.roofDesign,
    roof_raw_records: input.roofRawRecords,
    materials: input.materials
  });
  for (const material of ["brick", "wooden_plank", "roof_tile"] as const) {
    const source = input.source?.[material];
    if (source) units[material] = source;
  }
  if (
    input.role !== "layout" &&
    input.role !== "connections" &&
    units.roof_tile.byteLength >= input.cells.length * 64
  ) {
    // Own the normalized buffer; never mutate borrowed native source records.
    if (input.source?.roof_tile) units.roof_tile = units.roof_tile.slice();
    const view = new DataView(units.roof_tile.buffer, units.roof_tile.byteOffset, units.roof_tile.byteLength);
    for (let i = 0; i < input.cells.length; i++) view.setInt32(i * 64 + 60, input.roofApertures ? 1 : 0, true);
  }
  return units;
}

/** Non-roof surfaces have no roof-aperture domain. The roof shader still declares
 * those resources even when main-body=0 bypasses the lookup. Bind an explicit
 * empty domain here, rather than depending on unrelated roof data in a caller. */
export function constructionSurfaceUnitDraw(
  material: MaterialUnit,
  instances: Uint8Array,
  options: {
    sourceDraw?: Omit<ConstructionUnitDraw, "instances"> & { instances?: Uint8Array };
  } = {}
): ConstructionUnitDraw {
  if (options.sourceDraw) {
    return options.sourceDraw.instances
      ? (options.sourceDraw as ConstructionUnitDraw)
      : { ...options.sourceDraw, instances };
  }
  return {
    template: material === "wooden_plank" ? "wood" : material === "roof_tile" ? "roof" : "brick",
    instances,
    ...(material === "roof_tile" ? { bindings: { roofCounts: new Uint8Array(4), roofHoles: new Uint8Array(48) } } : {})
  };
}
