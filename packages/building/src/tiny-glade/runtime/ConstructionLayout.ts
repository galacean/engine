import { constructionWindowCutWall, wallWindowCutBuffer } from "./ConstructionWallWindowCuts";
import { usesStonePaving } from "./StonePavingPlacement";
import { constructionArchGroups } from "./ConstructionArchGroups";
import { constructionHorizontalWoodWall } from "./ConstructionWoodWall";
import { buildConstructionFloors } from "./ConstructionFloors";
import { settledRoofCells, settledRoofBytes, settledRoofGroups } from "./ConstructionSettledRoof";
import { constructionJunctionGroups } from "./ConstructionJunctionLayout";
import { buildRoofMaterialContext } from "./RecoveredRoofContext";
import { isFlatRoofHeight } from "./RoofMode";
import { constructionContactSource } from "./ConstructionContacts";
import { constructionPreview, type ConstructionPreviewRoofContexts } from "./ConstructionPreview";
import { enclosureCells } from "./ConstructionEnclosure";
import {
  compileConstruction,
  concatenateRecords,
  type ConstructionUnitAssets,
  type PreparedConstruction
} from "./ConstructionCompiler";
import { parseMasonryDocument, resolvedArrangement, type MasonryBinding } from "./MasonryDocument";
import { buildConstructionRoof, roofGravityTimeline } from "./ConstructionRoof";
import { pitchedRoofTopology } from "./RecoveredRoofContacts";
import { packConstructionUnits, type ConstructionUnitRole } from "./ConstructionUnitRender";
import {
  nativeWallCells,
  arrangedWallCells,
  arrangedSurfaceCells,
  wallSurfaceGeometry
} from "./ConstructionArrangement";
import { buildConstructionFlatRoof } from "./ConstructionFlatRoof";
import { buildConstructionFoundation } from "./ConstructionFoundation";
import type { TerrainHeight } from "./PublishedWallProfile";
/** Source authoring -> replaceable geometry/rule/unit plans. Original default
 * wall/roof kernels remain the native-reference path; generic rules share charts. */
