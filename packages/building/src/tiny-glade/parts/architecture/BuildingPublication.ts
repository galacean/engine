import { buildingDesignKey, type BuildingDesignKey } from "./BuildingDesignIdentity";
import { roofSpireRecordFormat } from "../algorithms/RoofSpire";
import type { PlacedRoofSpire } from "../../runtime/ProfileRoofSpire";
import "../algorithms/ProfiledDormerCourses";
import { dormerRoofRecordFormat } from "../algorithms/CottageDormerCourses";
import type { SettledRoofUnit } from "../../runtime/ConstructionSettledRoof";
import { attachmentRecordFormat, type MountedAttachment } from "../algorithms/MountAttachment";
import {
  stoneArchRecordFormat,
  woodArchRecordFormat,
  type StoneArchMembers,
  type WoodArchMembers
} from "../algorithms/ArchMembers";
import { concatenateRecords } from "../../runtime/ConstructionRecords";
import type { BuildingRenderInput } from "../../runtime/BuildingRenderPackage";
import { packWallConnections } from "../../runtime/WallConnectionPipeline";
import { roofMerlonRecordFormat, type RoofMerlonCourse } from "../algorithms/RoofMerlons";
import type { WallStitchPlacement } from "../../runtime/WallConnectionTypes";
import { executeBuildingPlacement, type BuildingPlacementContext } from "../BuildingAlgorithms";
import { wallStitchRecordFormat } from "../algorithms/WallStitches";
import { constructionArchInstanceGroups, profileArchGroups } from "../../runtime/ConstructionArchGroups";
import { profileJunctionGroups } from "../../runtime/ConstructionJunctionLayout";
import { isFlatRoofHeight } from "../../runtime/RoofMode";
import { normalizeProfileRoof, normalizeProfileFootprint } from "../../runtime/ProfileParameters";
import { placeStripUnits } from "../../runtime/StripPlacement";
import { resolvedArrangement } from "../../runtime/UnitPlacement";
import type { ProfilePreviewInput } from "../../runtime/ProfilePreview";
import type { SupportCell } from "../../runtime/PlacementSupport";
import type { BuildingDesign } from "./BuildingDesign";

function profileFor(design: BuildingDesign, group: string) {
  const p = design.profileSupports.find((p) => p.group.id === group);
  if (!p || !p.roof) throw Error("Missing resolved wall/roof constraint in " + group);
  return { ...p, roof: p.roof };
}
/** Shared solved contact publication for distance and detail. Ordinary facade
 * bricks and main roof tiles are not generated here. */
