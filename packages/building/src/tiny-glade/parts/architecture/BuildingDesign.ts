import {
  authoredDesignPart,
  buildingAuthorKey,
  buildingDesignKey,
  validateDesignParts,
  type BuildingDesignPart,
  type BuildingDesignIdentity,
  type BuildingDesignKey
} from "./BuildingDesignIdentity";
export type { BuildingDesignPart } from "./BuildingDesignIdentity";
import { wallStitchRecordFormat } from "../algorithms/WallStitches";
import { roofMerlonRecordFormat } from "../algorithms/RoofMerlons";
import { stoneArchRecordFormat, woodArchRecordFormat } from "../algorithms/ArchMembers";
import { attachmentRecordFormat } from "../algorithms/MountAttachment";
import { dormerRoofRecordFormat } from "../algorithms/CottageDormerCourses";
import { roofSpireRecordFormat } from "../algorithms/RoofSpire";
import { parseUnitPlacementOverrides } from "../../runtime/UnitPlacement";
import { parseDecorationSpecs } from "../../runtime/DecorationParameters";
import { resolveBuildingProfileSupports } from "./BuildingProfileSupports";
import { attachmentSpecification } from "./BuildingGenerators";
import { resolveBuildingConnections } from "./BuildingDesignRules";
import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import { interRoofMerlonPath } from "../../runtime/RecoveredInterRoofMerlons";
import { BuildingPath, buildingPose } from "../BuildingLayout";
import { planProfileContacts, type ProfileContactInputs } from "../../runtime/ProfileContacts";
import { publishWallConnectionOwner } from "../../runtime/WallConnectionPipeline";
import { isFlatRoofHeight } from "../../runtime/RoofMode";
import { normalizeProfileRoof, normalizeProfileHeight } from "../../runtime/ProfileParameters";
import { planProfileDecorations } from "../../runtime/ProfileDecorations";
import { profileRoofSpirePlacement } from "../../runtime/ProfileRoofSpire";
import { wallSurfaceGeometry } from "../../runtime/ConstructionArrangement";
import { buildRoofContext } from "../../runtime/RecoveredRoofContext";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";
import { profileSupportGenerators, type BuildingDraft, type BuildingBasePart } from "./BuildingDraft";

/** Geometry + relation resolution. Receives originals and never mutates them.
 * Contact/opening algorithms publish reservations before ordinary unit placement.
 * Existing European solvers are explicit here; this is not arbitrary-mesh CSG. */
