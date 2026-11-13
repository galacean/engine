import { createWaterConnectionBinding, type WaterConnectionBinding } from "../connections/WaterConnectionBinding";
import { destroyWaterOwnedMesh } from "../resources/destroyWaterOwnedMesh";
import { updateWaterSurfaceAppearanceV2Clock } from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import { updateRiverFlowClock } from "./RiverMaterialBinding";
import { RiverRuntimeSubmission } from "./RiverRuntimeSubmission";
export { RiverRuntimeSubmissionCancelledError } from "./RiverRuntimeSubmission";
/** Internal river runtime lifecycle: chunk renderer creation, GPU upload, cache, swap, and disposal. */
import { Engine, Entity, Material, MeshRenderer, Script, Texture2D } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";
import type { RiverAuthoringConfig, RiverMaterialConfig } from "../../authoring/river/RiverAuthoringTypes";
import { WaterSurfaceDepthResponseModelV2 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { RiverChunkSourceKind, RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import { cloneCompiledRiverConfig } from "../../compiler/river/RiverNetworkCompiler";
import {
  computeRiverSurfaceDomainOffsets,
  createRiverSurfaceDomainOffsets
} from "../../compiler/river/RiverSurfaceMotion";
import type { RiverCompiledChunk, RiverCompiledData, RiverReachArtifact } from "../../compiler/river/types";
import type { WaterCameraVisibilityProvider, WaterTerrainOcclusionProvider } from "../body/WaterBackendRegistry";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type { WaterSurfaceOpticsBinding } from "../optics/WaterSurfaceOpticsTypes";
import type { WaterSurfaceAppearanceBindingV2 } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import { applyWaterSurfaceRendererContract } from "../surface/WaterSurfaceRendererContract";
import { createRiverLocalMapTexture } from "./RiverLocalMapTextureFactory";
import { setRiverLocalMapRendererBinding, updateRiverSurfaceDomainOffsets } from "./RiverMaterialBinding";
import {
  createRiverLocalMapMaterial,
  createRiverMaterial,
  setRiverScreenSpaceReflectionCompositeIntensity,
  setRiverScreenSpaceReflectionReceiver,
  setRiverSurfaceAppearanceBinding,
  setRiverSurfaceDepthWriteEnabled,
  setRiverSurfaceFeatureFlags,
  setRiverSurfaceOpticsBinding,
  setRiverSurfaceReflectionBinding,
  setRiverSurfaceTimeOverride,
  updateRiverMaterial,
  updateRiverSurfaceTransientOpticalProfile
} from "./RiverMaterialFactory";
import { uploadRiverMeshes } from "./RiverMeshUploader";
import { RiverNetworkQueryService } from "./RiverQueryService";
import { RiverResource } from "./RiverResource";
import { getRiverWaterSpatialBounds, RiverWaterSpatialFieldProvider } from "./RiverWaterSpatialFieldProvider";
import { RIVER_QUERY_EPSILON } from "./constants";
import type { RiverMeshBuildResult, RiverNetworkQueryResult } from "./types";

export interface RiverRuntimeReach {
  readonly root: Entity;
  readonly config: RiverAuthoringConfig;
  readonly artifact: RiverReachArtifact;
}

export interface RiverRuntimeReachSource {
  config: RiverAuthoringConfig;
  artifact: RiverReachArtifact;
}

export interface RiverRuntimePresentation {
  surfaceVisible: boolean;
  foamVisible: boolean;
  surfaceMaterial?: Material;
  junctionSurfaceMaterial?: Material;
  foamMaterial?: Material;
}

function linearColorToHex(color: readonly [number, number, number, number]): string {
  return `#${color
    .slice(0, 3)
    .map((component) =>
      Math.round(Math.min(1, Math.max(0, component)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function deriveRiverVisualMaterial(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  fallback: Readonly<RiverMaterialConfig>
): Readonly<RiverMaterialConfig> {
  const contract = binding.renderContract;
  if (!contract) throw new Error("River appearance binding requires its Effective RenderContract.");
  const depth = binding.appearance.depthResponse;
  const color =
    depth.model === WaterSurfaceDepthResponseModelV2.PowerRamp
      ? depth.color
      : depth.model === WaterSurfaceDepthResponseModelV2.ColorRamp
        ? (depth.colors[0]?.color ?? ([0, 0, 0, 1] as const))
        : depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
          ? depth.shallowColor
          : ([
              contract.optics.profile.scatteringColor[0],
              contract.optics.profile.scatteringColor[1],
              contract.optics.profile.scatteringColor[2],
              1
            ] as const);
  return Object.freeze({
    preset: fallback.preset,
    baseColor: linearColorToHex(color),
    foamColor: contract.look.foam.color,
    foamIntensity: contract.look.foam.enabled ? contract.look.foam.intensity : 0,
    clarity: Math.min(1, Math.max(0, 1 - contract.optics.profile.scatteringCoefficient))
  });
}

interface RiverRuntimeMaterialSet {
  readonly surface: Material;
  readonly surfaceLocalMap?: Material;
}

type MutableRiverSurfaceOpticsBinding = {
  -readonly [Property in keyof WaterSurfaceOpticsBinding]: WaterSurfaceOpticsBinding[Property];
};

interface MutableRiverRuntimeReach extends RiverRuntimeReach {
  config: RiverAuthoringConfig;
  artifact: RiverReachArtifact;
  readonly materials: RiverRuntimeMaterialSet;
  readonly localMapTexture?: Texture2D;
}

interface MutableRiverRuntimeChunk {
  readonly root: Entity;
  readonly surfaceRenderer: MeshRenderer;
  readonly compiled: RiverCompiledChunk;
  readonly sourceId: string;
  readonly meshes: RiverMeshBuildResult;
  readonly terrainOcclusionKey: string;
}

interface MutableRiverRuntimeSet {
  readonly root: Entity;
  readonly resource: RiverResource;
  readonly reaches: MutableRiverRuntimeReach[];
  readonly chunks: MutableRiverRuntimeChunk[];
  readonly queryService: RiverNetworkQueryService;
  readonly spatialFieldProvider: RiverWaterSpatialFieldProvider;
  readonly localMapTexture?: Texture2D;
  readonly connectionBinding?: WaterConnectionBinding;
  readonly ownedTextures: Set<Texture2D>;
  readonly ownedConnections: Set<WaterConnectionBinding>;
}

export interface RiverRuntimeActivation {
  created: boolean;
  reaches: readonly RiverRuntimeReach[];
  queryService: RiverNetworkQueryService;
  spatialFieldProvider: RiverWaterSpatialFieldProvider;
  maxSliceMs: number;
}

export interface RiverRuntimeSubmissionOptions {
  frameBudgetMs?: number;
  now?: () => number;
  yieldToMainThread?: () => Promise<void>;
  shouldCancel?: () => boolean;
}

function pinMaterialSet(materials: RiverRuntimeMaterialSet): void {
  materials.surface.isGCIgnored = true;
  if (materials.surfaceLocalMap) materials.surfaceLocalMap.isGCIgnored = true;
}

function applyRiverSurfaceOpticsBinding(material: Material, binding: Readonly<WaterSurfaceOpticsBinding>): void {
  const readback = setRiverSurfaceOpticsBinding(material, binding);
  setRiverScreenSpaceReflectionReceiver(material, readback.effectiveSource === "ssr");
}

function applyRiverReflectionBinding(
  material: Material,
  tier: WaterSurfaceOpticsBinding["tier"],
  binding: Readonly<WaterReflectionBinding> | undefined
): void {
  const readback = setRiverSurfaceReflectionBinding(material, tier, binding);
  setRiverScreenSpaceReflectionReceiver(material, readback.effectiveSource === "ssr");
}

/** One pre-render update per controller, independent of Native/Seed World integration. */
class RiverSurfaceClock extends Script {
  updateDomains?: () => void;

  override onLateUpdate(): void {
    this.updateDomains?.();
  }
}

function cleanupRuntime(actions: readonly (() => void)[], errors: unknown[] = []): void {
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "River runtime cleanup reported multiple errors.");
}

export class RiverRuntimeController {
  private readonly _runtimeSets = new Map<string, MutableRiverRuntimeSet>();
  private _destroyed = false;
  private _submissionRevision = 0;
  private _surfaceClock?: RiverSurfaceClock;
  private _lastSurfaceTime?: number;
  private readonly _surfaceDomainOffsets = createRiverSurfaceDomainOffsets();
  private _activeId?: string;
  private _activeReaches: MutableRiverRuntimeReach[] = [];
  private _activeChunks: MutableRiverRuntimeChunk[] = [];
  private _activeQueryService?: RiverNetworkQueryService;
  private _macroDisplacementEnabled = true;
  private _microSurfaceEnabled = true;
  private _depthWriteEnabled = false;
  private _renderPriority = 0;
  private _surfaceTimeOverride?: number;
  private _surfaceOpticsBinding?: MutableRiverSurfaceOpticsBinding;
  private _reflectionBindingApplied = false;
  private _appliedReflectionBindingRevision?: number;
  private _surfaceAppearanceBinding?: Readonly<WaterSurfaceAppearanceBindingV2>;

  /** Authored native surface shader; runtime bindings remain owned by this controller. */
  surfaceShader?: import("@galacean/engine-core").Shader;

  constructor(
    private readonly _engine: Engine,
    private readonly _root: Entity
  ) {}

  private readonly _updateSurfaceClock = (force = false): void => {
    const active = this._activeId === undefined ? undefined : this._runtimeSets.get(this._activeId);
    if (!active) return;
    const override = this._surfaceTimeOverride;
    const time = override !== undefined && override >= 0 ? override : this._engine.time.elapsedTime;
    // Both V2 and legacy River appearances use unwrapped engine time.
    for (let index = 0; index < active.reaches.length; index++) {
      const materials = active.reaches[index].materials;
      updateRiverFlowClock(materials.surface, time);
      updateWaterSurfaceAppearanceV2Clock(materials.surface, time, force);
      if (materials.surfaceLocalMap) {
        updateRiverFlowClock(materials.surfaceLocalMap, time);
        updateWaterSurfaceAppearanceV2Clock(materials.surfaceLocalMap, time, force);
      }
    }
    const motion = active.resource.data.surfaceMotion;
    if (!this._macroDisplacementEnabled || motion.maxDisplacement <= 0) return;
    if (!force && time === this._lastSurfaceTime) return;
    const offsets = computeRiverSurfaceDomainOffsets(time, motion.displacementLengthScale, this._surfaceDomainOffsets);
    for (let index = 0; index < active.reaches.length; index++) {
      const reach = active.reaches[index];
      updateRiverSurfaceDomainOffsets(reach.materials.surface, offsets);
      if (reach.materials.surfaceLocalMap) updateRiverSurfaceDomainOffsets(reach.materials.surfaceLocalMap, offsets);
    }
    this._lastSurfaceTime = time;
  };

  private _refreshSurfaceClock(): void {
    if (!this._surfaceClock) {
      this._surfaceClock = this._root.addComponent(RiverSurfaceClock);
      this._surfaceClock.updateDomains = this._updateSurfaceClock;
    }
    this._updateSurfaceClock(true);
  }

  get dropCount(): number {
    return this._activeId ? (this._runtimeSets.get(this._activeId)?.resource.data.drops?.length ?? 0) : 0;
  }

  /** Applies one shared World Horizon to active finite chunks without changing authored/debug visibility. */
  refreshTerrainOcclusion(provider?: WaterTerrainOcclusionProvider): void {
    const activeId = this._activeId;
    if (!activeId) {
      return;
    }
    const chunks = this._activeChunks;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      const renderer = chunk.surfaceRenderer;
      const occluded =
        provider !== undefined &&
        renderer.entity.isActiveInHierarchy &&
        provider.isOccluded(chunk.terrainOcclusionKey, renderer.bounds);
      if (renderer.enabled === occluded) {
        renderer.enabled = !occluded;
      }
    }
  }

  /** True when at least one active water-surface chunk intersects the current source-Camera frustum. */
  hasCameraVisibleSurfaceChunk(provider: WaterCameraVisibilityProvider): boolean {
    const chunks = this._activeChunks;
    for (let index = 0; index < chunks.length; index++) {
      const renderer = chunks[index]!.surfaceRenderer;
      if (
        renderer.enabled &&
        renderer.entity.isActiveInHierarchy &&
        provider.isVisible(renderer.bounds, renderer.entity.layer)
      ) {
        return true;
      }
    }
    return false;
  }

  get activeQueryService(): RiverNetworkQueryService | undefined {
    return this._activeQueryService;
  }

  get activeSpatialFieldProvider(): RiverWaterSpatialFieldProvider | undefined {
    const activeId = this._activeId;
    return activeId === undefined ? undefined : this._runtimeSets.get(activeId)?.spatialFieldProvider;
  }

  get macroDisplacementEnabled(): boolean {
    return this._macroDisplacementEnabled;
  }

  get microSurfaceEnabled(): boolean {
    return this._microSurfaceEnabled;
  }

  get surfaceTimeOverride(): number | undefined {
    return this._surfaceTimeOverride;
  }

  get surfaceOpticsBinding(): Readonly<WaterSurfaceOpticsBinding> | undefined {
    return this._surfaceOpticsBinding;
  }

  /**
   * Samples the active river at the same macro-surface state used for rendering.
   * The caller owns `outResult`; this method never retains or replaces it.
   */
  sampleActiveSurface(worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    const queryService = this._activeQueryService;
    if (!queryService) return false;

    if (this._macroDisplacementEnabled) {
      const surfaceTimeOverride = this._surfaceTimeOverride;
      const elapsedTime =
        surfaceTimeOverride !== undefined && surfaceTimeOverride >= 0
          ? surfaceTimeOverride
          : this._engine.time.elapsedTime;
      const hit = queryService.sampleSurfaceAtTime(worldPosition, elapsedTime, outResult);
      if (!hit || this._usesDynamicSurfaceMaterial(outResult)) return hit;
    }

    return queryService.sampleSurface(worldPosition, outResult);
  }

  private _usesDynamicSurfaceMaterial(_result: RiverNetworkQueryResult): boolean {
    const activeId = this._activeId;
    const runtimeSet = activeId === undefined ? undefined : this._runtimeSets.get(activeId);
    if (!runtimeSet) return true;
    return runtimeSet.resource.data.surfaceMotion.maxDisplacement > RIVER_QUERY_EPSILON;
  }

  activate(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): RiverRuntimeActivation {
    if (this._destroyed) throw new Error("River runtime controller has been destroyed.");
    ++this._submissionRevision;
    this._deactivateAll();
    const cached = this._runtimeSets.get(networkId);
    if (cached) {
      if (cached.resource.metadata.compiledHash !== resource.metadata.compiledHash) {
        throw new Error("Cached river runtime hash differs; use replaceActive for changed resources.");
      }
      this._activeId = networkId;
      this._activeReaches = cached.reaches;
      this._activeChunks = cached.chunks;
      this._activeQueryService = cached.queryService;
      cached.root.isActive = true;
      this._refreshSurfaceClock();
      return {
        created: false,
        reaches: cached.reaches,
        queryService: cached.queryService,
        spatialFieldProvider: cached.spatialFieldProvider,
        maxSliceMs: 0
      };
    }
    const runtimeSet = this._createRuntimeSet(networkId, resource, sources);
    this._runtimeSets.set(networkId, runtimeSet);
    this._activeId = networkId;
    this._activeReaches = runtimeSet.reaches;
    this._activeChunks = runtimeSet.chunks;
    this._activeQueryService = runtimeSet.queryService;
    this._refreshSurfaceClock();
    return {
      created: true,
      reaches: runtimeSet.reaches,
      queryService: runtimeSet.queryService,
      spatialFieldProvider: runtimeSet.spatialFieldProvider,
      maxSliceMs: 0
    };
  }

  replaceActive(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): readonly RiverRuntimeReach[] {
    if (this._destroyed) throw new Error("River runtime controller has been destroyed.");
    ++this._submissionRevision;
    const previous = this._runtimeSets.get(networkId);
    const runtimeSet = this._createRuntimeSet(networkId, resource, sources);
    this._runtimeSets.set(networkId, runtimeSet);
    this._activeId = networkId;
    this._activeReaches = runtimeSet.reaches;
    this._activeChunks = runtimeSet.chunks;
    this._activeQueryService = runtimeSet.queryService;
    this._refreshSurfaceClock();
    if (previous) {
      this._destroyRuntimeSet(previous);
    }
    return runtimeSet.reaches;
  }

  async replaceActiveIncremental(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[],
    options: RiverRuntimeSubmissionOptions = {}
  ): Promise<RiverRuntimeActivation> {
    if (this._destroyed) throw new Error("River runtime controller has been destroyed.");
    const revision = ++this._submissionRevision;
    const submission = new RiverRuntimeSubmission(
      options,
      () => this._destroyed || revision !== this._submissionRevision || options.shouldCancel?.() === true
    );
    const previous = this._runtimeSets.get(networkId);
    const data = resource.data;
    let root: Entity | undefined;
    let retained = false;
    let localMapTexture: Texture2D | undefined;
    let connectionBinding: WaterConnectionBinding | undefined;
    let queryService: RiverNetworkQueryService | undefined;
    let spatialFieldProvider: RiverWaterSpatialFieldProvider | undefined;
    const reaches: MutableRiverRuntimeReach[] = [];
    const chunks: MutableRiverRuntimeChunk[] = [];
    const borrowedReaches = new Set<MutableRiverRuntimeReach>();
    const borrowedChunks = new Set<MutableRiverRuntimeChunk>();
    const newTextures = new Set<Texture2D>();
    const newConnections = new Set<WaterConnectionBinding>();
    let activated = false;
    try {
      await submission.run(() => {
        root = this._root.createChild(`river-runtime-${data.sourceId}`);
        root.isActive = false;
        resource.retain();
        retained = true;
      });
      const oldData = previous?.resource.data;
      const sameConnections = !!previous && (await submission.equal(oldData!.connections, data.connections));
      const sameMotion = !!previous && (await submission.equal(oldData!.surfaceMotion, data.surfaceMotion));
      const oldIndices = await submission.run(() => new Map(oldData?.reaches.map((reach, index) => [reach.id, index])));
      const reusable = new Map<number, MutableRiverRuntimeReach>();
      for (let index = 0; index < data.reaches.length; index++) {
        const oldIndex = oldIndices.get(data.reaches[index].id);
        if (!previous || oldIndex === undefined || !sameConnections || !sameMotion) continue;
        const oldReach = previous.reaches[oldIndex];
        if (
          !(await submission.equal(oldReach.config, sources?.[index]?.config ?? data.reaches[index].config)) ||
          !(await submission.equal(oldReach.artifact, sources?.[index]?.artifact ?? data.reaches[index].artifact))
        )
          continue;
        const oldChunks = await submission.run(() =>
          oldData!.chunks.filter((chunk) => chunk.materialSourceReachIndex === oldIndex)
        );
        const nextChunks = await submission.run(() =>
          data.chunks.filter((chunk) => chunk.materialSourceReachIndex === index)
        );
        if (!(await submission.equal(oldChunks, nextChunks))) continue;
        const oldAtlas = oldData!.terrainInteraction.localMapAtlas,
          atlas = data.terrainInteraction.localMapAtlas;
        if (!!oldAtlas !== !!atlas) continue;
        let tilesMatch = true;
        if (oldAtlas && atlas) {
          if (oldAtlas.width !== atlas.width || oldAtlas.height !== atlas.height) continue;
          const tileIndices = new Set(nextChunks.map((chunk) => chunk.localMapTileIndex));
          for (const tileIndex of tileIndices) {
            if (tileIndex === undefined) continue;
            const tile = atlas.tiles[tileIndex];
            if (!(await submission.equal(oldAtlas.tiles[tileIndex], tile))) {
              tilesMatch = false;
              break;
            }
            const [x, y, width, height] = tile.pixelRect;
            for (let row = y - atlas.padding; row < y + height + atlas.padding; row++) {
              const start = (row * atlas.width + x - atlas.padding) * 4;
              const end = start + (width + atlas.padding * 2) * 4;
              if (
                !(await submission.equal(
                  oldAtlas.pixels.borrowTypedArray().subarray(start, end),
                  atlas.pixels.borrowTypedArray().subarray(start, end)
                ))
              ) {
                tilesMatch = false;
                break;
              }
            }
            if (!tilesMatch) break;
          }
        }
        if (tilesMatch) reusable.set(index, oldReach);
      }
      if (sameConnections) connectionBinding = previous!.connectionBinding;
      else
        await submission.run(() => {
          connectionBinding = createWaterConnectionBinding(this._engine, data.connections);
          if (connectionBinding) newConnections.add(connectionBinding);
        });
      if (reusable.size < data.reaches.length)
        await submission.run(() => {
          const atlas = data.terrainInteraction.localMapAtlas;
          localMapTexture = atlas ? createRiverLocalMapTexture(this._engine, atlas) : undefined;
          if (localMapTexture) {
            localMapTexture.isGCIgnored = true;
            newTextures.add(localMapTexture);
          }
        });
      for (let index = 0; index < data.reaches.length; index++)
        await submission.run(() => {
          const reused = reusable.get(index);
          if (reused) {
            reaches.push(reused);
            borrowedReaches.add(reused);
          } else
            reaches.push(...this._createReaches(data, root!, sources, localMapTexture, connectionBinding, [index]));
        });
      const oldChunks = await submission.run(
        () => new Map(previous?.chunks.map((chunk) => [chunk.compiled.id, chunk]))
      );
      for (const chunk of data.chunks)
        await submission.run(() => {
          const old = oldChunks.get(chunk.id);
          if (old && reusable.has(chunk.materialSourceReachIndex)) {
            chunks.push(old);
            borrowedChunks.add(old);
          } else chunks.push(this._createChunk(networkId, chunk, reaches, root!, data));
        });
      await submission.run(() => {
        queryService = new RiverNetworkQueryService(data);
      });
      await submission.run(() => {
        spatialFieldProvider = new RiverWaterSpatialFieldProvider(queryService!, {
          sourceHash: resource.identity.sourceHash,
          compiledHash: resource.identity.compiledHash,
          sourceSchemaVersion: resource.identity.schemaVersion,
          bounds: getRiverWaterSpatialBounds(data)
        });
      });
      const runtimeSet: MutableRiverRuntimeSet = {
        root: root!,
        resource,
        reaches,
        chunks,
        queryService: queryService!,
        spatialFieldProvider: spatialFieldProvider!,
        localMapTexture,
        connectionBinding,
        ownedTextures: new Set([
          ...newTextures,
          ...reaches.flatMap((reach) => (reach.localMapTexture ? [reach.localMapTexture] : []))
        ]),
        ownedConnections: new Set(connectionBinding ? [connectionBinding] : [])
      };
      await submission.run(() => {
        // Borrowed objects stay attached to the old active tree until this atomic publication.
        for (const reach of borrowedReaches) reach.root.parent = root!;
        for (const chunk of borrowedChunks)
          if (chunk.compiled.sourceKind === RiverChunkSourceKind.Junction) chunk.root.parent = root!;
        if (previous) {
          previous.reaches.splice(
            0,
            previous.reaches.length,
            ...previous.reaches.filter((reach) => !borrowedReaches.has(reach))
          );
          previous.chunks.splice(
            0,
            previous.chunks.length,
            ...previous.chunks.filter((chunk) => !borrowedChunks.has(chunk))
          );
          for (const texture of runtimeSet.ownedTextures) previous.ownedTextures.delete(texture);
          for (const binding of runtimeSet.ownedConnections) previous.ownedConnections.delete(binding);
        }
        this._deactivateAll();
        root!.isActive = true;
        this._runtimeSets.set(networkId, runtimeSet);
        this._activeId = networkId;
        this._activeReaches = reaches;
        this._activeChunks = chunks;
        this._activeQueryService = queryService;
        this._refreshSurfaceClock();
        activated = true;
      });
      const retirementErrors: unknown[] = [];
      if (previous)
        for (const action of this._runtimeCleanupActions(previous)) {
          try {
            await submission.run(action, true);
          } catch (error) {
            retirementErrors.push(error);
          }
        }
      if (retirementErrors.length === 1) throw retirementErrors[0];
      if (retirementErrors.length > 1) throw new AggregateError(retirementErrors, "River retirement reported errors.");
      submission.finish();
      return {
        created: true,
        reaches,
        queryService: queryService!,
        spatialFieldProvider: spatialFieldProvider!,
        maxSliceMs: submission.maxSliceMs
      };
    } catch (error) {
      if (activated) throw error;
      cleanupRuntime(
        [
          ...reaches
            .filter((reach) => !borrowedReaches.has(reach))
            .map((reach) => () => this._destroyReachMaterials(reach, connectionBinding)),
          ...[...newConnections].map((binding) => () => binding.destroy()),
          ...chunks.filter((chunk) => !borrowedChunks.has(chunk)).map((chunk) => () => this._destroyChunk(chunk)),
          ...[...newTextures].map((texture) => () => texture.destroy(true)),
          () => spatialFieldProvider?.destroy(),
          () => root?.destroy(),
          () => {
            if (retained) resource.release();
          }
        ],
        [error]
      );
      throw error;
    }
  }

  applyPresentation(reachIndex: number, presentation: RiverRuntimePresentation): void {
    const reach = this._activeReaches[reachIndex];
    if (!reach) return;
    for (const chunk of this._activeChunks) {
      if (chunk.compiled.materialSourceReachIndex !== reachIndex) continue;
      chunk.surfaceRenderer.entity.isActive = presentation.surfaceVisible;
      chunk.surfaceRenderer.setMaterial(
        (chunk.compiled.sourceKind === RiverChunkSourceKind.Junction
          ? (presentation.junctionSurfaceMaterial ?? presentation.surfaceMaterial)
          : presentation.surfaceMaterial) ?? this._selectSurfaceMaterial(chunk.compiled, reach)
      );
    }
  }

  /** Keeps overlapping Water bodies on one explicit transparent-render ordering contract. */
  setRenderPriority(priority: number): void {
    if (!Number.isFinite(priority)) throw new RangeError("River render priority must be finite.");
    this._renderPriority = priority;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const chunk of runtimeSet.chunks) {
        chunk.surfaceRenderer.priority = priority;
      }
    }
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    if (elapsedTime !== undefined && !Number.isFinite(elapsedTime)) {
      throw new RangeError("River surface time must be finite.");
    }
    this._surfaceTimeOverride = elapsedTime;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverSurfaceTimeOverride(reach.materials.surface, elapsedTime);
        if (reach.materials.surfaceLocalMap) {
          setRiverSurfaceTimeOverride(reach.materials.surfaceLocalMap, elapsedTime);
        }
      }
    }
    this._updateSurfaceClock(true);
  }

  /** Applies one complete binding to active and inactive cached River surface variants. */
  setSurfaceOpticsBinding(binding: Readonly<WaterSurfaceOpticsBinding>): void {
    let cached = this._surfaceOpticsBinding;
    if (!cached) {
      cached = {
        tier: binding.tier,
        opticalProfile: binding.opticalProfile,
        refractionEnabled: binding.refractionEnabled,
        reflection: binding.reflection,
        reflectionSampling: binding.reflectionSampling
      };
      this._surfaceOpticsBinding = cached;
    } else {
      cached.tier = binding.tier;
      cached.opticalProfile = binding.opticalProfile;
      cached.refractionEnabled = binding.refractionEnabled;
      cached.reflection = binding.reflection;
      cached.reflectionSampling = binding.reflectionSampling;
    }
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        applyRiverSurfaceOpticsBinding(reach.materials.surface, cached);
        if (reach.materials.surfaceLocalMap) {
          applyRiverSurfaceOpticsBinding(reach.materials.surfaceLocalMap, cached);
        }
      }
    }
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const chunk of runtimeSet.chunks) {
        applyWaterSurfaceRendererContract(chunk.surfaceRenderer);
      }
    }
    this._recordAppliedReflectionBinding(cached.reflection);
  }

  /** Applies V2 numeric Look overrides without rebinding structural Appearance or reflection state. */
  setOpticalProfile(profile: WaterSurfaceOpticsBinding["opticalProfile"]): void {
    const binding = this._surfaceOpticsBinding;
    if (!binding) throw new Error("River surface optics must be bound before live profile updates.");
    binding.opticalProfile = profile;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        updateRiverSurfaceTransientOpticalProfile(reach.materials.surface, profile);
        if (reach.materials.surfaceLocalMap) {
          updateRiverSurfaceTransientOpticalProfile(reach.materials.surfaceLocalMap, profile);
        }
      }
    }
  }

  /** Changes only forward SSR composition while retaining the active receiver and reflection binding. */
  setScreenSpaceReflectionCompositeIntensity(intensity: number): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverScreenSpaceReflectionCompositeIntensity(reach.materials.surface, intensity);
        if (reach.materials.surfaceLocalMap) {
          setRiverScreenSpaceReflectionCompositeIntensity(reach.materials.surfaceLocalMap, intensity);
        }
      }
    }
  }

  /** Merges presentation-only reflection sampling values into every active River material. */
  setReflectionSamplingConfig(config: NonNullable<WaterSurfaceOpticsBinding["reflectionSampling"]>): void {
    const binding = this._surfaceOpticsBinding;
    if (!binding) throw new Error("River surface optics must be bound before reflection sampling updates.");
    binding.reflectionSampling = Object.freeze({ ...binding.reflectionSampling, ...config });
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        applyRiverSurfaceOpticsBinding(reach.materials.surface, binding);
        if (reach.materials.surfaceLocalMap) {
          applyRiverSurfaceOpticsBinding(reach.materials.surfaceLocalMap, binding);
        }
      }
    }
  }

  setSurfaceAppearanceBinding(binding: Readonly<WaterSurfaceAppearanceBindingV2>): void {
    this._surfaceAppearanceBinding = binding;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        const visualMaterial = deriveRiverVisualMaterial(binding, reach.config.material);
        updateRiverMaterial(reach.materials.surface, visualMaterial, 1);
        setRiverSurfaceAppearanceBinding(reach.materials.surface, binding);
        if (reach.materials.surfaceLocalMap) {
          updateRiverMaterial(reach.materials.surfaceLocalMap, visualMaterial, 1);
          setRiverSurfaceAppearanceBinding(reach.materials.surfaceLocalMap, binding);
        }
      }
    }
    this._updateSurfaceClock(true);
  }

  setDepthWriteEnabled(enabled: boolean): void {
    this._depthWriteEnabled = enabled;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        setRiverSurfaceDepthWriteEnabled(reach.materials.surface, enabled);
        if (reach.materials.surfaceLocalMap) setRiverSurfaceDepthWriteEnabled(reach.materials.surfaceLocalMap, enabled);
      }
    }
  }

  /** Replaces only the common reflection input while preserving River optics authoring. */
  setReflectionBinding(binding?: Readonly<WaterReflectionBinding>): void {
    const current = this._surfaceOpticsBinding;
    if (!current) {
      if (binding) {
        throw new Error("River reflection binding requires an active surface optics binding.");
      }
      return;
    }
    if (this._isReflectionBindingCurrent(binding)) return;
    current.reflection = binding;
    for (const runtimeSet of this._runtimeSets.values()) {
      for (const reach of runtimeSet.reaches) {
        applyRiverReflectionBinding(reach.materials.surface, current.tier, binding);
        if (reach.materials.surfaceLocalMap) {
          applyRiverReflectionBinding(reach.materials.surfaceLocalMap, current.tier, binding);
        }
      }
    }
    this._recordAppliedReflectionBinding(binding);
  }

  private _isReflectionBindingCurrent(binding: Readonly<WaterReflectionBinding> | undefined): boolean {
    if (!this._reflectionBindingApplied) return false;
    if (!binding) return this._surfaceOpticsBinding?.reflection === undefined;
    return binding.bindingRevision !== undefined && binding.bindingRevision === this._appliedReflectionBindingRevision;
  }

  private _recordAppliedReflectionBinding(binding: Readonly<WaterReflectionBinding> | undefined): void {
    this._reflectionBindingApplied = true;
    this._appliedReflectionBindingRevision = binding?.bindingRevision;
  }

  /**
   * Completes explicit River cleanup without collecting unrelated live Engine resources.
   * @returns Nothing.
   */
  flushDeferredResources(): void {}

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const clock = this._surfaceClock;
    if (clock) clock.updateDomains = undefined;
    this._surfaceClock = undefined;
    const runtimeSets = [...this._runtimeSets.values()];
    this._runtimeSets.clear();
    this._activeReaches = [];
    this._activeChunks = [];
    this._activeQueryService = undefined;
    this._activeId = undefined;
    cleanupRuntime([
      () => clock?.destroy(),
      ...runtimeSets.map((runtimeSet) => () => this._destroyRuntimeSet(runtimeSet))
    ]);
  }

  private _createRuntimeSet(
    networkId: string,
    resource: RiverResource,
    sources?: readonly RiverRuntimeReachSource[]
  ): MutableRiverRuntimeSet {
    const compiledData = resource.data;
    const root = this._root.createChild(`river-runtime-${compiledData.sourceId}`);
    let resourceRetained = false;
    let localMapTexture: Texture2D | undefined;
    let connectionBinding: WaterConnectionBinding | undefined;
    let reaches: MutableRiverRuntimeReach[] = [];
    const chunks: MutableRiverRuntimeChunk[] = [];
    try {
      resource.retain();
      resourceRetained = true;
      localMapTexture = compiledData.terrainInteraction.localMapAtlas
        ? createRiverLocalMapTexture(this._engine, compiledData.terrainInteraction.localMapAtlas)
        : undefined;
      if (localMapTexture) localMapTexture.isGCIgnored = true;
      connectionBinding = createWaterConnectionBinding(this._engine, compiledData.connections);
      reaches = this._createReaches(compiledData, root, sources, localMapTexture, connectionBinding);
      for (const chunk of compiledData.chunks) {
        chunks.push(this._createChunk(networkId, chunk, reaches, root, compiledData));
      }
      const queryService = new RiverNetworkQueryService(compiledData);
      return {
        root,
        resource,
        reaches,
        chunks,
        queryService,
        spatialFieldProvider: new RiverWaterSpatialFieldProvider(queryService, {
          sourceHash: resource.identity.sourceHash,
          compiledHash: resource.identity.compiledHash,
          sourceSchemaVersion: resource.identity.schemaVersion,
          bounds: getRiverWaterSpatialBounds(compiledData)
        }),
        localMapTexture,
        connectionBinding,
        ownedTextures: new Set(localMapTexture ? [localMapTexture] : []),
        ownedConnections: new Set(connectionBinding ? [connectionBinding] : [])
      };
    } catch (error) {
      cleanupRuntime(
        [
          ...reaches.map((reach) => () => this._destroyReachMaterials(reach, connectionBinding)),
          () => connectionBinding?.destroy(),
          ...chunks.map((chunk) => () => this._destroyChunk(chunk)),
          () => localMapTexture?.destroy(true),
          () => root.destroy(),
          () => {
            if (resourceRetained) resource.release();
          }
        ],
        [error]
      );
      throw error;
    }
  }

  private _createReaches(
    compiledData: RiverCompiledData,
    root: Entity,
    sources?: readonly RiverRuntimeReachSource[],
    localMapTexture?: Texture2D,
    connectionBinding?: WaterConnectionBinding,
    reachIndices?: readonly number[]
  ): MutableRiverRuntimeReach[] {
    const surfaceAppearanceBinding = this._surfaceAppearanceBinding;
    if (!surfaceAppearanceBinding) {
      throw new Error("River runtime requires a compiled V2 Surface Appearance binding before activation.");
    }
    const surfaceOpticsBinding = this._surfaceOpticsBinding;
    if (!surfaceOpticsBinding) {
      throw new Error("River runtime requires a compiled V2 Surface Optics binding before activation.");
    }
    const reaches: MutableRiverRuntimeReach[] = [];
    try {
      for (const reachIndex of reachIndices ?? compiledData.reaches.keys()) {
        const reach = compiledData.reaches[reachIndex];
        const source = sources?.[reachIndex];
        const config = source?.config ?? cloneCompiledRiverConfig(reach.config);
        const reachRoot = root.createChild(`river-reach-${reach.id}`);
        let surface: Material | undefined;
        let surfaceLocalMap: Material | undefined;
        try {
          const visualMaterial = deriveRiverVisualMaterial(surfaceAppearanceBinding, config.material);
          surface = createRiverMaterial(
            this._engine,
            visualMaterial,
            1,
            compiledData.surfaceMotion,
            surfaceAppearanceBinding,
            surfaceOpticsBinding
          );
          surfaceLocalMap = localMapTexture
            ? createRiverLocalMapMaterial(
                this._engine,
                visualMaterial,
                1,
                compiledData.surfaceMotion,
                localMapTexture,
                surfaceAppearanceBinding,
                surfaceOpticsBinding
              )
            : undefined;
          if (this.surfaceShader) {
            surface.shader = this.surfaceShader;
            if (surfaceLocalMap) surfaceLocalMap.shader = this.surfaceShader;
          }
          connectionBinding?.bind(surface);
          if (surfaceLocalMap) connectionBinding?.bind(surfaceLocalMap);
          const materials: RiverRuntimeMaterialSet = { surface, surfaceLocalMap };
          pinMaterialSet(materials);
          setRiverSurfaceDepthWriteEnabled(materials.surface, this._depthWriteEnabled);
          setRiverSurfaceFeatureFlags(materials.surface, this._macroDisplacementEnabled, this._microSurfaceEnabled);
          setRiverSurfaceTimeOverride(materials.surface, this._surfaceTimeOverride);
          applyRiverSurfaceOpticsBinding(materials.surface, surfaceOpticsBinding);
          if (materials.surfaceLocalMap) {
            setRiverSurfaceDepthWriteEnabled(materials.surfaceLocalMap, this._depthWriteEnabled);
            setRiverSurfaceFeatureFlags(
              materials.surfaceLocalMap,
              this._macroDisplacementEnabled,
              this._microSurfaceEnabled
            );
            setRiverSurfaceTimeOverride(materials.surfaceLocalMap, this._surfaceTimeOverride);
            applyRiverSurfaceOpticsBinding(materials.surfaceLocalMap, surfaceOpticsBinding);
          }
          reaches.push({
            root: reachRoot,
            config,
            artifact: source?.artifact ?? reach.artifact,
            materials,
            localMapTexture
          });
        } catch (error) {
          cleanupRuntime(
            [
              () => {
                if (surface) connectionBinding?.unbind(surface);
              },
              () => surface?.destroy(true),
              () => {
                if (surfaceLocalMap) connectionBinding?.unbind(surfaceLocalMap);
              },
              () => surfaceLocalMap?.destroy(true)
            ],
            [error]
          );
          throw error;
        }
      }
      return reaches;
    } catch (error) {
      cleanupRuntime(
        reaches.map((reach) => () => this._destroyReachMaterials(reach, connectionBinding)),
        [error]
      );
      throw error;
    }
  }

  private _createChunk(
    networkId: string,
    chunk: RiverCompiledChunk,
    reaches: readonly MutableRiverRuntimeReach[],
    runtimeRoot: Entity,
    compiledData: RiverCompiledData
  ): MutableRiverRuntimeChunk {
    const parent = chunk.sourceKind === RiverChunkSourceKind.Reach ? reaches[chunk.sourceIndex].root : runtimeRoot;
    const root = parent.createChild(`river-chunk-${chunk.id}`);
    let meshes: RiverMeshBuildResult | undefined;
    try {
      const sourceId =
        chunk.sourceKind === RiverChunkSourceKind.Reach
          ? (compiledData.reaches[chunk.sourceIndex]?.id ?? chunk.id)
          : (compiledData.junctions[chunk.sourceIndex]?.id ?? chunk.id);
      root.transform.setPosition(chunk.localOrigin[0], chunk.localOrigin[1], chunk.localOrigin[2]);
      const surfaceRenderer = root.createChild(`${chunk.id}-water`).addComponent(MeshRenderer);
      applyWaterSurfaceRendererContract(surfaceRenderer);
      surfaceRenderer.priority = this._renderPriority;
      // Queries read immutable compiled buffers; render-only CPU copies end at upload.
      meshes = uploadRiverMeshes(this._engine, chunk, { releaseCpuData: true });
      const materialReach = reaches[chunk.materialSourceReachIndex];
      meshes.surfaceMesh.isGCIgnored = true;
      surfaceRenderer.mesh = meshes.surfaceMesh;
      surfaceRenderer.setMaterial(this._selectSurfaceMaterial(chunk, materialReach));
      const localMapTile =
        chunk.localMapTileIndex === undefined
          ? undefined
          : compiledData.terrainInteraction.localMapAtlas?.tiles[chunk.localMapTileIndex];
      if (localMapTile) {
        setRiverLocalMapRendererBinding(surfaceRenderer.shaderData, {
          chunkLocalOrigin: chunk.localOrigin,
          bodyToUv: localMapTile.worldToUv,
          uvRect: localMapTile.uvRect,
          confluence: localMapTile.kind === RiverLocalMapRegionKind.Confluence
        });
      }
      const runtimeChunk = {
        root,
        surfaceRenderer,
        compiled: chunk,
        sourceId,
        meshes,
        terrainOcclusionKey: `river:${networkId}:${chunk.id}`
      };
      root.isActive = true;
      return runtimeChunk;
    } catch (error) {
      root.destroy();
      destroyWaterOwnedMesh(meshes?.surfaceMesh);
      throw error;
    }
  }

  private _selectSurfaceMaterial(chunk: RiverCompiledChunk, reach: MutableRiverRuntimeReach): Material {
    return chunk.localMapTileIndex !== undefined && reach.materials.surfaceLocalMap
      ? reach.materials.surfaceLocalMap
      : reach.materials.surface;
  }

  private _deactivateAll(): void {
    for (const runtimeSet of this._runtimeSets.values()) {
      runtimeSet.root.isActive = false;
    }
  }

  private _destroyChunk(chunk: MutableRiverRuntimeChunk): void {
    chunk.root.destroy();
    destroyWaterOwnedMesh(chunk.meshes.surfaceMesh);
  }

  // Reach entities remain under the runtime root until all borrowers and their atlas have retired.
  private _destroyReachMaterials(reach: MutableRiverRuntimeReach, connectionBinding?: WaterConnectionBinding): void {
    cleanupRuntime([
      () => connectionBinding?.unbind(reach.materials.surface),
      () => reach.materials.surface.destroy(true),
      () => {
        if (reach.materials.surfaceLocalMap) connectionBinding?.unbind(reach.materials.surfaceLocalMap);
      },
      () => reach.materials.surfaceLocalMap?.destroy(true)
    ]);
  }

  private _runtimeCleanupActions(runtimeSet: MutableRiverRuntimeSet): (() => void)[] {
    return [
      ...runtimeSet.reaches.map((reach) => () => this._destroyReachMaterials(reach, runtimeSet.connectionBinding)),
      ...[...runtimeSet.ownedConnections].map((binding) => () => binding.destroy()),
      () => runtimeSet.spatialFieldProvider.destroy(),
      ...runtimeSet.chunks.map((chunk) => () => this._destroyChunk(chunk)),
      ...[...runtimeSet.ownedTextures].map((texture) => () => texture.destroy(true)),
      () => runtimeSet.root.destroy(),
      () => runtimeSet.resource.release()
    ];
  }

  private _destroyRuntimeSet(runtimeSet: MutableRiverRuntimeSet): void {
    cleanupRuntime(this._runtimeCleanupActions(runtimeSet));
  }
}
