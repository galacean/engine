import { authoredDesignPart, buildingAuthorKey, buildingDesignKey } from "./BuildingDesignIdentity";
import {
  assertBuildingPublication,
  prepareBuildingPublication,
  buildingPreviewInput,
  type BuildingPublication
} from "./BuildingPublication";
import { type BuildingInstancePlacement } from "./BuildingInstancePlacement";
import {
  executeBuildingPlacement,
  buildingSupportAlgorithms,
  type BuildingAlgorithmContext,
  type BuildingSupport
} from "../BuildingAlgorithms";
import { profileSupportGenerators } from "./BuildingDraft";
import "./ProfilePlacementAlgorithms";
import type { ProfilePlacementInput } from "./ProfilePlacementAlgorithms";
import type { BuildingRenderInput, BuildingUnitDrawGroup } from "../../runtime/BuildingRenderPackage";
import { profilePreview, type ConstructionPreviewRoofContexts } from "../../runtime/ProfilePreview";
import { buildingPalette } from "./BuildingPalette";
import { concatenateRecords } from "../../runtime/ConstructionRecords";
import { packWallPlaster } from "../../runtime/WallPlasterPacking";
import { encodeCompleteConstructionDormerBins } from "../../runtime/DormerBins";
import type { BuildingDesign } from "./BuildingDesign";
import { resolvedArrangement, type UnitPlacementBinding as MasonryBinding } from "../../runtime/UnitPlacement";
import { packConstructionUnits, type ConstructionUnitRole } from "../../runtime/ConstructionUnitRender";

/** Final supports -> unit placements and render buffers.
 * The dev/2.0 numerical kernels/ordering/precision are preserved intentionally. */