export async function compileMasonryLayout(
  input: unknown,
  terrain: TerrainHeight,
  assets: ConstructionUnitAssets,
  prepared?: PreparedConstruction
) {
  const document = parseMasonryDocument(input),
    construction = compileConstruction(
      constructionContactSource(document.construction, document.bindings),
      terrain,
      assets,
      document.bindings,
      prepared
    ),
    started = performance.now();
  const groups: any[] = [],
    plans: any[] = [],
    geometries: any[] = [],
    roofs: any[] = [],
    supports: any[] = [];
  let windowCutLayoutMs = 0;
  const previewRoofs = new Map<string, ConstructionPreviewRoofContexts>();
  const bindingFor = (id: string) => document.bindings.find((b) => b.geometry_id === id);
  const add = async (
    binding: MasonryBinding,
    cells: any[],
    role: ConstructionUnitRole,
    slot: number,
    extra: any = {}
  ) => {
    const units = await packConstructionUnits({
      cells,
      slot,
      role,
      roofApertures: extra.roofApertures,
      roofDesign: extra.design,
      source: { brick: extra.brick, roof_tile: extra.roof, wooden_plank: extra.wood }
    });
    groups.push({
      id: groups.length,
      binding_id: binding.id,
      role,
      cells,
      units,
      ...(extra.roofApertures ? { roofApertures: true } : {}),
      ...(extra.junction ? { junction: extra.junction, ownerId: extra.junction.ownerId } : {}),
      ...(extra.gravity ? { gravity: extra.gravity } : {}),
      ...(extra.materialUnits ? { materialUnits: extra.materialUnits } : {}),
      ...(extra.windowCuts ? { windowCuts: extra.windowCuts } : {}),
      ...(extra.decorationId ? { decorationId: extra.decorationId } : {})
    });
  };
  for (const o of construction.owners) {
    const b = o.building;
    if (b.kind) {
      const binding = bindingFor(b.id + "-surface")!,
        cells = enclosureCells(b, terrain, binding);
      await add(binding, cells, "enclosure", o.slot);
      plans.push({ binding_id: binding.id, cells, dependencies: [] });
      geometries.push({ id: binding.geometry_id, type: "strip", source: { type: "enclosure", building_id: b.id } });
      continue;
    }
    const wall = bindingFor(b.id + "-wall"),
      compiled = construction.walls.find((w) => w.building.id === b.id)!;
    if (wall) {
      const native = resolvedArrangement(wall) === "staggered_rows";
      const nativeWood = resolvedArrangement(wall) === "horizontal_rows" && o.shape.type === "rectangle";
      const cutIntents = construction.decorations.find((d) => d.owner === b.id)?.windowCuts ?? [];
      const cells = native
        ? nativeWallCells(wall.geometry_id, compiled.masonry.instances, o.profile)
        : arrangedWallCells(wall, o.profile, compiled.worldHoles, o.wallEnvelope.nominalOuter, o.wallRoofJoint);
      await add(wall, cells, "wall", o.slot, {
        ...(native ? { brick: concatenateRecords(compiled.masonry.instances.map((i) => i.packed64)) } : {}),
        ...(cutIntents.length || nativeWood ? { materialUnits: ["brick", "roof_tile"] } : {})
      });
      let woodCells: any[] = [];
      if (nativeWood) {
        const cutStarted = performance.now();
        const publication = constructionHorizontalWoodWall(
          assets.windowCuts,
          o,
          wall,
          compiled.worldHoles,
          cutIntents,
          construction.decorations.find((d) => d.owner === b.id)?.archOpenings
        );
        woodCells = publication.cells;
        for (const group of publication.groups)
          groups.push({ ...group, id: groups.length, binding_id: wall.id, role: "wall", ownerId: b.id });
        windowCutLayoutMs += performance.now() - cutStarted;
      } else if (cutIntents.length) {
        const cutStarted = performance.now();
        woodCells = constructionWindowCutWall(
          o,
          wall,
          compiled.worldHoles,
          cutIntents,
          document.construction.environment.type === "host_terrain"
        );
        const windowCuts = wallWindowCutBuffer(assets.windowCuts, woodCells, cutIntents, o.profile.control.length);
        await add(wall, woodCells, "wall", o.slot, { materialUnits: ["wooden_plank"], windowCuts });
        windowCutLayoutMs += performance.now() - cutStarted;
      }
      const bands = buildConstructionFloors({
        id: wall.geometry_id,
        binding: wall,
        shape: o.shape,
        profile: o.profile,
        baseY: o.profile.minGround,
        wallHeight: b.height,
        settings: b.floors ?? { enabled: false, interval: 3.5 },
        holes: compiled.worldHoles
      });
      if (bands.cells.length) await add(wall, bands.cells, "floor-band", o.slot);
      plans.push({ binding_id: wall.id, cells: [...cells, ...woodCells, ...bands.cells], dependencies: [] });
      geometries.push({
        ...wallSurfaceGeometry(wall.geometry_id, o.profile, o.wallRoofJoint),
        source: { type: "building_wall", building_id: b.id }
      });
    }
    if (b.foundation) {
      const binding = bindingFor(b.id + "-foundation");
      if (binding) {
        const rule = resolvedArrangement(binding),
          foundation = buildConstructionFoundation({
            id: binding.geometry_id,
            shape: o.shape,
            wallEnvelope: o.wallEnvelope,
            height: b.foundation.height,
            mode: b.foundation.mode,
            seed: binding.seed === "source" ? b.seed : binding.seed,
            contact: o.profile.foundationContact,
            neighbors: construction.owners
              .filter((n) => n !== o && !n.building.kind)
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
        await add(binding, foundation.cells, "foundation", o.slot);
        plans.push({ binding_id: binding.id, cells: foundation.cells, dependencies: [] });
        geometries.push({ ...foundation.geometry, source: { type: "foundation", building_id: b.id } });
        supports.push({ owner: b.id, binding, parts: foundation.previewParts });
      }
    }
    const binding = bindingFor(b.id + "-roof")!;
    if (isFlatRoofHeight(b.roof.height)) {
      const rule = resolvedArrangement(binding),
        flat = buildConstructionFlatRoof({
          id: binding.geometry_id,
          shape: o.shape,
          wallEnvelope: o.wallEnvelope,
          topY: o.profile.topY - 0.69,
          courseOriginY: o.profile.minGround,
          material: binding.unit_id,
          footprint: binding.footprint,
          rule: rule === "posts_and_rails" ? "parallel_rows" : rule,
          rim: b.roof.flat_rim === 0,
          boundaryRule: binding.rule.boundary,
          seed: binding.seed === "source" ? b.seed : binding.seed,
          holes: construction.contactHoles.get(o.nativeId),
          roofOpenings: construction.decorations.find((d) => d.owner === b.id)?.roofOpenings
        });
      const cells = [...flat.cells, ...flat.connection_cells];
      const floorExtra = {
        ...(usesStonePaving(binding) ? { materialUnits: ["wooden_plank", "roof_tile"] } : {}),
        roofApertures: !!construction.decorations.find((d) => d.owner === b.id)?.roofOpenings.length
      };
      await add(binding, flat.cells, "platform", o.slot, floorExtra);
      // Apertures belong to the floor chart, never the boundary band's chart.
      await add(binding, flat.connection_cells, "platform-rim", o.slot);
      plans.push({ binding_id: binding.id, cells, dependencies: [] });
      geometries.push({ ...flat.geometry, source: { type: "building_roof", building_id: b.id } });
      supports.push({ owner: b.id, binding, parts: flat.previewParts });
      roofs.push({ id: b.id, binding, context: null, flat });
      continue;
    }
    const roof = {
      binding,
      ...buildConstructionRoof({
        id: b.id,
        nativeId: Number(o.nativeId),
        slot: o.slot,
        ...o.roof,
        geometryId: binding.geometry_id,
        seed: binding.seed === "source" ? 0n : BigInt(binding.seed),
        unitMetrics: binding.footprint,
        holes: [...(construction.decorations.find((d) => d.owner === b.id)?.roofOpenings ?? [])]
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
        id: b.id,
        ...o.roof,
        renderSlot: o.slot,
        holes: roof.context.mapping.native_holes.map((h) => ({ id: h.decorator_id, raw48: h.raw48 }))
      },
      roof.context
    );
    previewRoofs.set(b.id, { author: roof.context, material });
    const cells = native ? plan.cells : arrangedSurfaceCells(binding, material.geometry);
    await add(
      binding,
      cells,
      "layout",
      o.slot,
      native
        ? { design: plan.roof_design, gravity: roofGravityTimeline(roof.context.roof_descriptor, cells.length).steps }
        : {}
    );
    await add(binding, plan.connection_cells, "connections", o.slot, {
      design: plan.connection_roof_design,
      gravity: roofGravityTimeline(roof.context.roof_descriptor, plan.connection_cells.length).steps
    });
    // A small roof belongs to its attachment, while its material/edit chart and
    // entrance clock still belong to the host. Batch tiles within each attachment.
    const dormerCells: ReturnType<typeof settledRoofCells> = [];
    const roofGroups = [...settledRoofGroups(construction.decorations.find((d) => d.owner === b.id)?.roofUnits ?? [])];
    for (const { decorationId, units } of roofGroups) {
      const cells = settledRoofCells(units, roof.context.geometry);
      dormerCells.push(...cells);
      if (cells.length)
        await add(binding, cells, "dormer_roof", o.slot, { roof: settledRoofBytes(units), decorationId });
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
    geometries.push({ ...roof.context.geometry, source: { type: "building_roof", building_id: b.id } });
  }
  const junctions = constructionJunctionGroups(construction.owners, construction, document.bindings);
  for (const owner of construction.owners) {
    const decorations = construction.decorations.find((d) => d.owner === owner.building.id);
    if (decorations)
      for (const group of constructionArchGroups(owner, decorations, document.bindings)) junctions.push(group);
  }
  for (const junction of junctions) {
    await add(junction.binding, junction.cells, junction.role, junction.slot, {
      [junction.sourceUnit === "brick" ? "brick" : "wood"]: concatenateRecords(junction.records),
      junction: { ownerId: junction.ownerId, sourceUnit: junction.sourceUnit, sourceDrawId: junction.sourceDrawId },
      decorationId: junction.decorationId
    });
    const plan = plans.find((p) => p.binding_id === junction.binding.id);
    if (!plan) throw Error("Junction binding has no surface plan");
    // Some surface plans share their array with a draw group; never append in place.
    plan.cells = [...plan.cells, ...junction.cells];
  }
  const topology = pitchedRoofTopology(roofs.flatMap((r) => (r.context ? [r.context.mapping] : [])));
  return {
    document,
    construction,
    roofs,
    topology,
    groups,
    plans,
    supports,
    junctions,
    preview: constructionPreview(document, terrain, construction, { preparedRoofs: previewRoofs, assets }),
    placementDocument: {
      version: 2,
      construction: document.construction,
      geometries,
      bindings: document.bindings,
      overrides: document.overrides
    },
    timings: {
      ...construction.timings,
      windowCutLayoutMs,
      roofLayoutAndPacking: performance.now() - started,
      total: construction.timings.total + performance.now() - started
    }
  };
}
export type CompiledMasonryLayout = Awaited<ReturnType<typeof compileMasonryLayout>>;