export function designBuilding(draft: BuildingDraft, terrain: TerrainHeight, assets?: BuildingUnitAssets) {
  const connectionsResolved = resolveBuildingConnections(draft);
  draft = connectionsResolved.draft;
  const constraints = connectionsResolved.constraints;
  const profileSupports = resolveBuildingProfileSupports(draft, constraints, terrain);
  if (profileSupports.length && !assets) throw Error("Profile parts require a native building asset library");
  const owners = profileSupports;
  const bindingsByPart = new Map(
    profileSupports.flatMap((p) => [
      [p.part.id, p.wallBinding] as const,
      ...(p.roofPart ? [[p.roofPart.id, p.roofBinding!] as const] : []),
      ...(p.foundationPart ? [[p.foundationPart.id, p.foundationBinding!] as const] : [])
    ])
  );
  const bindings = draft.parts.flatMap((p) =>
    bindingsByPart.has(p.id) &&
    !["nativeMasonry", "foundationSurface"].includes(buildingPlacementAlgorithms.profile(p.algorithm.type).basis)
      ? [bindingsByPart.get(p.id)!]
      : []
  );
  const overrides = parseUnitPlacementOverrides(
    draft.parts.flatMap((p) => {
      const binding = bindingsByPart.get(p.id);
      if (!p.regions?.length) return [];
      if (!binding || !bindings.some((b) => b.id === binding.id))
        throw Error("Local UV edits require a profile placement: " + p.id);
      const edits = p.regions.map((r) => {
        if (!r || typeof r.id !== "string" || !r.id) throw Error("Local edit requires a stable id");
        return { ...r, id: p.id + "/region/" + r.id, binding_id: binding.id };
      });
      const checked = parseUnitPlacementOverrides(edits, [binding]);
      return checked;
    }),
    bindings
  );
  const attachmentHosts = new Map<string, "wall" | "roof">();
  for (const p of draft.parts) {
    if (p.support.generator === "wallProfile" && !profileSupports.find((w) => w.part.id === p.id)?.roofPart)
      throw Error("Missing wallRoofJoint relation for " + p.id);
    if (["roofProfile", "foundationProfile"].includes(p.support.generator) && !bindingsByPart.has(p.id))
      throw Error("Unconnected profile support " + p.id);
    if (p.support.generator !== "attachmentMount") continue;
    const links = constraints.filter((r) => r.from === p.id && r.kind === "attachment");
    if (links.length !== 1) throw Error("Attachment requires one explicit host relation: " + p.id);
    const owner = profileSupports.find((w) => w.part.id === links[0].to || w.roofPart?.id === links[0].to);
    if (!owner || owner.part.support.generator !== "wallProfile" || owner.group.id !== p.group)
      throw Error("Attachment host is not a profile surface in its group: " + p.id);
    attachmentHosts.set(p.id, owner.part.id === links[0].to ? "wall" : "roof");
  }
  // Participation is selected from the authored support and its explicit relation.
  // Contact algorithms receive only the resolved geometry/style they consume.
  const contacts: ProfileContactInputs = {
    walls: [],
    roofs: [],
    slots: new Map(owners.map((o) => [o.nativeId, o.slot]))
  };
  const walls = [],
    roofs = [];
  for (const part of draft.parts) {
    if (part.support.generator !== "wallProfile") continue;
    const owner = profileSupports.find((o) => o.part.id === part.id)!;
    const roofPart = owner.roofPart;
    if (!roofPart) throw Error(`Missing roof relation for contact support ${part.id}`);
    const roofParameters = normalizeProfileRoof(roofPart.support.params.roof);
    const material = owner.structureMaterial;
    walls.push(
      publishWallConnectionOwner(
        {
          id: owner.nativeId,
          seed: owner.wallSeed,
          unitScale: owner.unitScale,
          shape: owner.shape,
          height: normalizeProfileHeight(part.support.params.height),
          elevation: -3.4028234663852886e38,
          material,
          style: 0,
          foundationOffset: 0,
          roof: { height01: roofParameters.height, flatRoofStyle: roofParameters.flat_rim }
        },
        terrain,
        isFlatRoofHeight(roofParameters.height)
          ? {
              ...owner.profile,
              top: owner.profile.top.map(() => owner.profile.topY),
              maxY: owner.profile.topY,
              maxYGable: owner.profile.topY
            }
          : owner.profile
      )
    );
    roofs.push({
      nativeId: owner.nativeId,
      seed: owner.seed,
      slot: owner.slot,
      roofSeed: owner.roofSeed,
      roofUnitScale: owner.roofUnitScale,
      shape: owner.shape,
      roof: owner.roof!,
      profile: owner.profile,
      material
    });
  }
  contacts.walls = walls;
  contacts.roofs = roofs;
  const { connections, merlons, contactHoles } = planProfileContacts(contacts, terrain);
  const decorations = owners
    .filter((o) => o.part.support.generator === "wallProfile")
    .map((o) => ({
      owner: o.id,
      ...planProfileDecorations(
        {
          id: o.id,
          ...(o.variationKey !== undefined ? { variationKey: o.variationKey } : {}),
          seed: Number(o.seed),
          wallMaterial: o.structureMaterial,
          woodColor: draft.groups.find((g) => g.id === o.id)!.woodColor,
          roof: o.roof!,
          wallEnvelope: o.wallEnvelope
        },
        o.shape,
        o.profile,
        parseDecorationSpecs(
          draft.parts
            .filter((p) => p.group === o.id && p.support.generator === "attachmentMount")
            .map((p) => ({
              ...attachmentSpecification(p, attachmentHosts.get(p.id) === "wall" ? o.shape : undefined),
              host: attachmentHosts.get(p.id)!
            }))
        ),
        contactHoles.get(o.nativeId) ?? [],
        {
          wallSlot: o.slot,
          assets: assets!,
          seed: Number(o.seed),
          roofBinding: o.roofBinding
        }
      )
    }));
  for (const owner of owners) {
    const profile = decorations.find((d) => d.owner === owner.id)?.wallProfile;
    if (profile) owner.profile = { ...owner.profile, ...profile };
  }
  const prepared = {
    owners,
    connections,
    merlons,
    contactHoles,
    decorations,
    woodPillar: decorations.some((d) => d.woodArchPillars?.length) ? assets!.woodPillar : undefined,
    timings: { total: 0 }
  };
  const supports = new Map<BuildingDesignKey, any>();
  for (const p of draft.parts) {
    const owner = profileSupports.find((o) => o.part.id === p.id || o.roofPart?.id === p.id);
    if (!owner) continue;
    if (p.support.generator === "wallProfile")
      supports.set(buildingAuthorKey(p.id), {
        profile: owner.profile,
        geometry: wallSurfaceGeometry(p.id, owner.profile, owner.wallRoofJoint),
        reservations: [
          ...(contactHoles.get(owner.nativeId) ?? []),
          ...(decorations.find((d) => d.owner === p.group)?.holes ?? [])
        ]
      });
    if (p.support.generator === "roofProfile" && (owner.roofParameters?.height ?? 0) > 0.1)
      supports.set(buildingAuthorKey(p.id), {
        parameters: owner.roof!,
        geometry: buildRoofContext({
          id: p.group,
          ...owner.roof!,
          renderSlot: owner.slot,
          holes: decorations.find((d) => d.owner === p.group)?.roofOpenings ?? []
        }).geometry
      });
  }
  const spireParts: BuildingDesignPart[] = owners.flatMap((owner) => {
    if (owner.part.support.generator !== "wallProfile" || !owner.roof || !owner.roofPart) return [];
    const placement = profileRoofSpirePlacement(owner.roof);
    if (!placement) return [];
    const identity: BuildingDesignIdentity = {
      kind: "derived",
      producer: "roof-spire",
      source: { kind: "parts", ids: [owner.roofPart.id] },
      localId: "spire"
    };
    const algorithm = owner.roofPart.params.spireAlgorithm ?? "placeRoofSpire";
    if (typeof algorithm !== "string" || !algorithm) throw Error("Spire algorithm must be a registered name");
    supports.set(buildingDesignKey(identity), {
      type: "point",
      pose: buildingPose(placement.origin, [1, 0, 0], [0, 1, 0])
    });
    return [
      {
        identity,
        selection: { kind: "group", id: owner.id },
        group: owner.id,
        type: "roof-spire",
        publication: { format: roofSpireRecordFormat },
        support: { generator: "point", params: { position: placement.origin } },
        algorithm: { type: algorithm },
        unit: { libraryMesh: "roofSpire" as const },
        params: { radius: placement.radius, profile: placement.profile }
      }
    ];
  });
  const connectionParts: BuildingDesignPart[] = connections.candidates.map((candidate, index) => {
    const { point, minY, maxY, ...params } = candidate;
    return {
      identity: {
        kind: "derived",
        producer: "wall-junction",
        source: { kind: "parts", ids: candidate.wallIds.map((id) => owners.find((o) => o.nativeId === id)!.part.id) },
        localId: String(index)
      },
      selection: { kind: "group", id: owners.find((o) => o.nativeId === candidate.wallIds[0])!.id },
      group: owners.find((o) => o.nativeId === candidate.wallIds[0])!.id,
      type: "wall-junction",
      publication: { format: wallStitchRecordFormat, candidate: index },
      support: {
        generator: "path",
        params: {
          points: [
            [point[0], minY, point[1]],
            [point[0], maxY, point[1]]
          ]
        }
      },
      algorithm: { type: "wallStitches" },
      unit: candidate.beam ? "wooden_plank" : "brick",
      params
    };
  });
  const roofConnectionParts: BuildingDesignPart[] = merlons.candidates.map((candidate, index) => {
    const owner = contacts.roofs.find((o) => o.nativeId === candidate.flatId)!;
    return {
      identity: {
        kind: "derived",
        producer: "roof-junction",
        source: {
          kind: "parts",
          ids: [candidate.flatId, candidate.pitchedId].map((id) => owners.find((o) => o.nativeId === id)!.roofPart!.id)
        },
        localId: String(index)
      },
      selection: { kind: "group", id: owners.find((o) => o.nativeId === candidate.flatId)!.id },
      group: owners.find((o) => o.nativeId === candidate.flatId)!.id,
      type: "roof-junction",
      publication: { format: roofMerlonRecordFormat, candidate: index },
      support: {
        generator: "path",
        params: { points: interRoofMerlonPath(candidate).points.map(([x, z]) => [x, candidate.y, z]) }
      },
      algorithm: { type: "roofMerlons" },
      unit: owner.material === 1 ? "wooden_plank" : "brick",
      params: {
        unitScale: owner.roofUnitScale,
        seed: owner.roofSeed,
        appearanceSeed: owner.roofSeed ?? owner.seed ?? owner.nativeId,
        slot: owner.slot,
        material: owner.material,
        edgeMode: owner.roof.surface.edge_mode
      }
    };
  });
  const attachmentParts: BuildingDesignPart[] = [];
  for (const decoration of decorations)
    for (const planned of decoration.mounts) {
      const source = draft.parts.find(
        (p) =>
          p.group === decoration.owner && p.support.generator === "attachmentMount" && p.id === planned.decorationId
      );
      if (!source) throw Error("Resolved attachment has no authored part: " + planned.decorationId);
      attachmentParts.push({
        ...authoredDesignPart(source),
        publication: { format: attachmentRecordFormat, decorationId: planned.decorationId },
        params: { ...source.params, placement: planned.placement }
      });
      supports.set(buildingAuthorKey(source.id), { type: "point", attachment: planned.mount });
    }
  // An attachment without an accepted mount cannot execute a custom placement.
  // Do not silently skip the authored algorithm after a rejected installation.
  for (const part of draft.parts)
    if (
      part.support.generator === "attachmentMount" &&
      part.algorithm.type !== "mountAttachment" &&
      !attachmentParts.some((p) => p.identity.kind === "author" && p.identity.id === part.id)
    )
      throw Error("Attachment has no accepted mount: " + part.id);
  const dormerRoofParts: BuildingDesignPart[] = decorations.flatMap((decoration) =>
    decoration.dormerRoofs.map((planned) => {
      const source = draft.parts.find(
        (p) =>
          p.group === decoration.owner && p.support.generator === "attachmentMount" && p.id === planned.decorationId
      );
      if (!source) throw Error("Dormer roof has no authored attachment: " + planned.decorationId);
      const profiled = "profiles" in planned.support;
      const generator = profiled ? "profiledDormerRoof" : "cottageDormerRoof";
      const identity: BuildingDesignIdentity = {
        kind: "derived",
        producer: "dormer-roof",
        source: { kind: "parts", ids: [source.id] },
        localId: "roof"
      };
      const algorithm = source.params.roofAlgorithm ?? (profiled ? "profiledDormerCourses" : "cottageDormerCourses");
      if (typeof algorithm !== "string" || !algorithm) throw Error("Dormer roof algorithm must be a registered name");
      supports.set(
        buildingDesignKey(identity),
        profiled
          ? { type: "surface", profiledRoof: planned.support }
          : { type: "surface", cottageRoof: planned.support }
      );
      return {
        identity,
        selection: { kind: "part", id: source.id },
        group: decoration.owner,
        type: "dormer-roof",
        publication: { format: dormerRoofRecordFormat, decorationId: planned.decorationId },
        support: { generator, params: planned.support },
        algorithm: { type: algorithm },
        unit: profileSupports.find((p) => p.id === decoration.owner)!.roofBinding!.unit_id,
        params: planned.placement
      };
    })
  );
  const archParts: BuildingDesignPart[] = decorations.flatMap((decoration) =>
    decoration.arches.map((arch): BuildingDesignPart => {
      const identity: BuildingDesignIdentity = {
        kind: "derived",
        producer: "arch-members",
        source: { kind: "parts", ids: [arch.decorationId] },
        localId: "arch"
      };
      return {
        identity,
        selection: { kind: "part", id: arch.decorationId },
        group: decoration.owner,
        type: "arch-members",
        publication: {
          format: arch.kind === "stone" ? stoneArchRecordFormat : woodArchRecordFormat,
          decorationId: arch.decorationId,
          colorId: arch.colorId
        },
        support: { generator: "path", params: { points: arch.plan.cut.points } },
        algorithm: { type: arch.kind === "stone" ? "stoneArchCourses" : "woodArchMembers" },
        unit:
          arch.kind === "stone" ? "brick" : { nativeAttachment: { kind: "opening", type: "opening-arch", rank: 1 } },
        params: arch.plan.placement
      };
    })
  );
  for (const part of [...connectionParts, ...roofConnectionParts, ...archParts])
    supports.set(buildingDesignKey(part.identity), {
      type: "path",
      path: new BuildingPath(part.support.params.points)
    });
  // Validate after replacement and derivation, before any placement/publication.
  const resolvedParts: BuildingDesignPart[] = [
    ...connectionParts,
    ...roofConnectionParts,
    ...archParts,
    ...attachmentParts,
    ...dormerRoofParts,
    ...spireParts,
    ...draft.parts
      .filter((p) => !attachmentParts.some((a) => a.identity.kind === "author" && a.identity.id === p.id))
      .map(authoredDesignPart),
    ...connectionsResolved.derived
  ].map((part) =>
    !profileSupportGenerators.has(part.support.generator) && part.params.seed === "source"
      ? { ...part, params: { ...part.params, seed: draft.groups.find((g) => g.id === part.group)!.seed } }
      : part
  );
  validateDesignParts(resolvedParts, draft);
  return {
    diagnostics: decorations.flatMap((d) => d.diagnostics.map((item) => ({ ...item, part: item.id }))),
    profileSupports,
    contacts,
    groups: draft.groups,
    parts: resolvedParts,
    bindings,
    overrides,
    prepared,
    supports,
    terrain,
    assets: assets!
  };
}
export type BuildingDesign = ReturnType<typeof designBuilding>;
