import { buildConstructionRoofSpire } from "./ConstructionRoofSpire";
import type { RoofSpireAsset } from "./RoofSpireAsset";
import { publishConstructionOwners, generateConstructionContacts } from "./ConstructionContacts";
import { compileConstructionDecorations } from "./ConstructionDecorations";
/** Source-only construction producer. Binary recovery/oracles are offline tests.
 * The same function is called by the Worker and command-line acceptance tests.
 * Author edits are separate from these disposable derived buffers.
 */
import { parseConstructionSource } from "./ConstructionSource";
import type { TerrainHeight } from "./PublishedWallProfile";
import { compileWallInFrame } from "./ConstructionWallFrame";
import { packWallPlaster } from "./WallPlasterPacking";
import type { GothicCollisionBounds } from "./GothicBlueprint";
import type { GothicGeometryAssets, ConstructionPositionMesh } from "./ConstructionGeometryAssets";
import { encodeCompleteConstructionDormerBins } from "./DormerBins";
import type { MasonryBinding } from "./MasonryDocument";
export interface ConstructionUnitAssets {
  decorations?: import("./ConstructionDecorationMeshes").ConstructionDecorationMeshes;
  decorationCollisions?: import("./ConstructionDecorationCollisions").ConstructionDecorationCollisions;
  stoneGeometry?: import("./ConstructionGeometryAssets").ConstructionStoneGeometry;
  windowCuts: import("./ConstructionWindowCutAsset").ConstructionWindowCutAsset;
  woodPillar?: ConstructionPositionMesh;
  roofSpire?: RoofSpireAsset;
  gothic: Record<1 | 2 | 3, { collisionBounds: GothicCollisionBounds; geometry?: GothicGeometryAssets }>;
}
export function concatenateRecords(records: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(records.reduce((n, b) => n + b.byteLength, 0));
  let p = 0;
  for (const b of records) {
    out.set(b, p);
    p += b.byteLength;
  }
  return out;
}
export function prepareConstruction(
  input: unknown,
  terrain: TerrainHeight,
  assets: ConstructionUnitAssets,
  bindings: readonly MasonryBinding[] = []
) {
  const began = performance.now(),
    timings: Record<string, number> = {};
  let mark = began;
  const stage = (name: string) => {
    const now = performance.now();
    timings[name] = now - mark;
    mark = now;
  };
  const source = parseConstructionSource(input),
    host = source.environment.type === "host_terrain";
  const owners = publishConstructionOwners(source, terrain, bindings);
  stage("publish");
  const { connections, merlons, contactHoles } = generateConstructionContacts(owners, terrain, host);
  stage("connections");
  const decorations = owners
    .filter((o) => !o.building.kind)
    .map((o) => ({
      owner: o.building.id,
      ...compileConstructionDecorations(
        o.building,
        o.shape,
        o.profile,
        o.building.decorations ?? [],
        contactHoles.get(o.nativeId) ?? [],
        {
          wallSlot: o.slot,
          assets,
          seed: Number(o.seed),
          wallEnvelope: o.wallEnvelope,
          roofBinding: bindings.find((b) => b.geometry_id === o.building.id + "-roof")
        }
      )
    }));
  for (const owner of owners) {
    const profile = decorations.find((d) => d.owner === owner.building.id)?.wallProfile;
    if (profile) owner.profile = { ...owner.profile, ...profile };
  }
  const spires = owners.flatMap((owner) => {
    const spire = buildConstructionRoofSpire(owner.building, owner.profile.topY, assets.roofSpire);
    return spire ? [spire] : [];
  });
  stage("spires");
  return {
    source,
    owners,
    connections,
    merlons,
    contactHoles,
    decorations,
    spires,
    woodPillar: decorations.some((d) => d.woodArchPillars?.length) ? assets.woodPillar : undefined,
    timings: { ...timings, total: performance.now() - began }
  };
}
export type PreparedConstruction = ReturnType<typeof prepareConstruction>;
/** Detail extends the same accepted preparation; it does not reinstall decorations or recompute contacts. */
export function compileConstruction(
  input: unknown,
  terrain: TerrainHeight,
  assets: ConstructionUnitAssets,
  bindings: readonly MasonryBinding[] = [],
  prepared = prepareConstruction(input, terrain, assets, bindings)
) {
  const began = performance.now(),
    timings: Record<string, number> = {};
  let mark = began;
  const stage = (name: string) => {
    const now = performance.now();
    timings[name] = now - mark;
    mark = now;
  };
  const { source, owners, connections, merlons, contactHoles, decorations, spires } = prepared;
  const host = source.environment.type === "host_terrain";
  const walls = owners
    .filter((o) => !o.building.kind)
    .map((o) => ({
      ...o,
      ...compileWallInFrame(
        o.building.id,
        o.wallSeed,
        o.slot,
        o.shape,
        o.profile,
        o.building.height,
        [...(contactHoles.get(o.nativeId) ?? []), ...(decorations.find((d) => d.owner === o.building.id)?.holes ?? [])],
        host,
        o.unitScale
      )
    }));
  stage("walls");
  const plaster = packWallPlaster(
    walls.map((w) => ({ mesh: w.plaster, slot: w.slot, controlLength: w.profile.control.length, closed: true }))
  );

  const roofAttachments = decorations.flatMap((d) => d.roofOpenings.map((h) => h.raw48));
  const dormerBins = encodeCompleteConstructionDormerBins(roofAttachments);
  stage("uploadPacking");
  return {
    source,
    // Keep the query's asset snapshot only for groups which actually use it;
    // ordinary houses must not transport an unused mesh in every Worker result.
    woodPillar: decorations.some((decoration) => decoration.woodArchPillars?.length) ? assets.woodPillar : undefined,
    owners,
    walls,
    connections,
    merlons,
    contactHoles,
    plaster,
    spires,
    decorations,
    dormerBins,
    timings: { ...prepared.timings, ...timings, total: prepared.timings.total + performance.now() - began }
  };
}
export type CompiledConstruction = ReturnType<typeof compileConstruction>;
