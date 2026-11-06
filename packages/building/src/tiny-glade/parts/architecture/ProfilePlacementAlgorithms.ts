import type { BuildingRenderInput } from "../../runtime/BuildingRenderPackage";
import { buildingPlacementAlgorithms, type BuildingSupport } from "../BuildingAlgorithms";
import { arrangementRules } from "../../runtime/UnitPlacementStyle";
import { profileWindowCutWall, wallWindowCutBuffer } from "../../runtime/ConstructionWallWindowCuts";
import { constructionHorizontalWoodWall } from "../../runtime/ConstructionWoodWall";
import { usesStonePaving } from "../../runtime/StonePavingPlacement";
import { buildConstructionFloors } from "../../runtime/ConstructionFloors";
import { settledRoofCells, settledRoofBytes, settledRoofGroups } from "../../runtime/ConstructionSettledRoof";
import { buildRoofMaterialContext } from "../../runtime/RecoveredRoofContext";
import { isFlatRoofHeight } from "../../runtime/RoofMode";
import { placeStripUnits } from "../../runtime/StripPlacement";
import { normalizeProfileFootprint, normalizeProfileHeight } from "../../runtime/ProfileParameters";
import { concatenateRecords } from "../../runtime/ConstructionRecords";
import { resolvedArrangement, type UnitPlacementBinding } from "../../runtime/UnitPlacement";
import { buildConstructionRoof, roofGravityTimeline } from "../../runtime/ConstructionRoof";
import {
  nativeWallCells,
  arrangedWallCells,
  arrangedSurfaceCells,
  wallSurfaceGeometry
} from "../../runtime/ConstructionArrangement";
import { buildConstructionFlatRoof } from "../../runtime/ConstructionFlatRoof";
import { buildConstructionFoundation } from "../../runtime/ConstructionFoundation";
import type { ConstructionUnitRole } from "../../runtime/ConstructionUnitRender";
import type { ConstructionPreviewRoofContexts } from "../../runtime/ProfilePreview";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";
import { compileWallInFrame } from "../../runtime/ConstructionWallFrame";
import type { resolveBuildingProfileSupports } from "./BuildingProfileSupports";
import type { CompiledConstructionDecorations } from "../../runtime/ConstructionDecorations";
import type { WallConnectionWipHole } from "../../runtime/WallConnectionTypes";
import type { BuildingBasePart } from "./BuildingDraft";

export type ProfileSupport = ReturnType<typeof resolveBuildingProfileSupports>[number];
export interface ProfilePlacementInput {
  part: BuildingBasePart;
  support: ProfileSupport;
  reservations: WallConnectionWipHole[];
  decoration?: CompiledConstructionDecorations;
  contactHoles?: WallConnectionWipHole[];
  neighbors: readonly ProfileSupport[];
  terrain: TerrainHeight;
  assets: BuildingUnitAssets;
}
export interface ProfilePlacementOutput {
  rawDraws: BuildingRenderInput["rawDraws"];
  walls: (ProfileSupport & ReturnType<typeof compileWallInFrame>)[];
  draws: (
    | { raw: any }
    | { binding: UnitPlacementBinding; cells: any[]; role: ConstructionUnitRole; slot: number; extra: any }
  )[];
  plans: any[];
  geometries: any[];
  roofs: any[];
  supports: any[];
  previewRoofs: Map<string, ConstructionPreviewRoofContexts>;
  backedGeometry: Set<string>;
  flatOwners: Set<string>;
  windowCutLayoutMs: number;
}
function collector() {
  const output: ProfilePlacementOutput = {
    rawDraws: [],
    walls: [],
    draws: [],
    plans: [],
    geometries: [],
    roofs: [],
    supports: [],
    previewRoofs: new Map(),
    backedGeometry: new Set(),
    flatOwners: new Set(),
    windowCutLayoutMs: 0
  };
  const add = (
    binding: UnitPlacementBinding,
    cells: any[],
    role: ConstructionUnitRole,
    slot: number,
    extra: any = {}
  ) => {
    output.draws.push({ binding, cells, role, slot, extra });
  };
  return { output, add, ...output };
}
function wallGeometry(support: ProfileSupport) {
  if (!support.roof) throw Error("Missing resolved wall/roof constraint in " + support.id);
  return { ...support, roof: support.roof };
}
/** Each entry places one support. Packing/render publication is owned by the caller.
 * No entry traverses a house or discovers child parts. */
