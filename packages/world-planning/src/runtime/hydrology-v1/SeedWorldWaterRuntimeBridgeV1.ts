import type { Entity } from "@galacean/engine-core";
import {
  createWaterBodyInstance,
  WaterBodySourceKind,
  type WaterBodySourceV1,
  type WaterOceanRepresentationStateV1
} from "@galacean/engine-water/water/index";

import type { WaterBodyAsset } from "@galacean/engine-water/water/index";
import {
  HEIGHTFIELD_WATER_BACKEND_ID,
  HeightfieldWaterBackend,
  type HeightfieldWaterBackendRuntimeContext
} from "@galacean/engine-water/water/runtime/heightfield/index";
import type {
  LakeWaterLevelRuntimeReadback,
  OceanWaterLevelRuntimeReadback,
  PreparedWaterSceneBodySetTransaction,
  WaterBodyBackend,
  WaterSceneBodyRequest
} from "@galacean/engine-water/water/runtime/index";
import {
  WaterGenerationPreparerV1,
  WaterSceneRuntimeHost,
  type PreparedWaterGenerationResourcesV1,
  type WaterGenerationPreparedTransferV1
} from "@galacean/engine-water/water/runtime/index";
import {
  assertOceanWaterBodyDescriptor,
  OCEAN_WATER_BACKEND_ID,
  OceanWaterBackend,
  type OceanWaterBackendRuntimeContext,
  type OceanWaterBodyDescriptorV1
} from "@galacean/engine-water/water/runtime/ocean/index";

import { SeedWorldLakeWaterLevelRuntimeState } from "@galacean/engine-water/world/SeedWorldLakeWaterLevelRuntime";
import { SeedWorldOceanWaterLevelRuntimeState } from "@galacean/engine-water/world/SeedWorldOceanWaterLevelRuntime";
import type { SeedWorldHeightTileSnapshot } from "../../world/SeedWorldGridTileSnapshot.ts";
import type { SeedWorldHydrologyWaterBody } from "../SeedWorldHydrologyBake.ts";

import type { SeedWorldWaterRenderErrorBudgetV1 } from "@galacean/engine-water/world/SeedWorldWaterErrorBudget";
import type { SeedWorldHydrologyArtifactV1 } from "./SeedWorldHydrologyArtifact.ts";
import {
  registerSeedWorldLakeAuthoringV1,
  registerSeedWorldOceanAuthoringV1,
  type SeedWorldLakeAuthoringIdsV1,
  type SeedWorldOceanAuthoringIdsV1
} from "./SeedWorldWaterAuthoringPresetsV1.ts";
import {
  SEED_WORLD_OCEAN_MAXIMUM_RENDER_BATHYMETRY_DEPTH_METRES,
  SeedWorldWaterBackendSourceCompilerV1
} from "./SeedWorldWaterBackendSourceCompiler.ts";
import { adaptSeedWorldHydrologyToWaterPcgV1 } from "./SeedWorldWaterPcgAdapter.ts";

export interface PrepareSeedWorldWaterRuntimeGenerationInputV1 {
  readonly generationId: number;
  readonly artifact: SeedWorldHydrologyArtifactV1;
  readonly hfinalSnapshot: SeedWorldHeightTileSnapshot;
  readonly hydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly renderErrorBudget: SeedWorldWaterRenderErrorBudgetV1;
  readonly preparedWaterGeneration?: Readonly<WaterGenerationPreparedTransferV1>;
  readonly signal: AbortSignal;
}

export interface PreparedSeedWorldWaterRuntimeCandidatePartsV1 {
  readonly generationId: number;
  readonly bodyIds: ReadonlySet<string>;
  readonly stagedBodyCount: number;
  readonly reusedSceneBodyCount: number;
  readonly preparedResources: PreparedWaterGenerationResourcesV1;
  readonly preparedScene: PreparedWaterSceneBodySetTransaction;
  /** Wall-clock preparation phases used by the planner's opt-in timing diagnostics. */
  readonly timingsMilliseconds: Readonly<{
    readonly resources: number;
    readonly scene: number;
    readonly total: number;
  }>;
}

