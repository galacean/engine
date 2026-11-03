import { constructionArchInstanceGroups } from "./ConstructionArchGroups";
import { decorationStoneBounds } from "./DecorationStoneBounds";
import { decorationFrameBounds } from "./ConstructionDecorationFrames";
import { appendStoneFloorRenderPackage } from "./ConstructionStoneFloorRender";
import { constructionSurfaceUnitDraw } from "./ConstructionUnitRender";
import { packDecorationStoneFrameInstances } from "./DecorationStoneFrameInstance";
import { isFlatRoofHeight } from "./RoofMode";
import { appendDecorationRenderPackage } from "./ConstructionDecorationRender";
import { constructionSupportParts } from "./ConstructionSupportRender";
import { appendPlasterRenderPackage } from "./ConstructionPlasterRender";
import { resolvedArrangement } from "./MasonryDocument";
import type { CompiledMasonryLayout } from "./ConstructionLayout";
import type { BuildingAssets } from "../resources/BuildingAssetKit";
import { ConstructionPackageBuilder } from "./ConstructionPackage";
import type { ConstructionBindings } from "./ConstructionPackage";
import { concatenateRecords } from "./ConstructionCompiler";
import { packDecorationStoneInstances } from "./DecorationStoneInstance";
import { addWoodArchPillarDraws, appendWoodArchRenderPackage } from "./ConstructionWoodArchRender";
import { masonryColorSeed } from "./MasonryColorRules";

/** Bind semantic producers to original shader ABIs. Scene data remains owned by
 * the compiler; the library supplies only immutable meshes, shaders and textures.
 * Roof replacements use the same Hole48 owner predicate as the tiled material.
 */
