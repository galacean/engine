import type { SeedWorldHydrologyBake } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import type { SeedWorldHydrologyBodyGeometry, SeedWorldHydrologyTopology } from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyTopology";
import { SEED_WORLD_SEA_LEVEL_METRES } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  SEED_WORLD_HYDROLOGY_SOLVER_VERSION,
  type SeedWorldHydrologySolveResultV1,
  type SeedWorldLakeBasinSupportSampleV1,
  type SeedWorldSolvedWaterBodyV1
} from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldHydrologyArtifact";
import type { SeedWorldWaterGridTransformV1 } from "@galacean/engine-water/world/SeedWorldWaterGrid";
import { decodeR16HeightMillimetres } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldCanonicalNaturalTerrain";
import { encodeVerticalMetres } from "@galacean/engine-water/world/WaterMetricEncodingV1";
import { SeedWorldLakeCandidateRejectionError } from "@galacean/engine-water/world/SeedWorldLakeCandidate";

const ANALYSIS_RESOLUTION = 129;
const OWNERSHIP_DRY = -1;
const OCEAN_SOLVER_BODY_HANDLE = "seed-world-boundary-ocean";
// Canonical Ownership retains the sealed Hydrology clearance margin. The
// Water render adapter refines only this boundary halo back to the exact
// continuous Hfinal sea-level crossing, without changing semantic ownership.
const OCEAN_MINIMUM_OWNERSHIP_DEPTH_METRES = 0.1;

export interface CompileSeedWorldPlannedHydrologySolveResultInputV1 {
  /** Topology already selected for the two-dimensional world plan. */
  readonly topology: SeedWorldHydrologyTopology;
  /** Terrain and exact water footprints baked from that same topology. */
  readonly bake: SeedWorldHydrologyBake;
  /** Exact H0 samples that selected the topology, used only for stable identity anchors. */
  readonly analysisHeightMetres: Float32Array;
  readonly transform: SeedWorldWaterGridTransformV1;
  /** Tentative body whose natural feasibility may be rejected without weakening final Solve contracts. */
  readonly recoverableCandidateBodyId?: string;
}

export interface SeedWorldPlannedHydrologyDiagnosticsV1 {
  readonly source: "planned-basin-topology-v1";
  readonly bodyCount: number;
  readonly oceanOwnershipCellCount: number;
  readonly plannedStorageVertexCount: number;
  readonly wetOwnershipCellCount: number;
  readonly semanticFloatBranchCount: 0;
}

/**
 * Promotes the Basin/Topology already shown by the planning page into the sealed Hydrology contract.
 * It never discovers another Lake from Hfinal, a render mask, an SDF, or Water geometry.
 */
export class SeedWorldPlannedHydrologySolveResultV1 implements SeedWorldHydrologySolveResultV1 {
  readonly solverVersion = SEED_WORLD_HYDROLOGY_SOLVER_VERSION;
  readonly bodies: readonly Readonly<SeedWorldSolvedWaterBodyV1>[];
  readonly diagnostics: Readonly<SeedWorldPlannedHydrologyDiagnosticsV1>;
  private _released = false;

  constructor(
    private readonly _bodyHandles: readonly string[],
    private readonly _waterLevelsMillimetres: Int32Array,
    private readonly _ownershipBodyOrdinals: Int16Array,
    private readonly _plannedStorageBodyOrdinals: Int16Array,
    private readonly _ownershipResolution: number,
    bodies: readonly Readonly<SeedWorldSolvedWaterBodyV1>[],
    diagnostics: Readonly<SeedWorldPlannedHydrologyDiagnosticsV1>
  ) {
    this.bodies = Object.freeze(bodies);
    this.diagnostics = diagnostics;
  }