export interface SeedWorldWaterSceneBodyChangeSetV1 {
  readonly stageAssets: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[];
  readonly removeBodyIds: readonly string[];
}

export interface SeedWorldWaterRuntimeBridgeBindingsV1 {
  readonly resolveLookId?: (bodyId: string, defaultLookId: string) => string;
  readonly getVisible: (bodyKind: "lake" | "ocean") => boolean;
  readonly createHeightfieldRuntimeContext: (
    bodyId: string,
    root: Entity,
    surfaceLevelOffsetMetres: number
  ) => Readonly<HeightfieldWaterBackendRuntimeContext>;
  readonly createOceanRuntimeContext: (
    bodyId: string,
    root: Entity,
    surfaceLevelOffsetMetres: number
  ) => Readonly<OceanWaterBackendRuntimeContext>;
  readonly resolveOceanRepresentationState: (
    descriptor: Readonly<OceanWaterBodyDescriptorV1>
  ) => Readonly<WaterOceanRepresentationStateV1>;
  readonly setSurfaceTimeOverride: (bodyId: string, timeSeconds: number | undefined) => void;
  readonly setLakeSurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;
  readonly setOceanSurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;
}

/**
 * Page-lifetime Scene identity for Hydrology's single primary Ocean.
 *
 * Hydrology body ids remain generation-content identities and therefore change
 * with the Seed. Water's one-active-Ocean backend instead needs one stable
 * instance id so a new generation uses its atomic same-instance replacement
 * path while the detached Asset/source identity is allowed to change.
 */
export const SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1 = "seed-world-primary-ocean";

/** Owns only the Seed World composition policy; generic Water lifecycle remains in Water. */
export class SeedWorldWaterRuntimeBridgeV1 {
  private readonly _preparer: WaterGenerationPreparerV1;
  /** Exact detached assets keyed by the Scene body slot that currently publishes them. */
  private _publishedRuntimeAssets = new Map<string, Readonly<WaterBodyAsset<WaterBodySourceV1>>>();
  private _publishedLakeWaterLevelStates = new Map<string, SeedWorldLakeWaterLevelRuntimeState>();
  private _publishedOceanWaterLevelState: SeedWorldOceanWaterLevelRuntimeState | undefined;

  constructor(
    private readonly _host: WaterSceneRuntimeHost,
    private readonly _bindings: Readonly<SeedWorldWaterRuntimeBridgeBindingsV1>
  ) {
    registerBackendIfMissing(_host, HEIGHTFIELD_WATER_BACKEND_ID, () => new HeightfieldWaterBackend());
    registerBackendIfMissing(_host, OCEAN_WATER_BACKEND_ID, () => new OceanWaterBackend());
    this._preparer = new WaterGenerationPreparerV1({
      requireBackendRoute: (asset) => _host.assertBackendRoute(asset),
      bodySourceCompilers: [new SeedWorldWaterBackendSourceCompilerV1()]
    });
  }