export async function prepareBuildingPublication(
  design: BuildingDesign,
  context: BuildingPlacementContext = { cache: new Map() }
) {
  const { bindings } = design;
  const placements: WallStitchPlacement[] = [];
  const placedParts = new Set<BuildingDesignKey>();
  const merlonGroups = [];
  const spires: PlacedRoofSpire[] = [];
  const decorations = design.prepared.decorations.map(
    ({ arches: _arches, mounts: _mounts, dormerRoofs: _dormerRoofs, ...decoration }) => ({
      ...decoration,
      parts: decoration.parts.slice(),
      frames: decoration.frames.slice(),
      stones: decoration.stones.slice(),
      roofUnits: decoration.roofUnits.slice(),
      archInstances: decoration.archInstances?.slice(),
      woodArchFrames: decoration.woodArchFrames?.slice(),
      woodArchPillars: decoration.woodArchPillars?.slice()
    })
  );
  // One dispatch boundary for early parts. The format selects numerical packing;
  // the authored algorithm remains freely replaceable within that output contract.
  for (const part of design.parts) {
    const key = buildingDesignKey(part.identity);
    const destination = part.publication;
    if (!destination) continue;
    const { format, decorationId, colorId, candidate } = destination;
    const support = design.supports.get(key);
    if (!support) throw Error("Missing resolved publication support: " + key);
    let params = part.params;
    if (format === roofSpireRecordFormat) {
      if (typeof part.unit !== "object" || !("libraryMesh" in part.unit) || part.unit.libraryMesh !== "roofSpire")
        throw Error("Roof spire placement requires the roofSpire library mesh Unit");
      const mesh = design.assets.roofSpire;
      if (!mesh) throw Error("Missing roof spire mesh in building library");
      params = { ...params, ownerId: part.group, mesh };
    }
    if (format === dormerRoofRecordFormat && part.unit !== profileFor(design, part.group).roofBinding!.unit_id)
      throw Error("Dormer roof Unit must match its shared host roof material binding");
    const result = await executeBuildingPlacement(part.algorithm.type, support, params, context);
    if (Array.isArray(result) || !("kind" in result) || result.kind !== "records" || result.format !== format)
      throw Error("Placement requires " + format + " records: " + key);
    const decoration = decorations.find((d) => d.owner === part.group)!;
    switch (format) {
      case wallStitchRecordFormat:
        for (const record of result.records as readonly WallStitchPlacement[]) {
          if (record.unit !== part.unit) throw Error("Junction placement does not match its Unit: " + key);
          placements.push({ ...record, sourceCandidate: candidate! });
        }
        break;
      case roofMerlonRecordFormat: {
        const courses = result.records as readonly RoofMerlonCourse[];
        if (courses.some((course) => course.placements.some((placement) => placement.unit !== part.unit)))
          throw Error("Roof junction placement does not match its Unit: " + key);
        merlonGroups.push({
          candidate: design.prepared.merlons.candidates[candidate!],
          placements: courses.flatMap((c) => c.placements),
          bricks: courses.flatMap((c) => c.bricks),
          beams: courses.flatMap((c) => c.beams)
        });
        break;
      }
      case stoneArchRecordFormat:
        if (part.unit !== "brick") throw Error("Stone arch placement requires the brick Unit");
        for (const members of result.records as readonly StoneArchMembers[])
          for (const instance of members.instances)
            (decoration.archInstances ??= []).push({ ...instance, decorationId: decorationId! });
        break;
      case woodArchRecordFormat: {
        if (
          typeof part.unit !== "object" ||
          !("nativeAttachment" in part.unit) ||
          part.unit.nativeAttachment.type !== "opening-arch"
        )
          throw Error("Wood arch placement requires the opening-arch Unit");
        const identity = { ownerId: part.group, decorationId: decorationId!, colorId: colorId! };
        for (const members of result.records as readonly WoodArchMembers[]) {
          for (const frame of members.frames) (decoration.woodArchFrames ??= []).push({ ...frame, ...identity });
          for (const pillar of members.pillars) (decoration.woodArchPillars ??= []).push({ ...pillar, ...identity });
        }
        break;
      }
      case attachmentRecordFormat:
        for (const placed of result.records as readonly MountedAttachment[]) {
          if (
            [...placed.parts, ...placed.frames, ...placed.stones].some(
              (p) => p.ownerId !== part.group || p.decorationId !== decorationId
            )
          )
            throw Error("Attachment placement returned another part's geometry: " + key);
          decoration.parts.push(...placed.parts);
          decoration.frames.push(...placed.frames);
          decoration.stones.push(...placed.stones);
        }
        break;
      case dormerRoofRecordFormat:
        for (const unit of result.records as readonly SettledRoofUnit[])
          decoration.roofUnits.push({ ...unit, decorationId: decorationId! });
        break;
      case roofSpireRecordFormat: {
        const records = result.records as readonly PlacedRoofSpire[];
        if (
          records.length > 1 ||
          records.some(
            ({ part: geometry, anchor }) =>
              geometry.ownerId !== part.group ||
              geometry.id !== part.group + "/roof-spire" ||
              geometry.kind !== "roof-spire" ||
              !Array.isArray(anchor) ||
              anchor.length !== 3 ||
              !anchor.every(Number.isFinite)
          )
        )
          throw Error("Roof spire placement returned invalid ownership or mount: " + key);
        spires.push(...records);
        break;
      }
      default:
        throw Error("No publication packer for " + format);
    }
    placedParts.add(key);
  }
  // Preserve authored attachment order across independently generated families.
  // Native material batches and transparent interiors consume this order.
  for (const decoration of decorations) {
    const order = new Map(decoration.resolved.map((item, i) => [item.id, i]));
    const compare = (a: { decorationId?: string }, b: { decorationId?: string }) =>
      (order.get(a.decorationId!) ?? 0) - (order.get(b.decorationId!) ?? 0);
    decoration.parts.sort(compare);
    decoration.frames.sort(compare);
    decoration.stones.sort(compare);
    decoration.roofUnits.sort(compare);
  }
  const prepared = {
    ...design.prepared,
    spires,
    decorations,
    woodPillar: decorations.some((decoration) => decoration.woodArchPillars?.length)
      ? design.assets.woodPillar
      : undefined,
    connections: packWallConnections(design.prepared.connections, placements, design.contacts.slots),
    merlons: {
      ...design.prepared.merlons,
      groups: merlonGroups,
      bricks: merlonGroups.flatMap((group) => group.bricks),
      beams: merlonGroups.flatMap((group) => group.beams)
    }
  };
  const junctionOwners = design.profileSupports.map((p) => ({
    id: p.id,
    variationKey: p.variationKey,
    nativeId: p.nativeId,
    slot: p.slot,
    shape: p.shape,
    profile: p.profile,
    wallBinding:
      p.part.support.generator === "wallProfile" ? bindings.find((b) => b.id === p.wallBinding.id) : undefined,
    roofBinding: p.roofBinding ? bindings.find((b) => b.id === p.roofBinding!.id) : undefined
  }));
  const junctions = profileJunctionGroups(junctionOwners, prepared);
  for (const owner of prepared.owners) {
    const decorations = prepared.decorations.find((d) => d.owner === owner.id);
    if (decorations && owner.wallPlacement)
      for (const group of profileArchGroups(profileFor(design, owner.id), decorations, owner.wallBinding))
        junctions.push(group);
  }

  const archDraws: BuildingRenderInput["rawDraws"] = [],
    connectionDraws: BuildingRenderInput["rawDraws"] = [];
  const nativeWalls = new Map(prepared.owners.filter((o) => !o.wallPlacement).map((o) => [o.nativeId, o.id]));
  for (const decoration of prepared.decorations) {
    if (!prepared.owners.some((o) => o.id === decoration.owner && !o.wallPlacement)) continue;
    for (const [pickId, units] of constructionArchInstanceGroups(decoration))
      archDraws.push({
        id: "decoration-arches/" + JSON.stringify([decoration.owner, pickId]),
        ownerId: decoration.owner,
        template: "brick",
        instances: concatenateRecords(units.map((u) => u.packed64)),
        pickId
      });
  }
  function addConnections<T extends { primaryWallId: bigint }>(
    source: string,
    template: string,
    units: readonly T[],
    bytes: (u: T) => Uint8Array
  ) {
    const groups = new Map<string, Uint8Array[]>();
    for (const unit of units) {
      const owner = nativeWalls.get(unit.primaryWallId);
      if (!owner) continue;
      const records = groups.get(owner) ?? [];
      records.push(bytes(unit));
      groups.set(owner, records);
    }
    for (const [ownerId, records] of groups)
      connectionDraws.push({ id: source + "/" + ownerId, ownerId, template, instances: concatenateRecords(records) });
  }
  addConnections("connection-bricks", "brick", prepared.connections.bricks, (u) => u.packed64);
  addConnections("connection-beams", "wood", prepared.connections.beams, (u) => u.packed80);
  return { design, prepared, junctions, archDraws, connectionDraws, placedParts };
}
export type BuildingPublication = Awaited<ReturnType<typeof prepareBuildingPublication>>;