  readonly ownershipAt = (x: number, z: number): string | null | undefined => {
    this._requireActive();
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(z) ||
      x < 0 ||
      z < 0 ||
      x >= this._ownershipResolution ||
      z >= this._ownershipResolution
    ) {
      throw new RangeError("Planned Hydrology Ownership coordinate lies outside the selected Grid Profile.");
    }
    const ordinal = this._ownershipBodyOrdinals[z * this._ownershipResolution + x]!;
    if (ordinal === OWNERSHIP_DRY) return null;
    const handle = this._bodyHandles[ordinal];
    if (!handle) throw new Error(`Planned Hydrology Ownership references missing body ordinal ${ordinal}.`);
    return handle;
  };

  readonly lakeBasinSupportAt = (
    analysisX: number,
    analysisZ: number
  ): Readonly<SeedWorldLakeBasinSupportSampleV1> | null | undefined => {
    this._requireActive();
    if (
      !Number.isInteger(analysisX) ||
      !Number.isInteger(analysisZ) ||
      analysisX < 0 ||
      analysisZ < 0 ||
      analysisX >= ANALYSIS_RESOLUTION ||
      analysisZ >= ANALYSIS_RESOLUTION
    ) {
      throw new RangeError("Planned Lake Basin coordinate lies outside the canonical Analysis Grid.");
    }
    const ordinal = this._plannedStorageBodyOrdinals[analysisZ * ANALYSIS_RESOLUTION + analysisX]!;
    if (ordinal === OWNERSHIP_DRY) return null;
    const solverBodyHandle = this._bodyHandles[ordinal];
    if (!solverBodyHandle) throw new Error(`Planned Lake Basin references missing body ordinal ${ordinal}.`);
    return Object.freeze({
      solverBodyHandle,
      plannedStorage: true,
      minimumConnectionLevelMillimetres: this._waterLevelsMillimetres[ordinal]!
    });
  };

  release(): void {
    this._released = true;
  }

  private _requireActive(): void {
    if (this._released) throw new Error("Planned HydrologySolveResult has been released.");
  }
}