  async prepareCandidateParts(
    input: Readonly<PrepareSeedWorldWaterRuntimeGenerationInputV1>
  ): Promise<PreparedSeedWorldWaterRuntimeCandidatePartsV1> {
    const prepareStartedAt = performance.now();
    let resources: PreparedWaterGenerationResourcesV1 | undefined;
    let scene: PreparedWaterSceneBodySetTransaction | undefined;
    try {
      let phaseStartedAt = performance.now();
      if (input.preparedWaterGeneration) {
        resources = this._preparer.prepareTransferredGeneration(
          input.generationId,
          input.preparedWaterGeneration,
          input.preparedWaterGeneration.sourceAssetSet
        );
      } else {
        const adapted = adaptSeedWorldHydrologyToWaterPcgV1({
          generationId: input.generationId,
          artifact: input.artifact,
          hfinalSnapshot: input.hfinalSnapshot,
          hydrologyWaterBodies: input.hydrologyWaterBodies,
          renderErrorBudget: input.renderErrorBudget,
          signal: input.signal
        });
        resources = this._preparer.prepareGeneration(adapted.assetSet, adapted.compileContext);
      }
      const resourcePreparationMilliseconds = performance.now() - phaseStartedAt;
      const lakeAuthoringIds = this._host.registerAuthoring((assets) =>
        registerSeedWorldLakeAuthoringV1(assets, input.renderErrorBudget)
      );
      const nextBodyIds = new Set(resources.runtimeAssetSet.bodies.map(seedWorldWaterSceneBodyIdV1));
      const nextAssets = new Map(
        resources.runtimeAssetSet.bodies.map((asset) => [seedWorldWaterSceneBodyIdV1(asset), asset] as const)
      );
      const nextLakeWaterLevelStates = createLakeWaterLevelStates(
        resources.runtimeAssetSet.bodies,
        input,
        this._publishedLakeWaterLevelStates,
        this._bindings
      );
      const nextOceanWaterLevelState = createOceanWaterLevelState(
        resources.runtimeAssetSet.bodies,
        this._publishedOceanWaterLevelState,
        this._bindings
      );
      // This bridge owns only generation-published Ocean/Lake slots. Authoring rivers share
      // the page-lifetime Host but must never be interpreted as stale generation bodies.
      const activeBodyIds = new Set(
        [...this._publishedRuntimeAssets.keys()].filter((bodyId) => this._host.hasBody(bodyId))
      );
      const sceneRevision = Math.max(input.generationId, this._host.sceneRevision + 1);
      const transaction = this._host.beginBodySetTransaction(sceneRevision);
      const changes = selectSeedWorldWaterSceneBodyChangesV1(
        resources.runtimeAssetSet.bodies,
        activeBodyIds,
        this._publishedRuntimeAssets
      );
      let stagedAssetCount = 0;
      for (const asset of changes.stageAssets) {
        const authoringIds = resolveAuthoringIds(this._host, asset, lakeAuthoringIds);
        transaction.stage(
          createBodyRequest(
            asset,
            authoringIds,
            this._bindings,
            nextLakeWaterLevelStates.get(seedWorldWaterSceneBodyIdV1(asset)),
            asset.kind === "ocean" ? nextOceanWaterLevelState : undefined
          )
        );
        stagedAssetCount++;
        // Water Scene takes an owned defensive snapshot at stage(). Large Lake
        // and Ocean rasters must not all be copied in one animation frame.
        if (stagedAssetCount < changes.stageAssets.length) {
          await yieldSeedWorldWaterPreparationFrame(input.signal);
        }
      }
      for (const bodyId of changes.removeBodyIds) transaction.remove(bodyId);
      phaseStartedAt = performance.now();
      const preparedScene = await transaction.prepare(input.signal);
      const scenePreparationMilliseconds = performance.now() - phaseStartedAt;
      scene = wrapPublishedAssetTracking(
        preparedScene,
        nextAssets,
        nextLakeWaterLevelStates,
        nextOceanWaterLevelState,
        (publishedAssets, lakeStates, oceanState) => {
          this._publishedRuntimeAssets = publishedAssets;
          this._publishedLakeWaterLevelStates = lakeStates;
          this._publishedOceanWaterLevelState = oceanState;
        }
      );
      return Object.freeze({
        generationId: input.generationId,
        bodyIds: nextBodyIds,
        stagedBodyCount: changes.stageAssets.length,
        reusedSceneBodyCount: resources.runtimeAssetSet.bodies.length - changes.stageAssets.length,
        preparedResources: resources,
        preparedScene: scene,
        timingsMilliseconds: Object.freeze({
          resources: resourcePreparationMilliseconds,
          scene: scenePreparationMilliseconds,
          total: performance.now() - prepareStartedAt
        })
      });
    } catch (error) {
      if (scene?.active) await scene.rollback();
      resources?.rollback();
      throw error;
    }
  }

  get footprintResourceCount(): number {
    return this._preparer.footprintResourceCount;
  }

  getLakeWaterLevelReadbacks(): readonly Readonly<LakeWaterLevelRuntimeReadback>[] {
    return Object.freeze(
      [...this._publishedLakeWaterLevelStates.values()]
        .sort((left, right) => left.bodyId.localeCompare(right.bodyId))
        .map((state) => state.readback)
    );
  }