export async function placeStripSupport(input: ProfilePlacementInput): Promise<ProfilePlacementOutput> {
  const { part, support: o, terrain } = input;
  const { output, add, plans, geometries } = collector();
  const binding = o.wallBinding;
  const footprint = normalizeProfileFootprint({ rectangle: part.support.params.rectangle });
  const cells = placeStripUnits(
    {
      id: part.group,
      variationKey: o.variationKey,
      rectangle: footprint.rectangle!,
      height: normalizeProfileHeight(part.support.params.height),
      algorithm: resolvedArrangement(binding),
      footprint: binding.footprint
    },
    terrain
  );
  add(binding, cells, "enclosure", o.slot);
  plans.push({ binding_id: binding.id, cells, dependencies: [] });
  geometries.push({ id: binding.geometry_id, type: "strip", source: { type: "enclosure", building_id: o.id } });

  return output;
}

export async function placeWallSupport(input: ProfilePlacementInput): Promise<ProfilePlacementOutput> {
  const { part, support: o, assets, decoration } = input;
  const { output, add, draws, plans, geometries, backedGeometry } = collector();
  let windowCutLayoutMs = 0;
  const wall = o.wallBinding;
  const compiled = compileWallInFrame(
    o.id,
    o.wallSeed,
    o.slot,
    o.shape,
    o.profile,
    o.height,
    input.reservations,
    true,
    o.unitScale,
    o.variationKey
  );
  output.walls.push({ ...o, ...compiled });
  if (!o.wallPlacement) {
    output.rawDraws.push({
      id: "wall-" + o.nativeId,
      ownerId: o.id,
      template: "brick",
      wallRoofJoint: o.wallRoofJoint,
      instances: concatenateRecords(compiled.masonry.instances.map((i) => i.packed64))
    });
    return output;
  }
  backedGeometry.add(wall.geometry_id);
  const native = resolvedArrangement(wall) === "staggered_rows";
  const nativeWood = resolvedArrangement(wall) === "horizontal_rows" && o.shape.type === "rectangle";
  const cutIntents = decoration?.windowCuts ?? [];
  const cells = native
    ? nativeWallCells(wall.geometry_id, compiled.masonry.instances, o.profile)
    : arrangedWallCells(wall, o.profile, compiled.worldHoles, o.wallEnvelope.nominalOuter, o.wallRoofJoint);
  add(wall, cells, "wall", o.slot, {
    ...(native ? { brick: concatenateRecords(compiled.masonry.instances.map((i) => i.packed64)) } : {}),
    ...(cutIntents.length || nativeWood ? { materialUnits: ["brick", "roof_tile"] } : {})
  });
  let woodCells: any[] = [];
  if (nativeWood) {
    const cutStarted = performance.now();
    const publication = constructionHorizontalWoodWall(
      assets.windowCuts,
      wallGeometry(o),
      wall,
      compiled.worldHoles,
      cutIntents,
      decoration?.archOpenings
    );
    woodCells = publication.cells;
    for (const group of publication.groups) {
      draws.push({ raw: { ...group, binding_id: wall.id, role: "wall", ownerId: o.id } });
    }
    windowCutLayoutMs += performance.now() - cutStarted;
  } else if (cutIntents.length) {
    const cutStarted = performance.now();
    woodCells = profileWindowCutWall(wallGeometry(o), wall, compiled.worldHoles, cutIntents, true);
    const windowCuts = wallWindowCutBuffer(assets.windowCuts, woodCells, cutIntents, o.profile.control.length);
    add(wall, woodCells, "wall", o.slot, { materialUnits: ["wooden_plank"], windowCuts });
    windowCutLayoutMs += performance.now() - cutStarted;
  }
  const bands = buildConstructionFloors({
    id: wall.geometry_id,
    binding: wall,
    shape: o.shape,
    profile: o.profile,
    baseY: o.profile.minGround,
    wallHeight: o.height,
    settings: o.floors ?? { enabled: false, interval: 3.5 },
    holes: compiled.worldHoles
  });
  if (bands.cells.length) add(wall, bands.cells, "floor-band", o.slot);
  plans.push({ binding_id: wall.id, cells: [...cells, ...woodCells, ...bands.cells], dependencies: [] });
  geometries.push({
    ...wallSurfaceGeometry(wall.geometry_id, o.profile, o.wallRoofJoint),
    source: { type: "building_wall", building_id: o.id }
  });

  output.windowCutLayoutMs = windowCutLayoutMs;
  return output;
}