export function compileSeedWorldPlannedHydrologySolveResultV1(
  input: Readonly<CompileSeedWorldPlannedHydrologySolveResultInputV1>
): SeedWorldPlannedHydrologySolveResultV1 {
  const { topology, bake, transform, analysisHeightMetres } = input;
  if (bake.topology !== topology) {
    throw new Error("Planned Hydrology Bake must retain the exact selected Topology object.");
  }
  if (
    topology.analysisGrid.resolution !== ANALYSIS_RESOLUTION ||
    Math.round(topology.analysisGrid.spacingMetres * 1_000) !== transform.analysisSpacingMillimetres ||
    Math.round(topology.sizeMetres * 1_000) !== transform.worldSizeXMillimetres ||
    transform.worldSizeXMillimetres !== transform.worldSizeZMillimetres
  ) {
    throw new Error("Planned Hydrology Topology does not match the canonical World Grid.");
  }
  if (analysisHeightMetres.length !== ANALYSIS_RESOLUTION ** 2) {
    throw new RangeError("Planned Hydrology H0 must match the canonical Analysis Grid.");
  }
  if (
    bake.fields.surfaceResolution !== transform.ownershipResolution ||
    bake.fields.heightResolution !== transform.hfinalResolution
  ) {
    throw new Error("Planned Hydrology Bake does not match the selected Hfinal/Ownership Grid Profile.");
  }
  if (topology.bodies.length !== bake.waterBodies.length) {
    throw new Error("Planned Hydrology requires one baked WaterBody for every selected Topology body.");
  }

  const bakedBodyById = new Map(bake.waterBodies.map((body) => [body.id, body]));
  const bodyHandles = [OCEAN_SOLVER_BODY_HANDLE, ...topology.bodies.map((body) => body.id)];
  const waterLevelsMillimetres = new Int32Array(bodyHandles.length);
  const ownershipBodyOrdinals = new Int16Array(transform.ownershipResolution ** 2);
  ownershipBodyOrdinals.fill(OWNERSHIP_DRY);
  const plannedStorageBodyOrdinals = new Int16Array(ANALYSIS_RESOLUTION ** 2);
  plannedStorageBodyOrdinals.fill(OWNERSHIP_DRY);
  let plannedStorageVertexCount = 0;
  const oceanOrdinal = 0;
  const oceanMask = compileBoundaryConnectedOceanMask(bake, transform);
  let oceanOwnershipCellCount = 0;
  for (let cell = 0; cell < oceanMask.length; cell++) {
    if (oceanMask[cell] === 0) continue;
    ownershipBodyOrdinals[cell] = oceanOrdinal;
    oceanOwnershipCellCount++;
  }
  if (oceanOwnershipCellCount === 0) {
    throw new Error("BOUNDARY_CONNECTED_OCEAN_HAS_NO_OWNERSHIP");
  }
  const oceanWaterLevelMillimetres = encodeVerticalMetres(
    SEED_WORLD_SEA_LEVEL_METRES,
    "seed-world-ocean.waterLevelMetres"
  );
  waterLevelsMillimetres[oceanOrdinal] = oceanWaterLevelMillimetres;
  const ocean: Readonly<SeedWorldSolvedWaterBodyV1> = Object.freeze({
    solverBodyHandle: OCEAN_SOLVER_BODY_HANDLE,
    waterType: "ocean",
    canonicalTopologyKey: Object.freeze({
      kind: "ocean-v1",
      boundaryPortalAnchorVertexIds: compileOceanBoundaryPortalAnchorVertexIds()
    }),
    uniformSurfaceHeightMillimetres: oceanWaterLevelMillimetres,
    receiverSolverBodyHandles: Object.freeze([])
  });
  let wetOwnershipCellCount = oceanOwnershipCellCount;

  const lakes = topology.bodies.map((body, lakeIndex) => {
    const ordinal = lakeIndex + 1;
    const bakedBody = bakedBodyById.get(body.id);
    if (!bakedBody) throw new Error(`Planned Topology body '${body.id}' has no matching Bake body.`);
    if (
      bakedBody.resolution !== transform.ownershipResolution ||
      bakedBody.wetMask.length !== ownershipBodyOrdinals.length
    ) {
      throw new Error(`Planned Bake body '${body.id}' does not match the Ownership Grid.`);
    }
    const waterLevelMillimetres = encodeVerticalMetres(body.waterLevelMetres, `${body.id}.waterLevelMetres`);
    waterLevelsMillimetres[ordinal] = waterLevelMillimetres;
    for (let vertex = 0; vertex < body.wetMask.length; vertex++) {
      if (body.wetMask[vertex] === 0) continue;
      const existing = plannedStorageBodyOrdinals[vertex]!;
      if (existing !== OWNERSHIP_DRY) {
        throwCandidateRejectionOrContract(
          body.id,
          input.recoverableCandidateBodyId,
          "planned-topology-overlap",
          `PLANNED_LAKE_TOPOLOGY_OVERLAP: '${bodyHandles[existing]}' and '${body.id}' share Analysis vertex ${vertex}.`
        );
      }
      plannedStorageBodyOrdinals[vertex] = ordinal;
      plannedStorageVertexCount++;
    }
    for (let cell = 0; cell < bakedBody.wetMask.length; cell++) {
      if (bakedBody.wetMask[cell] === 0) continue;
      const existing = ownershipBodyOrdinals[cell]!;
      if (existing !== OWNERSHIP_DRY) {
        throwCandidateRejectionOrContract(
          body.id,
          input.recoverableCandidateBodyId,
          "planned-ownership-overlap",
          `PLANNED_LAKE_OWNERSHIP_OVERLAP: '${bodyHandles[existing]}' and '${body.id}' share Ownership cell ${cell}.`
        );
      }
      ownershipBodyOrdinals[cell] = ordinal;
      wetOwnershipCellCount++;
    }
    const sinkVertexId = minimumHeightVertex(body, analysisHeightMetres);
    const outletVertexId = shorelineOutletVertex(body, analysisHeightMetres, sinkVertexId);
    return Object.freeze<SeedWorldSolvedWaterBodyV1>({
      solverBodyHandle: body.id,
      waterType: "lake",
      canonicalTopologyKey: Object.freeze({
        kind: "lake-v1",
        basinSinkAnchorVertexIds: Object.freeze([sinkVertexId]),
        outletNodeKey: Object.freeze({ kind: "lake-outlet", identityVertexId: outletVertexId })
      }),
      uniformSurfaceHeightMillimetres: waterLevelMillimetres,
      basinId: body.id,
      outletId: `${body.id}:outlet:${outletVertexId}`,
      lakeShorelineMode: "planned-footprint",
      receiverSolverBodyHandles: Object.freeze([])
    });
  });

  if (bakedBodyById.size !== lakes.length) {
    throw new Error("Planned Hydrology Bake contains a WaterBody absent from the selected Topology.");
  }
  for (let lakeIndex = 0; lakeIndex < topology.bodies.length; lakeIndex++) {
    const ordinal = lakeIndex + 1;
    if (!plannedStorageBodyOrdinals.includes(ordinal)) {
      throwCandidateRejectionOrContract(
        bodyHandles[ordinal]!,
        input.recoverableCandidateBodyId,
        "invalid-or-disconnected-footprint",
        `Planned Topology body '${bodyHandles[ordinal]}' owns no Analysis storage vertex.`
      );
    }
    if (!ownershipBodyOrdinals.includes(ordinal)) {
      throwCandidateRejectionOrContract(
        bodyHandles[ordinal]!,
        input.recoverableCandidateBodyId,
        "invalid-or-disconnected-footprint",
        `Planned Topology body '${bodyHandles[ordinal]}' owns no final water cell.`
      );
    }
  }
  const bodies = Object.freeze([ocean, ...lakes]);
  return new SeedWorldPlannedHydrologySolveResultV1(
    Object.freeze(bodyHandles),
    waterLevelsMillimetres,
    ownershipBodyOrdinals,
    plannedStorageBodyOrdinals,
    transform.ownershipResolution,
    Object.freeze(bodies),
    Object.freeze({
      source: "planned-basin-topology-v1",
      bodyCount: bodies.length,
      oceanOwnershipCellCount,
      plannedStorageVertexCount,
      wetOwnershipCellCount,
      semanticFloatBranchCount: 0 as const
    })
  );
}