  /** Allocation-free generated Water datum used by Seed World's per-frame navigation floor. */
  getEffectiveGeneratedWaterLevelMetres(bodyId: string, kind: "lake" | "ocean"): number | undefined {
    if (kind === "lake") return this._publishedLakeWaterLevelStates.get(bodyId)?.effectiveWaterLevelMetres;
    const publishedOcean = this._publishedRuntimeAssets.get(SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1);
    if (publishedOcean?.id !== bodyId) return undefined;
    return this._publishedOceanWaterLevelState?.effectiveWaterLevelMetres;
  }

  setLakeWaterLevelMetres(bodyId: string, waterLevelMetres: number): Readonly<LakeWaterLevelRuntimeReadback> {
    const state = this._publishedLakeWaterLevelStates.get(bodyId);
    if (!state) throw new Error(`Seed World Lake runtime '${bodyId}' is not published.`);
    return state.setWaterLevelMetres(waterLevelMetres);
  }

  getOceanWaterLevelReadback(): Readonly<OceanWaterLevelRuntimeReadback> | null {
    return this._publishedOceanWaterLevelState?.readback ?? null;
  }

  setOceanWaterLevelMetres(waterLevelMetres: number): Readonly<OceanWaterLevelRuntimeReadback> {
    const state = this._publishedOceanWaterLevelState;
    if (!state) throw new Error("Seed World Ocean runtime is not published.");
    return state.setWaterLevelMetres(waterLevelMetres);
  }
}