export function buildConstructionRenderPackage(
  layout: CompiledMasonryLayout,
  assets: BuildingAssets,
  globals: ConstructionBindings,
  whiteBase = false,
  rigidPoses?: ReadonlyMap<string, readonly number[]>,
  stoneGeometry?: import("./ConstructionGeometryAssets").ConstructionStoneGeometry
) {
  const stones = layout.construction.decorations.flatMap((d) => d.stones);
  const frames = layout.construction.decorations.flatMap((d) => d.frames);
  const counts = new Uint8Array(
    layout.construction.dormerBins.counts.buffer,
    layout.construction.dormerBins.counts.byteOffset,
    layout.construction.dormerBins.counts.byteLength
  );
  const holes = layout.construction.dormerBins.holes;
  const builder = new ConstructionPackageBuilder(assets, {
    ...globals,
    roofCounts: counts,
    roofHoles: holes,
    domainCounts: counts,
    domainHoles: holes
  });
  const boundWallIds = new Set(
    layout.document.bindings.filter((b) => b.geometry_id.endsWith("-wall")).map((b) => b.geometry_id.slice(0, -5))
  );
  for (const stone of stones) {
    const draw = builder.addDraw({
      id: stone.id,
      ownerId: stone.ownerId,
      template: stone.template,
      instances: packDecorationStoneInstances([stone.instance]),
      geometryScale: stone.geometryScale
    });
    if (rigidPoses) {
      const inverseBind = rigidPoses.get(stone.decorationId);
      if (!inverseBind) throw Error("Missing stone decoration binding " + stone.decorationId);
      draw.objectBinding = {
        id: stone.decorationId,
        inverseBind: [...inverseBind],
        ...decorationStoneBounds(stoneGeometry, stone)
      };
    }
  }
  for (const frame of frames) {
    const draw = builder.addDraw({
      id: frame.id,
      ownerId: frame.ownerId,
      template: frame.template,
      instances: packDecorationStoneFrameInstances([frame.instance])
    });
    if (rigidPoses) {
      const inverseBind = rigidPoses.get(frame.decorationId);
      if (!inverseBind) throw Error("Missing frame decoration binding " + frame.decorationId);
      draw.objectBinding = {
        id: frame.decorationId,
        inverseBind: [...inverseBind],
        ...decorationFrameBounds(stoneGeometry, frame)
      };
    }
  }
  const boundNativeWalls = new Set(
    layout.construction.owners.filter((o) => boundWallIds.has(o.building.id)).map((o) => o.nativeId)
  );
  addWoodArchPillarDraws(
    builder,
    layout.construction.decorations.flatMap((d) => d.woodArchPillars ?? []),
    globals
  );
  for (const decorations of layout.construction.decorations) {
    if (boundWallIds.has(decorations.owner) || !decorations.archInstances?.length) continue;
    for (const [pickId, units] of constructionArchInstanceGroups(decorations)) {
      const draw = builder.addDraw({
        id: "decoration-arches/" + JSON.stringify([decorations.owner, pickId]),
        ownerId: decorations.owner,
        template: "brick",
        instances: concatenateRecords(units.map((unit) => unit.packed64))
      });
      draw.pickId = pickId;
    }
  }
  for (const wall of layout.construction.walls) {
    if (boundWallIds.has(wall.building.id)) continue;
    builder.addDraw({
      id: "wall-" + wall.nativeId.toString(),
      ownerId: wall.building.id,
      template: "brick",
      wallRoofJoint: wall.wallRoofJoint,
      instances: concatenateRecords(wall.masonry.instances.map((i) => i.packed64))
    });
  }
  // A renderer has one entrance clock. Keep each producer's primary owner,
  // including alternating brick owners and independently selected beam owners.
  const owners = new Map(layout.construction.owners.map((o) => [o.nativeId, o.building.id]));
  function appendConnections<T extends { primaryWallId: bigint }>(
    source: string,
    template: string,
    records: readonly T[],
    packed: (record: T) => Uint8Array
  ) {
    const batches = new Map<bigint, Uint8Array[]>();
    for (const record of records) {
      if (boundNativeWalls.has(record.primaryWallId)) continue;
      let batch = batches.get(record.primaryWallId);
      if (!batch) batches.set(record.primaryWallId, (batch = []));
      batch.push(packed(record));
    }
    for (const [nativeId, records] of batches) {
      const ownerId = owners.get(nativeId);
      if (ownerId === undefined) throw Error("Connection references an absent construction owner");
      builder.addDraw({
        id: source + "/" + ownerId,
        ownerId,
        template,
        instances: concatenateRecords(records)
      });
    }
  }
  appendConnections("connection-bricks", "brick", layout.construction.connections.bricks, (i) => i.packed64);
  appendConnections("connection-beams", "wood", layout.construction.connections.beams, (i) => i.packed80);
  for (const [suffix, group] of layout.construction.merlons.groups.entries()) {
    const ownerId = layout.construction.owners.find((o) => o.nativeId === group.candidate.flatId)!.building.id;
    if (layout.document.bindings.some((b) => b.geometry_id === ownerId + "-roof")) continue;
    builder.addDraw({
      id: "inter-roof-bricks-" + suffix,
      ownerId,
      template: "brick",
      instances: concatenateRecords(group.bricks.map((i) => i.packed64))
    });
    builder.addDraw({
      id: "inter-roof-beams-" + suffix,
      ownerId,
      template: "wood",
      instances: concatenateRecords(group.beams.map((i) => i.packed80))
    });
  }
  for (const group of layout.groups) {
    const ownerId =
      group.ownerId ??
      layout.construction.owners.find(
        (o) =>
          layout.document.bindings.find((b) => b.id === group.binding_id)?.geometry_id ===
          o.building.id +
            (o.building.kind
              ? "-surface"
              : group.role === "wall" || group.role === "floor-band"
                ? "-wall"
                : group.role === "foundation"
                  ? "-foundation"
                  : "-roof")
      )?.building.id;
    const wallRoofJoint =
      group.role === "wall"
        ? layout.construction.owners.find((o) => o.building.id === ownerId)?.wallRoofJoint
        : undefined;
    // Native wood groups are already partitioned by their 80/96-byte ABI and
    // gable mesh. Repacking them as generic units loses skew bounds and breaks
    // the correspondence between material selections and window-cut lists.
    if (group.woodDraw) {
      builder.addDraw({
        id: "enclosure-" + group.id + "-wooden_plank",
        ownerId,
        ...constructionSurfaceUnitDraw("wooden_plank", group.woodDraw.instances, { sourceDraw: group.woodDraw }),
        wallRoofJoint,
        variant: "wooden_plank",
        group: group.id
      });
      continue;
    }
    if (!["layout", "connections", "dormer_roof"].includes(group.role) && !group.roofApertures) {
      for (const variant of ["brick", "wooden_plank", "roof_tile"] as const) {
        if (group.materialUnits && !group.materialUnits.includes(variant)) continue;
        builder.addDraw({
          id: "enclosure-" + group.id + "-" + variant,
          ownerId,
          ...constructionSurfaceUnitDraw(variant, group.units[variant], { windowCuts: group.windowCuts }),
          wallRoofJoint,
          variant,
          group: group.id
        });
      }
      continue;
    }
    const id = "generic-" + group.id,
      domainRoof = group.units.roof_tile;
    // Replacement materials consume the packed plane@16, slot@40 and main-body
    // flag@60. All survive gravity unchanged; no settled-position shadow buffer.
    if (!group.materialUnits || group.materialUnits.includes("roof_tile"))
      builder.addDraw({
        id,
        ownerId,
        template: "roof",
        instances: domainRoof,
        variant: "roof_tile",
        group: group.id,
        ...(group.gravity ? { feedback: { steps: group.gravity } } : {})
      });
    if (!group.materialUnits || group.materialUnits.includes("brick"))
      builder.addDraw({
        id: id + "-brick",
        ownerId,
        template: "brick_roof",
        instances: group.units.brick,
        variant: "brick",
        group: group.id,
        bindings: { domainRoof }
      });
    if (!group.materialUnits || group.materialUnits.includes("wooden_plank"))
      builder.addDraw({
        id: id + "-wooden_plank",
        ownerId,
        template: "wood_roof",
        instances: group.units.wooden_plank,
        variant: "wooden_plank",
        group: group.id,
        bindings: { domainRoof }
      });
  }
  const result = builder.build();
  for (const draw of result.package.draws) {
    const group = layout.groups.find((group) => group.id === draw.group);
    if (group?.decorationId) draw.pickId = group.decorationId;
  }
  result.package.whiteBase = whiteBase;
  if (whiteBase)
    result.package.colorOwners = layout.construction.owners.map(({ building }) => ({
      id: building.id,
      seed: masonryColorSeed(building)
    }));
  result.package.dormerGrid = [...layout.construction.dormerBins.grid];
  result.package.document = structuredClone(layout.placementDocument);
  result.package.groups = layout.groups.map(({ id, binding_id, role, cells, materialUnits }) => ({
    id,
    binding_id,
    role,
    cells: structuredClone(cells),
    ...(materialUnits ? { materialUnits: [...materialUnits] } : {})
  }));
  result.package.plans = structuredClone(layout.plans);
  const support = layout.preview.parts.filter(
    (p) =>
      // Retained units are closed solids. A second box behind their rounded
      // mesh leaks through bevels and noise-deformed corners.
      p.placement !== "unit" &&
      !p.stonePaving &&
      !p.plaster &&
      !p.decoration &&
      !p.junction &&
      !p.dormer &&
      // Floor belts are brick attachments over an already backed wall. Their
      // curved envelope cannot back the coarser, noise-warped brick chords:
      // even an inward offset can intersect their fronts. Native add_skirts
      // emits only bricks. Keep this envelope for coarse LOD/structure only.
      !p.geometryId?.endsWith("-bands") &&
      ((p.geometryId?.endsWith("-wall") && p.bindingId !== undefined) ||
        p.geometryId?.endsWith("-foundation") ||
        layout.document.construction.buildings.some((b) => b.id === p.owner && isFlatRoofHeight(b.roof.height)) ||
        layout.document.bindings.some((b) => b.id === p.bindingId && resolvedArrangement(b) !== "overlap_rows"))
  );
  const decorated = appendPlasterRenderPackage(
    appendDecorationRenderPackage(
      result,
      [
        ...constructionSupportParts(support),
        ...layout.construction.decorations.flatMap((d) => d.parts),
        ...layout.preview.parts
          .filter((p) => p.roofSpire)
          .map((p) => ({
            id: p.owner + "/roof-spire",
            ownerId: p.owner,
            kind: "roof-spire",
            positions: p.positions,
            indices: p.indices,
            normals: p.normals!,
            colors: p.colors!,
            emission: p.emission!,
            uvs: p.uvs
          }))
      ],
      rigidPoses
    ),
    layout.preview.parts
  );
  const rendered = appendWoodArchRenderPackage(
    appendStoneFloorRenderPackage(decorated, layout.preview.parts),
    layout.construction.decorations.flatMap((d) => d.woodArchFrames ?? []),
    globals
  );
  for (const draw of rendered.package.draws)
    if (draw.count > 0 && draw.ownerId === undefined)
      throw Error("Construction draw requires an explicit owner: " + draw.id);
  return rendered;
}