export function buildingPreviewInput(
  design: BuildingDesign,
  publication: BuildingPublication,
  stripPlans?: readonly { binding_id: string; cells: SupportCell[] }[]
): ProfilePreviewInput {
  assertBuildingPublication(design, publication);
  const { contactHoles, decorations } = publication.prepared;
  const surfaces: ProfilePreviewInput["surfaces"] = design.profileSupports.map((p) => {
    const palette = {
      wallColor: p.group.wallColor,
      woodColor: p.group.woodColor,
      roofColor: p.roofParameters?.color ?? normalizeProfileRoof({}).color
    };
    const common = { id: p.id, seed: Number(p.seed), palette };
    if (p.part.support.generator === "wallStrip")
      return {
        ...common,
        kind: "strip" as const,
        binding: p.wallBinding,
        cells:
          stripPlans?.find((plan) => plan.binding_id === p.wallBinding.id)?.cells ??
          placeStripUnits(
            {
              id: p.id,
              variationKey: p.variationKey,
              rectangle: normalizeProfileFootprint(p.part.support.params).rectangle!,
              height: p.height,
              algorithm: resolvedArrangement(p.wallBinding),
              footprint: p.wallBinding.footprint
            },
            design.terrain
          )
      };
    const roof = p.roofParameters!;
    return {
      ...common,
      kind: "wall" as const,
      geometry: profileFor(design, p.id),
      wallGeometryId: p.wallBinding.geometry_id,
      parapetGeometryId: p.id + "-parapet-skin",
      wallBinding: p.wallPlacement ? p.wallBinding : undefined,
      roofBinding: p.roofBinding!,
      roofBoundary: { flat: isFlatRoofHeight(roof.height), rim: roof.flat_rim },
      ...(p.foundationParameters
        ? {
            foundation: {
              ...p.foundationParameters,
              binding: p.foundationPlacement ? p.foundationBinding : undefined,
              geometryId: p.foundationBinding!.geometry_id
            }
          }
        : {}),
      floors: p.floors,
      finish: p.finish,
      reservations: contactHoles.get(p.nativeId) ?? [],
      decorations: decorations.find((d) => d.owner === p.id)!
    };
  });

  return {
    surfaces,
    overrides: design.overrides,
    junctions: publication.junctions.filter((j) => j.role !== "wall_arch"),
    hostTerrain: true,
    spires: publication.prepared.spires,
    woodPillar: publication.prepared.woodPillar
  };
}