function throwCandidateRejectionOrContract(
  bodyId: string,
  recoverableCandidateBodyId: string | undefined,
  reason: "planned-topology-overlap" | "planned-ownership-overlap" | "invalid-or-disconnected-footprint",
  message: string
): never {
  if (bodyId === recoverableCandidateBodyId) {
    throw new SeedWorldLakeCandidateRejectionError(reason, message);
  }
  throw new Error(message);
}

/**
 * Classifies only below-sea-level Hfinal connected to the bounded world edge.
 * Planned Lakes retain their own ownership. River mouths and other terrain
 * below the authoritative sea level remain part of the sea whenever they are physically connected to
 * it; the legacy presentation water mask must not move the coastline seaward.
 * Hydrology—not Water—remains the semantic owner.
 */
function compileBoundaryConnectedOceanMask(
  bake: Readonly<SeedWorldHydrologyBake>,
  transform: Readonly<SeedWorldWaterGridTransformV1>
): Uint8Array {
  const fields = bake.fields;
  const resolution = transform.ownershipResolution;
  if (fields.surfaceResolution !== resolution) {
    throw new Error("Planned Ocean classification requires the canonical Ownership-resolution surface field.");
  }
  const inlandOwnership = new Uint8Array(resolution * resolution);
  for (const body of bake.waterBodies) {
    if (body.resolution !== resolution || body.wetMask.length !== inlandOwnership.length) {
      throw new Error(`Planned Lake '${body.id}' does not match Ocean Ownership resolution.`);
    }
    for (let cell = 0; cell < body.wetMask.length; cell++) {
      if (body.wetMask[cell] !== 0) inlandOwnership[cell] = 1;
    }
  }

  const candidate = new Uint8Array(resolution * resolution);
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const index = z * resolution + x;
      if (inlandOwnership[index] !== 0) continue;
      if (isOwnershipCellBelowOceanLevel(fields.heightSamples, transform, x, z)) {
        candidate[index] = 1;
      }
    }
  }

  const ocean = new Uint8Array(candidate.length);
  const queue: number[] = [];
  const enqueue = (x: number, z: number): void => {
    const index = z * resolution + x;
    if (candidate[index] === 0 || ocean[index] !== 0) return;
    ocean[index] = 1;
    queue.push(index);
  };
  for (let coordinate = 0; coordinate < resolution; coordinate++) {
    enqueue(coordinate, 0);
    enqueue(coordinate, resolution - 1);
    enqueue(0, coordinate);
    enqueue(resolution - 1, coordinate);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]!;
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    if (x > 0) enqueue(x - 1, z);
    if (x + 1 < resolution) enqueue(x + 1, z);
    if (z > 0) enqueue(x, z - 1);
    if (z + 1 < resolution) enqueue(x, z + 1);
  }
  return ocean;
}