export async function placeFoundationSupport(input: ProfilePlacementInput): Promise<ProfilePlacementOutput> {
  const { part, support: o, terrain, neighbors } = input;
  const { output, add, plans, geometries, supports, backedGeometry } = collector();
  if (!o.foundationPlacement) {
    backedGeometry.add(part.id);
    return output;
  }
  const binding = o.foundationBinding;
  if (!binding || !o.foundationParameters) throw Error("Missing resolved foundation for " + part.id);
  backedGeometry.add(binding.geometry_id);
  const rule = resolvedArrangement(binding),
    foundation = buildConstructionFoundation({
      id: binding.geometry_id,
      variationKey: binding.variationKey,
      shape: o.shape,
      wallEnvelope: o.wallEnvelope,
      height: o.foundationParameters.height,
      mode: o.foundationParameters.mode,
      seed: binding.seed === "source" ? Number(o.seed) : binding.seed,
      contact: o.profile.foundationContact,
      neighbors: neighbors
        .filter((n) => n !== o && n.part.support.generator === "wallProfile")
        .map((n) => ({
          shape: n.shape,
          bottomY: n.profile.minGround,
          topY: n.profile.maxY
        })),
      terrain,
      material: binding.unit_id,
      footprint: binding.footprint,
      rule: rule as Exclude<typeof rule, "posts_and_rails">
    });
  add(binding, foundation.cells, "foundation", o.slot);
  plans.push({ binding_id: binding.id, cells: foundation.cells, dependencies: [] });
  geometries.push({ ...foundation.geometry, source: { type: "foundation", building_id: o.id } });
  supports.push({ owner: o.id, binding, parts: foundation.previewParts });

  return output;
}

export async function placeRoofSupport(input: ProfilePlacementInput): Promise<ProfilePlacementOutput> {
  const { part, support: o, decoration, contactHoles } = input;
  const { output, add, plans, geometries, roofs, supports, previewRoofs, flatOwners } = collector();
  if (!o.roof || !o.roofParameters || !o.roofBinding) throw Error("Missing resolved roof for " + part.id);
  const binding = o.roofBinding!;
  if (isFlatRoofHeight(o.roofParameters!.height)) {
    flatOwners.add(o.id);
    const rule = resolvedArrangement(binding),
      flat = buildConstructionFlatRoof({
        id: binding.geometry_id,
        variationKey: binding.variationKey,
        shape: o.shape,
        wallEnvelope: o.wallEnvelope,
        topY: o.profile.topY - 0.69,
        courseOriginY: o.profile.minGround,
        material: binding.unit_id,
        footprint: binding.footprint,
        rule: rule === "posts_and_rails" ? "parallel_rows" : rule,
        rim: o.roofParameters!.flat_rim === 0,
        boundaryRule: binding.rule.boundary,
        seed: binding.seed === "source" ? Number(o.seed) : binding.seed,
        holes: contactHoles,
        roofOpenings: decoration?.roofOpenings
      });
    const cells = [...flat.cells, ...flat.connection_cells];
    const floorExtra = {
      ...(usesStonePaving(binding) ? { materialUnits: ["wooden_plank", "roof_tile"] } : {}),
      roofApertures: !!decoration?.roofOpenings.length
    };
    add(binding, flat.cells, "platform", o.slot, floorExtra);
    // Apertures belong to the floor chart, never the boundary band's chart.
    add(binding, flat.connection_cells, "platform-rim", o.slot);
    plans.push({ binding_id: binding.id, cells, dependencies: [] });
    geometries.push({ ...flat.geometry, source: { type: "building_roof", building_id: o.id } });
    supports.push({ owner: o.id, binding, parts: flat.previewParts });
    roofs.push({ id: o.id, binding, context: null, flat });
    return output;
  }
  const roof = {
    binding,
    ...buildConstructionRoof({
      id: o.id,
      nativeId: Number(o.nativeId),
      slot: o.slot,
      ...o.roof,
      geometryId: binding.geometry_id,
      variationKey: binding.variationKey,
      seed: binding.seed === "source" ? 0n : BigInt(binding.seed),
      unitMetrics: binding.footprint,
      holes: [...(decoration?.roofOpenings ?? [])]
    })
  };
  roofs.push(roof);
  if (!roof.plan || !roof.context) throw Error("Missing pitched roof chart");
  const native = resolvedArrangement(binding) === "overlap_rows",
    plan = roof.plan;
  // Placement and coarse rendering consume the same physical support. Build it
  // once per compilation; preserve the original author chart for edit anchors.
  const material = buildRoofMaterialContext(
    {
      id: o.id,
      ...o.roof,
      renderSlot: o.slot,
      holes: roof.context.mapping.native_holes.map((h) => ({ id: h.decorator_id, raw48: h.raw48 }))
    },
    roof.context
  );
  previewRoofs.set(o.id, { author: roof.context, material });
  const cells = native ? plan.cells : arrangedSurfaceCells(binding, material.geometry);
  add(
    binding,
    cells,
    "layout",
    o.slot,
    native
      ? { design: plan.roof_design, gravity: roofGravityTimeline(roof.context.roof_descriptor, cells.length).steps }
      : {}
  );
  add(binding, plan.connection_cells, "connections", o.slot, {
    design: plan.connection_roof_design,
    gravity: roofGravityTimeline(roof.context.roof_descriptor, plan.connection_cells.length).steps
  });
  // A small roof belongs to its attachment, while its material/edit chart and
  // entrance clock still belong to the host. Batch tiles within each attachment.
  const dormerCells: ReturnType<typeof settledRoofCells> = [];
  const roofGroups = [...settledRoofGroups(decoration?.roofUnits ?? [])];
  for (const { decorationId, units } of roofGroups) {
    const cells = settledRoofCells(units, roof.context.geometry, undefined, binding.variationKey);
    dormerCells.push(...cells);
    if (cells.length) add(binding, cells, "dormer_roof", o.slot, { roof: settledRoofBytes(units), decorationId });
  }
  plans.push({
    binding_id: binding.id,
    cells: [...cells, ...plan.connection_cells, ...dormerCells],
    dependencies: native
      ? plan.first_row_closure_pairs.map((p) => ({
          parent_cell_id: p.ordinary_cell_id,
          child_cell_id: p.connection_cell_id
        }))
      : []
  });
  geometries.push({ ...roof.context.geometry, source: { type: "building_roof", building_id: o.id } });

  return output;
}