export function assertBuildingPublication(design: BuildingDesign, publication: BuildingPublication) {
  if (publication.design !== design) throw Error("Building publication belongs to a different design");
}

/** Small, frame-local inspection result published atomically with the geometry.
 * Author input is never consulted by the camera after publication. */
export interface BuildingFocusPose {
  part: string;
  position: number[];
  forward?: number[];
  /** Native attachment renderers bind this result to the author's rigid node. */
  attachment?: true;
}
export function buildingFocusPoses(
  design: BuildingDesign,
  parts: readonly import("../../runtime/ProfilePreview").ConstructionPreviewPart[]
): BuildingFocusPose[] {
  const authors = new Set(design.parts.flatMap((p) => (p.identity.kind === "author" ? [p.identity.id] : [])));
  const bounds = new Map<string, { min: number[]; max: number[] }>();
  for (const mesh of parts) {
    const id = mesh.pickId ?? mesh.geometryId;
    if (id === undefined || !authors.has(id)) continue;
    const box = bounds.get(id) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const index of mesh.indices)
      for (let a = 0; a < 3; a++) {
        const value = mesh.positions[index * 3 + a];
        box.min[a] = Math.min(box.min[a], value);
        box.max[a] = Math.max(box.max[a], value);
      }
    bounds.set(id, box);
  }
  const poses = new Map<string, BuildingFocusPose>();
  for (const [part, box] of bounds)
    if (box.min.every(Number.isFinite) && box.max.every(Number.isFinite))
      poses.set(part, { part, position: box.min.map((v, a) => (v + box.max[a]) / 2) });
  for (const decoration of design.prepared.decorations)
    for (const { decorationId, mount } of decoration.mounts) {
      if (!authors.has(decorationId)) throw Error("Focus mount has no author part");
      const normal = mount.axes[2],
        length = Math.hypot(...normal);
      poses.set(decorationId, {
        part: decorationId,
        position: [...mount.origin],
        ...(length > 0 ? { forward: normal.map((v) => v / length) } : {}),
        attachment: true
      });
    }
  return [...poses.values()];
}