function isOwnershipCellBelowOceanLevel(
  heightSamples: Uint16Array,
  transform: Readonly<SeedWorldWaterGridTransformV1>,
  ownershipX: number,
  ownershipZ: number
): boolean {
  const spacing = transform.hfinalSpacingMillimetres;
  const maximumVertex = transform.hfinalResolution - 1;
  const xOffsetMillimetres = ownershipX * transform.ownershipCellMillimetres + transform.ownershipCellMillimetres / 2;
  const zOffsetMillimetres = ownershipZ * transform.ownershipCellMillimetres + transform.ownershipCellMillimetres / 2;
  const x0 = Math.min(maximumVertex, Math.floor(xOffsetMillimetres / spacing));
  const z0 = Math.min(maximumVertex, Math.floor(zOffsetMillimetres / spacing));
  const x1 = Math.min(maximumVertex, x0 + 1);
  const z1 = Math.min(maximumVertex, z0 + 1);
  const remainderX = x1 === x0 ? 0 : xOffsetMillimetres - x0 * spacing;
  const remainderZ = z1 === z0 ? 0 : zOffsetMillimetres - z0 * spacing;
  const inverseX = spacing - remainderX;
  const inverseZ = spacing - remainderZ;
  const sample = (x: number, z: number): bigint =>
    BigInt(decodeR16HeightMillimetres(heightSamples[z * transform.hfinalResolution + x]!));
  const weightedHeightMillimetres =
    sample(x0, z0) * BigInt(inverseX) * BigInt(inverseZ) +
    sample(x1, z0) * BigInt(remainderX) * BigInt(inverseZ) +
    sample(x0, z1) * BigInt(inverseX) * BigInt(remainderZ) +
    sample(x1, z1) * BigInt(remainderX) * BigInt(remainderZ);
  const denominator = BigInt(spacing) * BigInt(spacing);
  const maximumOceanBedMillimetres = BigInt(
    Math.round((SEED_WORLD_SEA_LEVEL_METRES - OCEAN_MINIMUM_OWNERSHIP_DEPTH_METRES) * 1_000)
  );
  return weightedHeightMillimetres <= maximumOceanBedMillimetres * denominator;
}

function compileOceanBoundaryPortalAnchorVertexIds(): readonly number[] {
  const anchors: number[] = [];
  for (let z = 0; z < ANALYSIS_RESOLUTION; z++) {
    for (let x = 0; x < ANALYSIS_RESOLUTION; x++) {
      if (x !== 0 && z !== 0 && x !== ANALYSIS_RESOLUTION - 1 && z !== ANALYSIS_RESOLUTION - 1) continue;
      anchors.push(z * ANALYSIS_RESOLUTION + x);
    }
  }
  return Object.freeze(anchors);
}

function minimumHeightVertex(body: SeedWorldHydrologyBodyGeometry, heights: Float32Array): number {
  let selected = -1;
  let selectedHeight = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < body.wetMask.length; vertex++) {
    if (body.wetMask[vertex] === 0) continue;
    const height = heights[vertex]!;
    if (height < selectedHeight || (height === selectedHeight && vertex < selected)) {
      selected = vertex;
      selectedHeight = height;
    }
  }
  if (selected < 0) throw new Error(`Planned Topology body '${body.id}' has no storage vertex.`);
  return selected;
}

function shorelineOutletVertex(
  body: SeedWorldHydrologyBodyGeometry,
  heights: Float32Array,
  fallbackVertex: number
): number {
  let selected = -1;
  let selectedError = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < body.wetMask.length; vertex++) {
    if (body.wetMask[vertex] === 0 || !isShorelineVertex(body.wetMask, vertex)) continue;
    const error = Math.abs(heights[vertex]! - body.spillElevationMetres);
    if (error < selectedError || (error === selectedError && vertex < selected)) {
      selected = vertex;
      selectedError = error;
    }
  }
  return selected < 0 ? fallbackVertex : selected;
}

function isShorelineVertex(mask: Uint8Array, vertex: number): boolean {
  const x = vertex % ANALYSIS_RESOLUTION;
  const z = Math.floor(vertex / ANALYSIS_RESOLUTION);
  return (
    x === 0 ||
    z === 0 ||
    x === ANALYSIS_RESOLUTION - 1 ||
    z === ANALYSIS_RESOLUTION - 1 ||
    mask[vertex - 1] === 0 ||
    mask[vertex + 1] === 0 ||
    mask[vertex - ANALYSIS_RESOLUTION] === 0 ||
    mask[vertex + ANALYSIS_RESOLUTION] === 0
  );
}