function yieldSeedWorldWaterPreparationFrame(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const complete = (): void => {
      signal.removeEventListener("abort", abort);
      try {
        signal.throwIfAborted();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    const abort = (): void => reject(new DOMException("Water Scene preparation was aborted.", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => complete());
    else setTimeout(complete, 0);
  });
}

/** Exact-reference diff: unchanged detached assets keep their active Backend runtime and GPU uploads. */
export function selectSeedWorldWaterSceneBodyChangesV1(
  nextAssets: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[],
  activeBodyIds: ReadonlySet<string>,
  publishedAssets: ReadonlyMap<string, Readonly<WaterBodyAsset<WaterBodySourceV1>>>
): Readonly<SeedWorldWaterSceneBodyChangeSetV1> {
  const nextBodyIds = new Set(nextAssets.map(seedWorldWaterSceneBodyIdV1));
  return Object.freeze({
    stageAssets: Object.freeze(
      nextAssets.filter((asset) => {
        const sceneBodyId = seedWorldWaterSceneBodyIdV1(asset);
        return !activeBodyIds.has(sceneBodyId) || publishedAssets.get(sceneBodyId) !== asset;
      })
    ),
    removeBodyIds: Object.freeze([...activeBodyIds].filter((bodyId) => !nextBodyIds.has(bodyId)).sort())
  });
}

/** Maps generation-owned Water assets onto stable page-lifetime Scene slots. */
export function seedWorldWaterSceneBodyIdV1(asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>): string {
  return asset.kind === "ocean" ? SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1 : asset.id;
}

function createBodyRequest(
  asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
  authoringIds: Readonly<SeedWorldLakeAuthoringIdsV1 | SeedWorldOceanAuthoringIdsV1>,
  bindings: Readonly<SeedWorldWaterRuntimeBridgeBindingsV1>,
  lakeWaterLevelState?: SeedWorldLakeWaterLevelRuntimeState,
  oceanWaterLevelState?: SeedWorldOceanWaterLevelRuntimeState
): Readonly<WaterSceneBodyRequest> {
  if (asset.kind !== "lake" && asset.kind !== "ocean") {
    throw new Error(`Seed World Ocean/Lake runtime received '${asset.kind}'.`);
  }
  const sceneBodyId = seedWorldWaterSceneBodyIdV1(asset);
  if (asset.kind === "lake" && !lakeWaterLevelState) {
    throw new Error(`Seed World Lake '${asset.id}' has no runtime water-level state.`);
  }
  if (asset.kind === "ocean" && !oceanWaterLevelState) {
    throw new Error(`Seed World Ocean '${asset.id}' has no runtime water-level state.`);
  }
  const representationState = (() => {
    if (asset.kind !== "ocean") return undefined;
    if (asset.source.kind !== WaterBodySourceKind.OceanNearshore) {
      throw new Error(`Seed World Ocean '${asset.id}' requires an OceanNearshore source.`);
    }
    assertOceanWaterBodyDescriptor(asset.source.descriptor);
    return bindings.resolveOceanRepresentationState(asset.source.descriptor);
  })();
  return Object.freeze({
    bodyId: sceneBodyId,
    asset,
    instance: createWaterBodyInstance({
      id: sceneBodyId,
      assetId: asset.id,
      lookPresetId: bindings.resolveLookId?.(sceneBodyId, authoringIds.lookPresetId) ?? authoringIds.lookPresetId,
      qualityPlanId: authoringIds.qualityPlanId,
      transform: Object.freeze({
        position: Object.freeze([0, 0, 0] as const),
        yawDegrees: 0,
        scaleXZ: Object.freeze([1, 1] as const)
      }),
      visible: bindings.getVisible(asset.kind),
      priority: asset.kind === "ocean" ? 0 : 10,
      // Rendering-only phase: do not register public Query/Buoyancy/Wake channels.
      interaction: Object.freeze({ query: false, buoyancy: false, wake: false }),
      representationState
    }),
    bodyOrigin: Object.freeze([0, 0] as const),
    developmentRuntime:
      asset.kind === "ocean" ? oceanWaterLevelState!.developmentPort : lakeWaterLevelState!.developmentPort,
    canonicalDescriptorHash: asset.sourceHash,
    createRuntimeContext: (root: Entity) =>
      asset.kind === "ocean"
        ? bindings.createOceanRuntimeContext(sceneBodyId, root, oceanWaterLevelState!.surfaceLevelOffsetMetres)
        : bindings.createHeightfieldRuntimeContext(sceneBodyId, root, lakeWaterLevelState!.surfaceLevelOffsetMetres),
    setSurfaceTimeOverride: (timeSeconds: number | undefined) =>
      bindings.setSurfaceTimeOverride(sceneBodyId, timeSeconds)
  });
}

function resolveAuthoringIds(
  host: WaterSceneRuntimeHost,
  asset: Readonly<WaterBodyAsset<WaterBodySourceV1>>,
  lakeAuthoringIds: Readonly<SeedWorldLakeAuthoringIdsV1>
): Readonly<SeedWorldLakeAuthoringIdsV1 | SeedWorldOceanAuthoringIdsV1> {
  if (asset.kind === "lake") return lakeAuthoringIds;
  if (asset.kind !== "ocean" || asset.source.kind !== WaterBodySourceKind.OceanNearshore) {
    throw new Error(`Seed World authoritative runtime cannot author '${asset.kind}' source '${asset.source.kind}'.`);
  }
  const descriptor = asset.source.descriptor;
  assertOceanWaterBodyDescriptor(descriptor);
  return host.registerAuthoring((assets) => registerSeedWorldOceanAuthoringV1(assets, descriptor.config));
}

function wrapPublishedAssetTracking(
  prepared: PreparedWaterSceneBodySetTransaction,
  nextAssets: ReadonlyMap<string, Readonly<WaterBodyAsset<WaterBodySourceV1>>>,
  nextLakeWaterLevelStates: ReadonlyMap<string, SeedWorldLakeWaterLevelRuntimeState>,
  nextOceanWaterLevelState: SeedWorldOceanWaterLevelRuntimeState | undefined,
  onCommit: (
    assets: Map<string, Readonly<WaterBodyAsset<WaterBodySourceV1>>>,
    lakeWaterLevelStates: Map<string, SeedWorldLakeWaterLevelRuntimeState>,
    oceanWaterLevelState: SeedWorldOceanWaterLevelRuntimeState | undefined
  ) => void
): PreparedWaterSceneBodySetTransaction {
  return Object.freeze({
    revision: prepared.revision,
    get active() {
      return prepared.active;
    },
    commit: () => {
      const published = prepared.commit();
      onCommit(new Map(nextAssets), new Map(nextLakeWaterLevelStates), nextOceanWaterLevelState);
      return published;
    },
    rollback: () => prepared.rollback()
  });
}

function createOceanWaterLevelState(
  assets: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[],
  published: SeedWorldOceanWaterLevelRuntimeState | undefined,
  bindings: Readonly<SeedWorldWaterRuntimeBridgeBindingsV1>
): SeedWorldOceanWaterLevelRuntimeState | undefined {
  const oceans = assets.filter((asset) => asset.kind === "ocean");
  if (oceans.length === 0) return undefined;
  if (oceans.length !== 1) throw new Error("Seed World runtime requires exactly one authoritative Ocean.");
  const ocean = oceans[0]!;
  if (ocean.source.kind !== WaterBodySourceKind.OceanNearshore) {
    throw new Error(`Seed World Ocean '${ocean.id}' requires an OceanNearshore source.`);
  }
  assertOceanWaterBodyDescriptor(ocean.source.descriptor);
  const defaultWaterLevelMetres = ocean.source.descriptor.config.waterLevel;
  const adjustmentRangeMetres = SEED_WORLD_OCEAN_MAXIMUM_RENDER_BATHYMETRY_DEPTH_METRES;
  return published?.isCompatible(defaultWaterLevelMetres, adjustmentRangeMetres)
    ? published
    : new SeedWorldOceanWaterLevelRuntimeState({
        bodyId: SEED_WORLD_PRIMARY_OCEAN_SCENE_BODY_ID_V1,
        defaultWaterLevelMetres,
        adjustmentRangeMetres,
        applySurfaceLevelOffset: bindings.setOceanSurfaceLevelOffset
      });
}

function createLakeWaterLevelStates(
  assets: readonly Readonly<WaterBodyAsset<WaterBodySourceV1>>[],
  input: Readonly<PrepareSeedWorldWaterRuntimeGenerationInputV1>,
  published: ReadonlyMap<string, SeedWorldLakeWaterLevelRuntimeState>,
  bindings: Readonly<SeedWorldWaterRuntimeBridgeBindingsV1>
): Map<string, SeedWorldLakeWaterLevelRuntimeState> {
  const catalogByBodyId = new Map(input.artifact.waterBodyCatalog.map((body) => [body.bodyId, body]));
  const hydrologyByBodyId = new Map(input.hydrologyWaterBodies.map((body) => [body.id, body]));
  const states = new Map<string, SeedWorldLakeWaterLevelRuntimeState>();
  for (const asset of assets) {
    if (asset.kind !== "lake") continue;
    const catalogBody = catalogByBodyId.get(asset.id);
    if (
      !catalogBody ||
      catalogBody.waterType !== "lake" ||
      catalogBody.uniformSurfaceHeightMillimetres === undefined ||
      !catalogBody.basinId
    ) {
      throw new Error(`Seed World Lake '${asset.id}' has no canonical water-level authority.`);
    }
    const hydrologyBody = hydrologyByBodyId.get(catalogBody.basinId);
    if (!hydrologyBody) {
      throw new Error(`Seed World Lake '${asset.id}' has no matching Hydrology basin '${catalogBody.basinId}'.`);
    }
    const canonicalWaterLevelMetres = catalogBody.uniformSurfaceHeightMillimetres / 1_000;
    const sceneBodyId = seedWorldWaterSceneBodyIdV1(asset);
    const existing = published.get(sceneBodyId);
    const state = existing?.isCompatible(canonicalWaterLevelMetres, hydrologyBody.maximumDepthMetres)
      ? existing
      : new SeedWorldLakeWaterLevelRuntimeState({
          bodyId: sceneBodyId,
          canonicalWaterLevelMetres,
          maximumDepthMetres: hydrologyBody.maximumDepthMetres,
          applySurfaceLevelOffset: bindings.setLakeSurfaceLevelOffset
        });
    states.set(sceneBodyId, state);
  }
  return states;
}

function registerBackendIfMissing(
  host: WaterSceneRuntimeHost,
  backendId: string,
  create: () => WaterBodyBackend
): void {
  if (!host.hasBackend(backendId)) host.registerBackend(create());
}