export async function implementBuilding(
  design: BuildingDesign,
  options: {
    context?: BuildingAlgorithmContext;
    signal?: AbortSignal;
    publication?: BuildingPublication;
  } = {}
) {
  options.signal?.throwIfAborted();
  const instanceParts: BuildingInstancePlacement[] = [];
  const { bindings, terrain, assets } = design;
  const overrides = design.overrides;
  // Keep resource access lazy: pure algorithms may run with a context whose
  // Entity/own access is deliberately unavailable (for example in CPU tests).
  const algorithmContext: BuildingAlgorithmContext | undefined =
    options.context && options.signal
      ? Object.assign(Object.create(options.context), { signal: options.signal })
      : options.context;
  const placementContext = algorithmContext ?? { cache: new Map<string, unknown>(), signal: options.signal };
  const publication = options.publication ?? (await prepareBuildingPublication(design, placementContext));
  assertBuildingPublication(design, publication);
  const { prepared, junctions } = publication;
  const rawWalls: BuildingRenderInput["rawDraws"] = [];
  const { decorations } = prepared;
  const started = performance.now();
  const walls: import("./ProfilePlacementAlgorithms").ProfilePlacementOutput["walls"] = [];
  const construction = {
    ...prepared,
    walls,
    dormerBins: encodeCompleteConstructionDormerBins(decorations.flatMap((d) => d.roofOpenings.map((h) => h.raw48)))
  };
  const groups: any[] = [],
    plans: any[] = [],
    geometries: any[] = [],
    roofs: any[] = [],
    supports: any[] = [];
  let windowCutLayoutMs = 0;
  const previewRoofs = new Map<string, ConstructionPreviewRoofContexts>();
  const renderGroups: BuildingUnitDrawGroup[] = [];
  const renderOwners = new Map(
    design.parts.flatMap((p) =>
      p.identity.kind === "author" ? [[p.identity.id + "/placement", p.group] as const] : []
    )
  );
  const jointByOwner = new Map(
    design.parts
      .filter((p) => p.support.generator === "wallProfile")
      .map((p) => [p.group, design.supports.get(buildingDesignKey(p.identity))!.profile.wallRoofJoint])
  );
  const backedGeometry = new Set<string>();
  const flatOwners = new Set<string>();
  const backedBindings = new Set(bindings.filter((b) => resolvedArrangement(b) !== "overlap_rows").map((b) => b.id));
  const addRenderGroup = (group: any) => {
    const ownerId = group.ownerId ?? renderOwners.get(group.binding_id);
    if (ownerId === undefined) throw Error("Missing part draw owner: " + group.binding_id);
    renderGroups.push({
      ...group,
      ownerId,
      wallRoofJoint: group.role === "wall" ? jointByOwner.get(ownerId) : undefined
    });
  };
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
    addRenderGroup(groups[groups.length - 1]);
  };
  // Solved analytic supports retain their own placement constraints. Preserve
  // the established draw order, but dispatch every job by its authored algorithm.
  const analytic = new Map<string, ProfilePlacementInput>();
  for (const owner of construction.owners)
    for (const part of [owner.part, owner.foundationPart, owner.roofPart]) {
      if (!part) continue;
      analytic.set(part.id, {
        part,
        support: owner,
        reservations: design.supports.get(buildingAuthorKey(owner.part.id))?.reservations ?? [],
        decoration: construction.decorations.find((d) => d.owner === owner.id),
        contactHoles: construction.contactHoles.get(owner.nativeId),
        neighbors: construction.owners,
        terrain,
        assets
      });
    }
  const jobs = [
    ...design.parts.filter(
      (part) =>
        !profileSupportGenerators.has(part.support.generator) &&
        !publication.placedParts.has(buildingDesignKey(part.identity))
    ),
    ...[...analytic.values()].map((input) => authoredDesignPart(input.part))
  ];
  for (const part of jobs) {
    options.signal?.throwIfAborted();
    const input = part.identity.kind === "author" ? analytic.get(part.identity.id) : undefined;
    let support: BuildingSupport;
    if (input) support = { type: "surface", profile: input };
    else {
      if (!algorithmContext) throw Error("Native support generation requires a BuildingAlgorithmContext");
      support = buildingSupportAlgorithms.resolve(part.support.generator)(part.support.params, algorithmContext);
    }
    const placements = await executeBuildingPlacement(part.algorithm.type, support, part.params, placementContext);
    options.signal?.throwIfAborted();
    if (!Array.isArray(placements) && "kind" in placements && placements.kind === "records")
      throw Error("Placement record format has no instance renderer: " + placements.format);
    if (Array.isArray(placements) || !("kind" in placements) || placements.kind !== "profile") {
      instanceParts.push({
        part,
        group: design.groups.find((g) => g.id === part.group)!,
        support,
        placements: placements as BuildingInstancePlacement["placements"]
      });
      continue;
    }
    const placed = placements.output;
    rawWalls.push(...placed.rawDraws);
    for (const draw of placed.draws) {
      if ("raw" in draw) {
        groups.push({ ...draw.raw, id: groups.length });
        addRenderGroup(groups[groups.length - 1]);
      } else await add(draw.binding, draw.cells, draw.role, draw.slot, draw.extra);
    }
    walls.push(...placed.walls);
    plans.push(...placed.plans);
    geometries.push(...placed.geometries);
    roofs.push(...placed.roofs);
    supports.push(...placed.supports);
    for (const [id, roof] of placed.previewRoofs) previewRoofs.set(id, roof);
    for (const id of placed.backedGeometry) backedGeometry.add(id);
    for (const id of placed.flatOwners) flatOwners.add(id);
    windowCutLayoutMs += placed.windowCutLayoutMs;
  }
  const plaster = packWallPlaster(
    walls.map((w) => ({ mesh: w.plaster, slot: w.slot, controlLength: w.profile.control.length, closed: true }))
  );
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
  const preview = profilePreview(buildingPreviewInput(design, publication, plans), terrain, {
    preparedRoofs: previewRoofs,
    assets
  });
  const placementDocument = { version: 2, geometries, bindings: bindings, overrides: overrides };
  const appearance = buildingPalette(design);
  const renderInput: BuildingRenderInput = {
    rawDraws: [...publication.archDraws, ...rawWalls, ...publication.connectionDraws],
    groups: renderGroups,
    decorations,
    dormerBins: construction.dormerBins,
    paletteSlots: appearance.paletteSlots,
    colorOwners: appearance.colorOwners.map(({ id, seed }) => ({ id, seed })),
    backingParts: preview.parts.filter(
      (p) =>
        p.placement !== "unit" &&
        !p.stonePaving &&
        !p.plaster &&
        !p.decoration &&
        !p.junction &&
        !p.dormer &&
        p.backing !== false &&
        (backedGeometry.has(p.geometryId!) || flatOwners.has(p.owner) || backedBindings.has(p.bindingId!))
    ),
    surfaceParts: preview.parts,
    placementDocument,
    plans
  };
  options.signal?.throwIfAborted();
  return {
    instanceParts,
    renderInput,
    construction: { ...construction, plaster },
    roofs,
    groups,
    plans,
    supports,
    junctions,
    preview,
    placementDocument,
    timings: {
      ...construction.timings,
      windowCutLayoutMs,
      roofLayoutAndPacking: performance.now() - started,
      total: construction.timings.total + performance.now() - started
    }
  };
}
export type ImplementedBuilding = Awaited<ReturnType<typeof implementBuilding>>;