/** These algorithms share the public placement registry with Point/Path/Mesh
 * algorithms. Selection uses the authored algorithm name; incompatible supports
 * fail here instead of being silently routed by the implementation layer. */
function requireProfile(support: BuildingSupport): ProfilePlacementInput {
  if (support.type !== "surface" || !("profile" in support))
    throw Error("Profile arrangement requires a resolved analytic Surface");
  return support.profile;
}
async function placeProfileArrangement(input: ProfilePlacementInput) {
  switch (input.part.support.generator) {
    case "wallStrip":
      return placeStripSupport(input);
    case "wallProfile":
      return placeWallSupport(input);
    case "foundationProfile":
      return placeFoundationSupport(input);
    case "roofProfile":
      return placeRoofSupport(input);
    default:
      throw Error("Unsupported analytic placement support: " + input.part.support.generator);
  }
}
/** The imported implementations are also the Worker execution manifest. A live
 * registration with another name is not assumed to exist in a separate realm. */
export const profilePlacementAlgorithms: ReadonlyMap<
  string,
  import("../BuildingAlgorithms").BuildingPlacementAlgorithm
> = new Map([
  ...arrangementRules.map(
    (name) =>
      [
        name,
        buildingPlacementAlgorithms.register(
          name,
          async (support) => ({
            kind: "profile" as const,
            output: await placeProfileArrangement(requireProfile(support))
          }),
          { profile: { basis: name } }
        )
      ] as const
  ),
  [
    "nativeMasonry",
    buildingPlacementAlgorithms.register(
      "nativeMasonry",
      async (support) => {
        const input = requireProfile(support);
        if (input.part.support.generator !== "wallProfile") throw Error("nativeMasonry requires a wall profile");
        return { kind: "profile" as const, output: await placeWallSupport(input) };
      },
      { profile: { basis: "nativeMasonry" } }
    )
  ],
  [
    "foundationSurface",
    buildingPlacementAlgorithms.register(
      "foundationSurface",
      async (support) => {
        const input = requireProfile(support);
        if (input.part.support.generator !== "foundationProfile")
          throw Error("foundationSurface requires a foundation profile");
        return { kind: "profile" as const, output: await placeFoundationSupport(input) };
      },
      { profile: { basis: "foundationSurface" } }
    )
  ]
]);
