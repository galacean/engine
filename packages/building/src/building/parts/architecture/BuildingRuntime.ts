import { buildingPartKey, buildingGroupKey, buildingInstanceKey } from "../../runtime/BuildingObjectIdentity";
export { buildingInstanceKey };
import {
  Component,
  Script,
  BoundingBox,
  BufferMesh,
  MeshRenderer,
  Matrix,
  Quaternion,
  Vector3,
  type Entity,
  type Camera,
  type Material,
  type PrefabResource
} from "@galacean/engine";
import { markGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { BuildingCpuClient, type BuildingCpuHandle } from "./BuildingCpuClient";
import type { BuildingCoreDraft } from "../../core";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import { prepareBuildingTerrain } from "./BuildingTerrain";
import type { BuildingPlacementFrame } from "./BuildingTerrain";
import { buildingWorldRegion, compileBuildingCpu, prepareBuildingOnGround } from "./BuildingCpu";
import { prepareBuildingDetail } from "./BuildingDetail";
import { terrainAffectsRegion, validateConstructionTerrain } from "../../runtime/TerrainField";
import type { ConstructionTerrainSource } from "../../runtime/TerrainField";
import { BuildingOccupancyQuery } from "../../runtime/BuildingOccupancyQuery";
import {
  CONSTRUCTION_EXIT_SECONDS,
  ConstructionEntrance,
  type ConstructionEntranceState
} from "../../runtime/ConstructionEntrance";
import { hasConstructionWallRoofJointParams } from "../../runtime/ConstructionWallRoofJoint";
import { createBuildingDistanceView } from "../../runtime/BuildingDistanceView";
import { BuildingGlobalProxy } from "../../runtime/BuildingGlobalProxy";
import {
  MasonryResidency,
  createMasonryResidencyMetrics,
  type MasonryResidencyEntry
} from "../../runtime/MasonryResidency";
import { MasonryLodProbe } from "../../runtime/MasonryLodPolicy";
import { MasonryLodTransition } from "../../runtime/MasonryLodTransition";
import { constructionDecorationLights } from "../../runtime/ConstructionDecorationLightPolicy";
import {
  ConstructionDecorationLights,
  type ConstructionDecorationLight
} from "../../runtime/ConstructionDecorationLights";
import { buildingAssets, retainBuildingResource } from "../../resources/BuildingAssetKit";
import { resolveDocument } from "../../runtime/PlacementDocument.js";
import { inspectMasonrySurface } from "../../runtime/MasonrySurfaceInspection";
import type { RuntimePickVisitor } from "@galacean/engine-modify/rendering/runtime-pick-source";
type BoundFocus = { entity: Entity; position: Vector3; forward?: Vector3 };
function bindFocus(
  poses: readonly BuildingFocusPose[],
  bindings: ReadonlyMap<string, BuildingObjectBinding>,
  frame: Entity,
  rigid: boolean
) {
  const result = new Map<Component, BoundFocus>();
  for (const pose of poses) {
    const binding = bindings.get(buildingPartKey(pose.part));
    if (!binding) throw Error("Missing focus author binding: " + pose.part);
    const position = new Vector3(...pose.position),
      forward = pose.forward ? new Vector3(...pose.forward) : undefined;
    const mounted = rigid && pose.attachment;
    if (mounted) {
      const inverse = new Matrix();
      inverse.copyFromArray(binding.inverse);
      Vector3.transformCoordinate(position, inverse, position);
      if (forward) Vector3.transformNormal(forward, inverse, forward);
    }
    result.set(binding.member, { entity: mounted ? binding.member.entity : frame, position, forward });
  }
  return result;
}
/** Where the camera looks at an author part: a point, and a direction to look from. */
type BuildingFocusPose = {
  part: string;
  position: readonly number[];
  forward?: readonly number[];
  attachment?: boolean;
};
type Candidate = Awaited<ReturnType<typeof prepareBuildingDetail>>;
/** The main-thread counterpart of a Worker preparation, with the same handle. */
function localCandidate(
  draft: BuildingCoreDraft,
  height: TerrainHeight,
  grounding: Parameters<typeof prepareBuildingOnGround>[1]["grounding"],
  assets: Parameters<typeof prepareBuildingOnGround>[2]
) {
  const { prepared, ...preview } = prepareBuildingOnGround(draft, { height, grounding }, assets);
  let disposed = false;
  const cpu: BuildingCpuHandle = {
    get valid() {
      return !disposed;
    },
    compile: async (signal) => {
      if (disposed) throw Error("Building compilation snapshot disposed");
      signal.throwIfAborted();
      return compileBuildingCpu(prepared);
    },
    preview: async (signal) => {
      if (disposed) throw Error("Building compilation snapshot disposed");
      signal.throwIfAborted();
      return prepareBuildingOnGround(draft, { height, grounding }, assets).preview;
    },
    dispose: () => {
      disposed = true;
    }
  };
  return { ...preview, cpu };
}
type BuildingObjectBinding = { member: Component; inverse: readonly number[] };
type BoundLight = { descriptor: ConstructionDecorationLight; member: Component; local: Vector3 };
function rigidBindings(bindings: ReadonlyMap<string, BuildingObjectBinding>) {
  return {
    poses: new Map([...bindings].map(([key, binding]) => [key, binding.inverse])),
    resolve: (key: string) => bindings.get(key)?.member.entity
  };
}
function bindLights(
  lights: ConstructionDecorationLight[],
  bindings: ReadonlyMap<string, BuildingObjectBinding>,
  frame: Entity
): BoundLight[] {
  return lights.map((light) => {
    const id = light.decorationId !== undefined ? buildingPartKey(light.decorationId) : buildingGroupKey(light.ownerId),
      binding = bindings.get(id);
    if (!binding) throw Error(`Missing light binding ${id}`);
    const inverse = new Matrix();
    inverse.copyFromArray(binding.inverse);
    const local = new Vector3(...light.position);
    Vector3.transformCoordinate(local, inverse, local);
    return {
      descriptor: {
        ...light,
        id: buildingInstanceKey(frame, light.id),
        ownerId: buildingInstanceKey(frame, buildingGroupKey(light.ownerId)),
        position: [...light.position] as [number, number, number]
      },
      member: binding.member,
      local
    };
  });
}
export type BuildingRuntimeInput = {
  assets?: PrefabResource;
  execution?: "worker" | "main";
  terrainHeight?: TerrainHeight;
  draft: BuildingCoreDraft;
  placement: BuildingPlacementFrame;
  bindings: Map<string, BuildingObjectBinding>;
  bodies: Component[];
  groupIds: Map<Component, string>;
  terrain: ConstructionTerrainSource;
  worldFrame?: Matrix;
  signature: string;
};
type ProfileView = MasonryResidencyEntry & {
  kind: "profile";
  entranceStates: Map<string, ConstructionEntranceState>;
  fine?: Candidate;
  frame: Entity;
  view: Awaited<ReturnType<typeof createBuildingDistanceView>>;
  signature: string;
  lights: BoundLight[];
  bodies: Component[];
  groupIds: Map<Component, string>;
  entranceInstanceKeys: readonly string[];
  worldMatrix: Float64Array;
  retryAt?: number;
  occupancy: BuildingOccupancyQuery;
  worldOccupancy?: BuildingOccupancyQuery;
  occupancyMatrix: Float64Array;
  cpu: BuildingCpuHandle;
  diagnostics: readonly { source: string; message: string }[];
  focus: Map<Component, BoundFocus>;
  inspection?: { controller: AbortController; result: Promise<ReturnType<typeof resolveDocument>["cells"]> };
};
type View = ProfileView;
function viewRoot(view: View): Entity {
  return view.view.root;
}
function viewValid(view: View): boolean {
  return view.cpu.valid;
}
function destroyView(view: View): void {
  view.cpu.dispose();
  view.inspection?.controller.abort();
  view.fine?.destroy();
  view.view.destroy();
}
function showView(view: View, visible: boolean): void {
  viewRoot(view).isActive = visible;
  if (view.fine) view.fine.runtime.root.isActive = visible;
}
export interface BuildingRuntimeHost {
  camera: Camera;
  terrain?: ConstructionTerrainSource;
  frame(owner: Component): Entity;
  isBody(member: Component): boolean;
  /** Classify the supplied published groups in order, sharing one author scan. */
  kinds(owners: readonly Component[]): string[];
  groupIdentity(member: Component): string;
  resolve(id: string): Component | undefined;
  validate(members: Iterable<Component>): void;
  collect(
    frame: Entity,
    bodies: Component[],
    members: Iterable<Component>,
    terrain?: ConstructionTerrainSource
  ): BuildingRuntimeInput;
}
type Build = {
  frame: Entity;
  bodies: Component[];
  signature: string;
  controller: AbortController;
  checkedRevision: number;
};
/** Scene scheduling and publication only; author models are supplied by the host.
 * The same runtime owns Worker snapshots, local rebuilds, terrain transactions,
 * residency and picking for any part collection. */
export class BuildingRuntime extends Script {
  private readonly compiler = new BuildingCpuClient();
  /** Shared multi-worker Building CPU compiler pool owned by this runtime. */
  get cpuCompiler(): BuildingCpuClient {
    return this.compiler;
  }
  protected readonly members = new Map<Component, ReturnType<Entity["transform"]["registerWorldChangeFlag"]>>();
  private readonly dirtyTransformMembers = new Set<Component>();
  protected readonly views = new Map<Entity, View>();
  protected readonly entries: ProfileView[] = [];
  private readonly residencyMetrics = {
    ...createMasonryResidencyMetrics(),
    detailAttempts: 0,
    detailFailures: 0,
    budgetDeferred: 0
  };
  private residency?: MasonryResidency<ProfileView>;
  protected host?: BuildingRuntimeHost;
  private pending?: Promise<void>;
  private detailPending?: Promise<void>;
  private build?: Build;
  private detailBuild?: Build;
  private detailDirty = true;
  private retryAt = Infinity;
  private revision = 0;
  private surfaceRevision = 0;
  private generationSerial = 0;
  get generation(): number {
    return this.generationSerial;
  }
  /** Live inspection for editors/Agents that deliberately cannot invoke methods.
   * Reading does not advance compilation or consume transform invalidation. */
  get buildStatus() {
    return {
      bound: !!this.host,
      pending: !!(
        this.inputUpdates ||
        this.terrainUpdate ||
        this.pending ||
        this.detailPending ||
        this.detailDirty ||
        this.applied !== this.revision ||
        [...this.members.values()].some((flag) => flag.flag)
      ),
      generation: this.generationSerial,
      errors: this.errors(),
      diagnostics: this.diagnostics()
    };
  }
  private shown = true;
  private applied = -1;
  private probeRevision = -1;
  private frameRevision = -1;
  private frameGroups = new Map<Entity, Component[]>();
  private inputCacheRevision = -1;
  private inputCacheTerrain?: ConstructionTerrainSource;
  private readonly inputCache = new Map<Entity, BuildingRuntimeInput>();
  private error?: unknown;
  private publishedTerrain?: ConstructionTerrainSource;
  private terrainUpdate?: { discard(): void };
  private inputUpdates = 0;
  private closed = false;
  private lights?: ConstructionDecorationLights;
  private lightsDirty = true;
  private hasWorldDecorationLights = false;
  private readonly lightDescriptors: ConstructionDecorationLight[] = [];
  private readonly lightPosition = new Vector3();
  private readonly entrance = new ConstructionEntrance();
  private readonly exitingViews: {
    view: View;
    progress: number;
    anchor?: Entity;
    coarseVisible: boolean;
    fineActive: boolean;
  }[] = [];
  private entranceEnabled = false;
  private entranceStarted = false;

  /** Presentation visibility is independent of the manager's Engine tick. */
  get visible(): boolean {
    return this.shown;
  }
  set visible(value: boolean) {
    if (value === this.shown) return;
    this.shown = value;
    this.surfaceRevision++;
    this.lightsDirty = true;
    for (const view of this.views.values()) showView(view, value);
    for (const item of this.exitingViews) {
      if (item.anchor && !item.anchor.destroyed) item.anchor.isActive = value;
      if (!item.view.view.root.destroyed) item.view.view.root.isActive = value;
      item.view.view.setVisualVisible?.(value && item.coarseVisible);
      if (item.view.fine && !item.view.fine.runtime.root.destroyed) {
        item.view.fine.runtime.root.isActive = value && item.fineActive;
      }
    }
    this.updateResidency(0);
    this.updateLights(0);
  }
  get publicationRevision(): number {
    this.syncOccupancyRevision();
    return this.surfaceRevision;
  }

  /** After initial flush, hold published geometry at zero until the host's
   * world presentation barrier opens. Standalone scenes remain settled by default. */
  publishEntrance(): void {
    if (this.entranceEnabled) throw Error("Building entrance has already been published");
    this.entranceEnabled = true;
    this.entrance.publish();
    this.applyEntrance();
    this.updateLights(0);
  }
  startEntrance(): void {
    if (!this.entranceEnabled) throw Error("Building entrance has not been published");
    if (this.entranceStarted) return;
    this.entranceStarted = true;
    this.entrance.start();
  }
  /** Explicit preview only; geometry edits and residency never replay the clock. */
  replayEntrance(body?: Component): void {
    if (body && !this.members.has(body)) throw Error("Building is not active");
    const owners = body ? new Set([this.host!.groupIdentity(body)]) : undefined;
    this.entrance.replay(owners);
    this.applyEntrance();
    this.updateLights(0);
  }
  private applyEntrance(changed?: ReadonlySet<string>): void {
    let touched = false;
    for (const view of this.entries) {
      if (changed && !view.entranceInstanceKeys.some((key) => changed.has(key))) continue;
      view.view.setEntrance(view.entranceStates);
      view.fine?.runtime.setEntrance(view.entranceStates);
      if (view.lights.length) touched = true;
    }
    if (touched) this.lightsDirty = true;
  }

  bind(host: BuildingRuntimeHost): void {
    this.terrainUpdate?.discard();
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    this.clearExitingViews();
    if (host.terrain) validateConstructionTerrain(host.terrain.grid);
    this.publishedTerrain = host.terrain;
    this.host = host;
    BuildingRuntime.clearInputCache(this);
    this.lightsDirty = true;
    this.residency = new MasonryResidency(
      this.engine,
      host.camera,
      this.entries,
      this.residencyMetrics,
      () => {
        this.detailDirty = true;
      },
      () => {
        this.detailDirty = true;
      }
    );
    for (const view of this.views.values()) view.signature = "";
    this.invalidate();
  }
  add(component: Component): void {
    if (this.members.has(component)) return;
    const flag = component.entity.transform.registerWorldChangeFlag();
    if (typeof flag.dispatch === "function") {
      const prevDispatch = flag.dispatch as (type?: number, param?: unknown) => void;
      flag.dispatch = (type?: number, param?: unknown) => {
        prevDispatch.call(flag, type, param);
        this.dirtyTransformMembers.add(component);
        BuildingRuntime.clearInputCache(this);
      };
    }
    if (flag.flag) this.dirtyTransformMembers.add(component);
    this.members.set(component, flag);
    this.invalidate();
  }
  protected removeMember(component: Component): void {
    this.dirtyTransformMembers.delete(component);
    this.members.get(component)?.destroy();
    this.members.delete(component);
    this.lightsDirty = true;
    if (this.host?.isBody(component)) {
      for (const build of [this.build, this.detailBuild])
        if (build?.bodies.includes(component)) build.controller.abort();
      for (const [frame, view] of this.views)
        if (view.bodies.includes(component)) {
          view.signature = "";
          for (const build of [this.build, this.detailBuild]) if (build?.frame === frame) build.controller.abort();
          const id = view.groupIds.get(component)!;
          view.occupancy = view.occupancy.withoutOwner(id);
          view.worldOccupancy = undefined;
          this.surfaceRevision++;
          if (view.bodies.every((body) => !this.members.has(body))) {
            this.retire(view, true);
          } else {
            view.view.setOwnerVisible(id, false);
            for (const draw of view.fine?.runtime.draws.values() ?? [])
              if (draw.ownerId === id) {
                draw.enabled = false;
                draw.renderer.enabled = false;
                if (draw.lodRenderer) draw.lodRenderer.enabled = false;
              }
          }
        }
    }
    this.invalidate();
  }
  /** Batch authored inputs without rebuilding against an intermediate environment. */
  async beginInputUpdate(): Promise<void> {
    this.inputUpdates++;
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    // Previous input failures cannot veto applying their repair. The new input is validated at flush.
    await Promise.allSettled([this.pending, this.detailPending]);
  }
  endInputUpdate(): void {
    if (this.inputUpdates) this.inputUpdates--;
  }

  private static clearInputCache(runtime: BuildingRuntime): void {
    runtime.inputCache?.clear();
    runtime.inputCacheTerrain = undefined;
    runtime.inputCacheRevision = -1;
  }

  invalidate(): void {
    this.revision++;
    BuildingRuntime.clearInputCache(this);
  }
  private readTransforms(): void {
    // A restarted Worker no longer owns these snapshots, even if author inputs are unchanged.
    for (const view of this.views.values())
      if (view.signature && !viewValid(view)) {
        view.signature = "";
        this.invalidate();
      }
    if (!this.dirtyTransformMembers.size) return;
    let dirtied = false;
    for (const member of this.dirtyTransformMembers) {
      const flag = this.members.get(member);
      if (!flag || !flag.flag) continue;
      member.entity.transform.worldMatrix;
      flag.flag = false;
      dirtied = true;
    }
    this.dirtyTransformMembers.clear();
    if (dirtied) {
      this.lightsDirty = true;
      this.invalidate();
    }
  }
  onUpdate(deltaTime: number): void {
    this.readTransforms();
    this.validateBuild();
    if (this.error && performance.now() >= this.retryAt) {
      this.retryAt = Infinity;
      this.invalidate();
    }
    if (this.entrance.advance(deltaTime)) this.applyEntrance(this.entrance.changed);
    this.advanceExitingViews(deltaTime);
    this.updateResidency(deltaTime);
    this.updateLights(deltaTime);
    if (this.host && !this.inputUpdates && !this.terrainUpdate && !this.pending && this.applied !== this.revision)
      void this.flush().catch(() => {});
  }
  /** Publish changed Scene inputs and finish currently eligible detail loads.
   * Distant groups remain editable and pickable through their distance view. */
  async flush(): Promise<void> {
    if (this.closed) throw Error("Building system is disposed");
    if (this.inputUpdates) throw new DOMException("Building inputs are being applied", "AbortError");
    if (this.terrainUpdate) throw Error("Building environment publication is pending");
    if (!this.host) throw Error("Building system has no Scene identity provider");
    do {
      this.readTransforms();
      this.validateBuild();
      while (this.applied !== this.revision && !this.closed) {
        if (!this.pending)
          this.pending = this.drain().finally(() => {
            this.pending = undefined;
          });
        await this.pending;
        if (this.inputUpdates) throw new DOMException("Building inputs are being applied", "AbortError");
      }
      if (this.closed) throw Error("Building system is disposed");
      if (this.error) throw this.error;
      this.updateResidency(0);
      await this.detailPending;
      this.readTransforms();
      this.validateBuild();
    } while (this.applied !== this.revision);
    this.updateResidency(0);
    const failure = this.entries.find((entry) => entry.error && this.residency!.desired.has(entry));
    if (failure) throw Error(failure.error);
    this.updateLights(0);
  }
  get terrainSource(): ConstructionTerrainSource | undefined {
    return this.publishedTerrain;
  }
  /** The actual compilation group owned by this Scene, also used for explicit
   * group placement. No independent group directory is maintained by editors. */
  groupEntity(body: Component): Entity {
    if (!this.host || !this.members.has(body)) throw Error("Building body is not active in this Scene");
    return this.host.frame(body);
  }
  get terrainEditPending(): boolean {
    return !!this.terrainUpdate;
  }
  /** Stage all groups against one immutable environment. Scene objects stay live;
   * only derived meshes are hidden. Commit/rollback/finalize are synchronous so
   * the world can publish terrain, collision and buildings in one transaction. */
  async prepareTerrain(next: ConstructionTerrainSource, signal?: AbortSignal) {
    if (!next) throw Error("Published building terrain is unavailable");
    validateConstructionTerrain(next.grid);
    signal?.throwIfAborted();
    if (!this.inputUpdates) await this.flush();
    this.host!.validate(this.members.keys());
    signal?.throwIfAborted();
    if (this.terrainUpdate) throw Error("Building environment publication is pending");
    this.readTransforms();
    const revision = this.revision,
      host = this.host!;
    let previous = this.publishedTerrain;
    const before = [...this.views.values()],
      prepared: View[] = [];
    const beforeSignatures = new Map(before.map((view) => [view, view.signature]));
    const preparedSignatures = new Map<View, string>();
    let finished = false,
      committed = false;
    const check = () => {
      signal?.throwIfAborted();
      this.readTransforms();
      if (
        finished ||
        this.closed ||
        prepared.some((view) => !viewValid(view)) ||
        this.host !== host ||
        this.revision !== revision ||
        this.publishedTerrain !== (committed ? next : previous)
      )
        throw Error("Building environment candidate is stale");
    };
    const install = (
      entries: View[],
      terrain: ConstructionTerrainSource | undefined,
      signatures: ReadonlyMap<View, string>
    ) => {
      for (const entry of this.views.values()) showView(entry, false);
      this.views.clear();
      this.entries.length = 0;
      this.residency!.desired.clear();
      this.publishedTerrain = terrain;
      BuildingRuntime.clearInputCache(this);
      for (const entry of entries) {
        entry.signature = signatures.get(entry)!;
        this.views.set(entry.frame, entry);
        if (entry.kind === "profile") this.entries.push(entry);
        this.acceptEntrance(entry);
        this.refreshProbe(entry);
        showView(entry, this.shown);
      }
      this.residency!.selectionDirty = true;
      this.residency!.invalidate();
      if (prepared.some((view) => !beforeSignatures.has(view))) {
        this.surfaceRevision++;
        this.generationSerial++;
      }
      this.probeRevision = -1;
      this.detailDirty = true;
      this.lightsDirty = true;
      this.updateResidency(0);
      this.updateLights(0);
    };
    const destroy = (entries: View[]) => {
      for (const entry of entries) destroyView(entry);
    };
    const finish = () => {
      finished = true;
      signal?.removeEventListener("abort", discard);
      if (this.terrainUpdate === token) this.terrainUpdate = undefined;
      // A settled transaction no longer owns the previous world or its views.
      previous = undefined;
      before.length = 0;
      beforeSignatures.clear();
      preparedSignatures.clear();
      BuildingRuntime.clearInputCache(this);
    };
    const rollback = () => {
      if (finished || !committed) return;
      install(before, previous, beforeSignatures);
      committed = false;
    };
    const discard = () => {
      if (finished) return;
      rollback();
      destroy(prepared.filter((view) => !beforeSignatures.has(view)));
      finish();
    };
    const token = (this.terrainUpdate = { discard });
    this.detailBuild?.controller.abort();
    signal?.addEventListener("abort", discard, { once: true });
    try {
      check();
      const frameList = [...this.frames().keys()];
      const effectiveSignal = signal ?? new AbortController().signal;
      const views = await Promise.all(
        frameList.map(async (frame) => {
          const input = this.input(frame, next),
            old = this.views.get(frame);
          const unchanged =
            old &&
            previous &&
            old.signature === this.input(frame, previous).signature &&
            input.execution !== "main" &&
            !terrainAffectsRegion(buildingWorldRegion(input.draft, input.placement), previous.grid, next.grid);
          const view = unchanged ? old : await this.prepareView(frame, input, check, effectiveSignal);
          return { view, signature: input.signature };
        })
      );
      for (const { view, signature } of views) {
        prepared.push(view);
        preparedSignatures.set(view, signature);
      }
      check();
      // Capture immutable spatial facts before accepting, for navigation and
      // other world consumers. Hidden render state never leaks into live queries.
      const queries = this.queriesFor(prepared);
      return {
        metrics: {
          buildingSupportCandidates: prepared.reduce((sum, view) => sum + view.bodies.length, 0),
          buildingSupportsUpdated: prepared
            .filter((view) => !beforeSignatures.has(view))
            .reduce((sum, view) => sum + view.bodies.length, 0),
          buildingsRetained: prepared
            .filter((view) => beforeSignatures.has(view))
            .reduce((sum, view) => sum + view.bodies.length, 0)
        },
        bounds: queries.flatMap((query) => query.bounds),
        captureOccupancyQuery: () => this.captureQueries(queries),
        prepareShaderWarmup: (warmupSignal?: AbortSignal) => {
          check();
          return this.prepareShaderWarmupForViews(
            prepared.filter((view): view is ProfileView => view.kind === "profile"),
            prepared,
            warmupSignal,
            next
          );
        },
        assertCurrent: check,
        commit: () => {
          check();
          if (committed) throw Error("Building environment candidate is already committed");
          // Set first so even an unexpected mutate-then-throw setter can roll back.
          committed = true;
          try {
            install(prepared, next, preparedSignatures);
          } catch (error) {
            rollback();
            throw error;
          }
        },
        rollback,
        finalize: () => {
          if (finished) return;
          if (!committed) throw Error("Building environment must be committed before finalizing");
          destroy(before.filter((view) => !preparedSignatures.has(view)));
          finish();
        },
        discard
      };
    } catch (error) {
      discard();
      throw error;
    }
  }
  /** Derived mounted pose for inspection; the attachment Entity stores roof UV, not its rendered position. */
  private frames(): Map<Entity, Component[]> {
    if (this.frameRevision === this.revision) return this.frameGroups;
    const frames = new Map<Entity, Component[]>();
    for (const member of this.members.keys())
      if (this.host!.isBody(member)) {
        const frame = this.host!.frame(member);
        if (frame.destroyed || frame.scene !== this.entity.scene)
          throw Error("Building frame must belong to the active Scene");
        const bodies = frames.get(frame) ?? [];
        bodies.push(member);
        frames.set(frame, bodies);
      }
    this.frameRevision = this.revision;
    this.frameGroups = frames;
    return frames;
  }
  protected input(frame: Entity, publishedTerrain = this.publishedTerrain): BuildingRuntimeInput {
    const useCache = publishedTerrain === this.publishedTerrain && this.dirtyTransformMembers.size === 0;
    if (useCache) {
      if (this.inputCacheRevision !== this.revision || this.inputCacheTerrain !== publishedTerrain) {
        this.inputCache.clear();
        this.inputCacheRevision = this.revision;
        this.inputCacheTerrain = publishedTerrain;
      }
      const cached = this.inputCache.get(frame);
      if (cached) return cached;
    }
    const bodies = this.frames().get(frame);
    if (!bodies?.length) throw Error("Building group no longer has active owners");
    const collected = this.host!.collect(frame, bodies, this.members.keys(), publishedTerrain);
    if (useCache) this.inputCache.set(frame, collected);
    return collected;
  }
  private validateBuild(force = false): void {
    this.validateSingleBuild(this.build, force);
    this.validateSingleBuild(this.detailBuild, force);
  }
  private validateSingleBuild(build: Build | undefined, force: boolean): void {
    if (!build || build.controller.signal.aborted || (!force && build.checkedRevision === this.revision)) return;
    build.checkedRevision = this.revision;
    try {
      if (this.input(build.frame).signature === build.signature) return;
    } catch {
      /* Report the invalid current input through the next publication. */
    }
    build.controller.abort();
    this.invalidate();
  }
  private retire(view: View, animateExit = false): void {
    if (view.kind === "profile") this.residency?.desired.delete(view);
    this.views.delete(view.frame);
    this.lightsDirty = true;
    const index = view.kind === "profile" ? this.entries.indexOf(view) : -1;
    if (index >= 0) this.entries.splice(index, 1);
    const canAnimateExit =
      animateExit &&
      this.entranceEnabled &&
      this.entranceStarted &&
      !this.closed &&
      this.shown &&
      view.visible &&
      !view.view.root.destroyed &&
      view.view.root.isActiveInHierarchy &&
      !this.entity.destroyed &&
      this.entity.isActiveInHierarchy;
    if (canAnimateExit) {
      // Detach generated geometry from the author frame onto a runtime-owned anchor so
      // frame.destroy() (editor entity.delete / BuildingManager.remove) cannot cascade-destroy
      // the exit dissolve animation synchronously.
      const coarseVisible = view.view.isVisualVisible ?? true;
      const fineActive = Boolean(view.fine && !view.fine.runtime.root.destroyed && view.fine.runtime.root.isActive);
      const anchor = this.entity.createChild("Building exiting");
      markGeneratedBuildingOutput(anchor);
      const frameTransform = view.frame.transform;
      anchor.transform.worldPosition = frameTransform.worldPosition;
      anchor.transform.worldRotationQuaternion = frameTransform.worldRotationQuaternion;
      anchor.transform.scale = frameTransform.lossyWorldScale;
      anchor.addChild(view.view.root);
      view.view.setPickable?.(false);
      if (view.fine && !view.fine.runtime.root.destroyed) {
        anchor.addChild(view.fine.runtime.root);
      }
      for (const [id, range] of view.view.entranceRanges) {
        view.entranceStates.set(id, {
          progress: 0.999,
          minimumY: range.min,
          height: Math.max(0.001, range.max - range.min)
        });
      }
      view.view.setEntrance(view.entranceStates);
      if (view.fine && !view.fine.runtime.root.destroyed) {
        view.fine.runtime.setEntrance(view.entranceStates);
      }
      this.exitingViews.push({ view, progress: 1, anchor, coarseVisible, fineActive });
    } else {
      destroyView(view);
    }
    if (this.residency) {
      this.residency.selectionDirty = true;
      this.residency.invalidate();
    }
    this.detailDirty = true;
  }
  private advanceExitingViews(deltaTime: number): void {
    if (this.exitingViews.length === 0) return;
    const step = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime / CONSTRUCTION_EXIT_SECONDS : 0;
    for (let i = this.exitingViews.length - 1; i >= 0; i--) {
      const item = this.exitingViews[i]!;
      if (item.view.view.root.destroyed || item.anchor?.destroyed) {
        this.exitingViews.splice(i, 1);
        destroyView(item.view);
        if (item.anchor && !item.anchor.destroyed) item.anchor.destroy();
        continue;
      }
      item.progress = Math.max(0, item.progress - step);
      if (item.progress <= 0) {
        this.exitingViews.splice(i, 1);
        destroyView(item.view);
        if (item.anchor && !item.anchor.destroyed) item.anchor.destroy();
        continue;
      }
      for (const state of item.view.entranceStates.values()) state.progress = item.progress;
      item.view.view.setEntrance(item.view.entranceStates);
      if (item.view.fine && !item.view.fine.runtime.root.destroyed) {
        item.view.fine.runtime.setEntrance(item.view.entranceStates);
      }
    }
  }
  private clearExitingViews(): void {
    for (const item of this.exitingViews) {
      destroyView(item.view);
      if (item.anchor && !item.anchor.destroyed) item.anchor.destroy();
    }
    this.exitingViews.length = 0;
  }
  private refreshProbe(view: View): void {
    const matrix = viewRoot(view).transform.worldMatrix,
      elements = matrix.elements;
    if (view.worldMatrix.every((value, i) => value === elements[i])) return;
    view.worldMatrix.set(elements);
    const bounds = new BoundingBox(new Vector3(...view.view.bounds.min), new Vector3(...view.view.bounds.max));
    BoundingBox.transform(bounds, matrix, bounds);
    const scale = Math.max(...[0, 4, 8].map((i) => Math.hypot(elements[i], elements[i + 1], elements[i + 2])));
    view.probe = new MasonryLodProbe(
      { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] },
      [0, 0, 0],
      0.3 * scale
    );
    this.residency!.selectionDirty = true;
  }
  private acceptEntrance(view: View, previous?: View): void {
    for (const [id, range] of view.view.entranceRanges) {
      const key = buildingInstanceKey(view.frame, buildingGroupKey(id));
      if (this.entranceEnabled) {
        if (previous && this.entranceStarted && previous.entranceStates.has(id)) {
          this.entrance.sweep(key, range.min, range.max, true);
        } else {
          this.entrance.accept(key, range.min, range.max, this.entranceStarted);
        }
      } else {
        this.entrance.define(key, range.min, range.max);
      }
      view.entranceStates.set(id, this.entrance.states.get(key)!);
    }
    view.view.setEntrance(view.entranceStates);
    view.fine?.runtime.setEntrance(view.entranceStates);
  }
  /** Allocates only derived, hidden geometry. No author state or live view changes. */
  private async prepareView(
    frame: Entity,
    input: BuildingRuntimeInput,
    check: () => void,
    signal: AbortSignal
  ): Promise<View> {
    const { assets, draft, placement, signature, bindings, bodies, groupIds, terrain } = input;
    if (!assets) throw Error("Building parts require a native material library");
    let distance: ProfileView["view"] | undefined;
    let cpu: BuildingCpuHandle | undefined;
    retainBuildingResource(assets, 1);
    try {
      buildingAssets(assets);
      check();
      // A height function runs the same preparation on the main thread; a terrain grid
      // travels to the Worker.
      const units = buildingAssets(assets).compilation;
      const candidate =
        input.execution === "main"
          ? localCandidate(
              draft,
              input.terrainHeight!,
              prepareBuildingTerrain(terrain.grid, placement).grounding,
              units
            )
          : await this.compiler.prepare(draft, terrain.grid, units, signal, { frame: placement });
      cpu = candidate.cpu;
      const { preview: geometry, occupancy: occupancyData } = candidate;
      check();
      const occupancy = BuildingOccupancyQuery.fromSnapshot(occupancyData!);
      const cpuHandle = cpu;
      distance = await createBuildingDistanceView(
        this.engine,
        frame,
        {
          ...candidate.appearance,
          rigidDecorations: rigidBindings(bindings)
        },
        geometry,
        assets,
        this.host!.camera,
        signal,
        {
          unifiedGlobalProxy: true,
          loadPreview: cpuHandle.preview ? (s) => cpuHandle.preview!(s) : undefined
        }
      );
      markGeneratedBuildingOutput(distance.root);
      distance.root.isActive = false;
      await distance.ready;
      check();
      if (!cpu.valid) throw Error("Building compilation snapshot expired during view preparation");
      if (this.closed) throw Error("Building system is disposed");
      const lights = bindLights(constructionDecorationLights(geometry.decorationParts), bindings, frame);
      const entranceInstanceKeys: string[] = [];
      for (const id of new Set(groupIds.values()))
        entranceInstanceKeys.push(buildingInstanceKey(frame, buildingGroupKey(id)));
      return {
        kind: "profile",
        entranceStates: new Map(),
        frame,
        view: distance,
        signature,
        lights,
        bodies,
        groupIds,
        entranceInstanceKeys,
        occupancy,
        cpu,
        diagnostics: candidate.diagnostics,
        focus: bindFocus(candidate.focus, bindings, frame, true),
        occupancyMatrix: new Float64Array(16).fill(NaN),
        lod: 2,
        transition: new MasonryLodTransition(),
        prefetch: false,
        probe: new MasonryLodProbe(distance.bounds, [0, 0, 0]),
        budgetLod: 2,
        lastUsed: performance.now(),
        priority: 0,
        visible: false,
        worldMatrix: new Float64Array(16).fill(NaN)
      };
    } catch (error) {
      // Only live edits retry failed GPU/texture loads automatically. Detached
      // environment failures belong to their caller's transaction.
      if (distance && !this.terrainUpdate) this.retryAt = performance.now() + 2000;
      cpu?.dispose();
      distance?.destroy();
      throw error;
    } finally {
      retainBuildingResource(assets, -1);
    }
  }

  private async drain(): Promise<void> {
    while (!this.closed && !this.inputUpdates && this.applied !== this.revision) {
      const revision = this.revision;
      let build: Build | undefined;
      this.error = undefined;
      this.retryAt = Infinity;
      try {
        this.host!.validate(this.members.keys());
        const frames = this.frames();
        for (const [frame, view] of this.views) if (!frames.has(frame)) this.retire(view, true);
        for (const frame of frames.keys()) {
          const input = this.input(frame),
            { signature, bodies } = input;
          const old = this.views.get(frame);
          if (old?.signature === signature) continue;
          build = this.build = {
            frame,
            bodies,
            signature,
            controller: new AbortController(),
            checkedRevision: this.revision
          };
          let candidate: View | undefined;
          try {
            candidate = await this.prepareView(
              frame,
              input,
              () => {
                this.readTransforms();
                this.validateBuild(true);
                build!.controller.signal.throwIfAborted();
              },
              build.controller.signal
            );
            this.acceptEntrance(candidate, old);
            if (!old || !old.occupancy.hasSameGeometry(candidate.occupancy)) this.surfaceRevision++;
            if (old) this.retire(old, false);
            this.views.set(frame, candidate);
            this.lightsDirty = true;
            if (candidate.kind === "profile") this.entries.push(candidate);
            this.refreshProbe(candidate);
            showView(candidate, this.shown);
            this.generationSerial++;
            candidate = undefined;
            this.residency!.selectionDirty = true;
            this.residency!.invalidate();
            this.detailDirty = true;
          } catch (error) {
            if (candidate) destroyView(candidate);
            throw error;
          }
          this.build = build = undefined;
        }
      } catch (error) {
        if (!build?.controller.signal.aborted) this.error = error;
      } finally {
        this.build = undefined;
      }
      if (!this.inputUpdates && revision === this.revision) {
        this.applied = revision;
        if (!this.error) {
          const activeIds = new Set(
            [...this.members.keys()]
              .filter((member) => this.host!.isBody(member))
              .map((member) => this.host!.groupIdentity(member))
          );
          for (const id of this.entrance.states.keys()) if (!activeIds.has(id)) this.entrance.remove(id);
        }
      }
    }
  }
  private updateResidency(deltaTime: number): void {
    if (!this.residency || this.closed) return;
    if (this.probeRevision !== this.revision) {
      for (const view of this.entries) this.refreshProbe(view);
      this.probeRevision = this.revision;
    }
    const now = performance.now();
    this.residency.updateDemand(deltaTime, this.shown);
    this.residency.updatePresentation(now, this.shown);
    for (let i = 0, n = this.entries.length; i < n; i++) {
      const retryAt = this.entries[i].retryAt;
      if (retryAt !== undefined && now >= retryAt) {
        this.detailDirty = true;
        break;
      }
    }
    if (
      !this.inputUpdates &&
      !this.terrainUpdate &&
      this.applied === this.revision &&
      !this.pending &&
      !this.detailPending &&
      this.detailDirty
    )
      this.detailPending = this.pumpDetails().finally(() => {
        this.detailPending = undefined;
      });
  }
  private async pumpDetails(): Promise<void> {
    this.detailDirty = false;
    while (!this.closed && !this.inputUpdates && !this.terrainUpdate && this.applied === this.revision) {
      const residency = this.residency!;
      residency.refreshPriorities();
      let view: ProfileView | undefined;
      for (const candidate of residency.desired) {
        if (candidate.fine || (candidate.retryAt !== undefined && candidate.retryAt > performance.now())) continue;
        if (!view || residency.compareResidency(candidate, view) > 0) view = candidate;
      }
      if (!view) return;
      if (!residency.admit(view)) {
        this.residencyMetrics.budgetDeferred++;
        return;
      }
      let fine: Candidate | undefined, build: Build | undefined;
      try {
        const input = this.input(view.frame);
        if (input.signature !== view.signature) {
          this.invalidate();
          return;
        }
        build = this.detailBuild = {
          frame: view.frame,
          bodies: input.bodies,
          signature: input.signature,
          controller: new AbortController(),
          checkedRevision: this.revision
        };
        this.residencyMetrics.detailAttempts++;
        fine = await prepareBuildingDetail(view.cpu, {
          assets: input.assets!,
          parent: view.frame,
          camera: this.host!.camera,
          signal: build.controller.signal,
          terrainGrid: input.terrain?.grid,
          rigidDecorations: rigidBindings(input.bindings)
        });
        markGeneratedBuildingOutput(fine.runtime.root);
        this.readTransforms();
        this.validateBuild(true);
        build.controller.signal.throwIfAborted();
        if (this.closed || this.views.get(view.frame) !== view || !residency.desired.has(view)) {
          fine.destroy();
          continue;
        }
        fine.commit();
        if (input.worldFrame) {
          const placement = input.placement,
            rotation = new Quaternion(),
            matrix = new Matrix();
          Quaternion.rotationEuler(0, placement.rotationY, 0, rotation);
          Matrix.affineTransformation(
            new Vector3(1, 1, 1),
            rotation,
            new Vector3(...fine.grounding!.renderPosition),
            matrix
          );
          fine.runtime.root.transform.worldMatrix = matrix;
        }
        fine.runtime.setEntrance(view.entranceStates);
        view.fine = fine;
        view.view.releasePendingGeometry?.();
        fine = undefined;
        view.error = undefined;
        view.retryAt = undefined;
        residency.invalidate();
        residency.updatePresentation(performance.now(), this.shown);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        fine?.destroy();
        if (!build?.controller.signal.aborted && !this.closed && this.views.get(view.frame) === view) {
          view.error = String(error);
          view.retryAt = performance.now() + 2000;
          this.residencyMetrics.detailFailures++;
          residency.invalidate();
        }
      } finally {
        this.detailBuild = undefined;
      }
    }
  }
  private updateLights(deltaSeconds: number): void {
    if (!this.host) return;
    if (this.lightsDirty) {
      this.lightsDirty = false;
      this.lightDescriptors.length = 0;
      let hasAnyViewLights = false;
      if (this.shown)
        for (const view of this.views.values())
          for (const light of view.lights) {
            const object = light.member;
            if (!this.members.has(object)) continue;
            hasAnyViewLights = true;
            if (view.kind === "profile" && (this.entrance.states.get(light.descriptor.ownerId)?.progress ?? 1) < 1)
              continue;
            Vector3.transformCoordinate(light.local, object.entity.transform.worldMatrix, this.lightPosition);
            const p = light.descriptor.position;
            p[0] = this.lightPosition.x;
            p[1] = this.lightPosition.y;
            p[2] = this.lightPosition.z;
            this.lightDescriptors.push(light.descriptor);
          }
      this.hasWorldDecorationLights = hasAnyViewLights;
    }
    if (!this.lights && (this.lightDescriptors.length || this.hasWorldDecorationLights))
      this.lights = new ConstructionDecorationLights(this.entity, 4);
    this.lights?.update(this.lightDescriptors, this.host.camera, deltaSeconds, this.hasWorldDecorationLights);
  }
  private viewMatrixChanged(view: View, elements: Float32Array): boolean {
    const cached = view.occupancyMatrix;
    for (let i = 0; i < 16; i++) {
      if (cached[i] !== elements[i]) return true;
    }
    return false;
  }
  private ensureViewOccupancy(view: View): BuildingOccupancyQuery {
    const matrix = viewRoot(view).transform.worldMatrix,
      elements = matrix.elements;
    if (!view.worldOccupancy || this.viewMatrixChanged(view, elements)) {
      view.worldOccupancy = BuildingOccupancyQuery.fromSnapshot(
        view.occupancy
          .transformed(matrix)
          .snapshot()
          .map((part) => ({ ...part, owner: buildingInstanceKey(view.frame, buildingGroupKey(part.owner)) }))
      );
      view.occupancyMatrix.set(elements);
    }
    return view.worldOccupancy;
  }
  private syncOccupancyRevision(): void {
    if (!this.shown || !this.enabled || !this.entity.isActiveInHierarchy) return;
    let changed = false;
    for (const view of this.views.values()) {
      const root = viewRoot(view);
      const elements = root.transform.worldMatrix.elements;
      if (!changed && this.viewMatrixChanged(view, elements)) {
        this.surfaceRevision++;
        changed = true;
      }
      if (root.isActiveInHierarchy && (!view.worldOccupancy || this.viewMatrixChanged(view, elements))) {
        this.ensureViewOccupancy(view);
      }
    }
  }
  private occupancyQueries(): BuildingOccupancyQuery[] {
    if (!this.shown || !this.enabled || !this.entity.isActiveInHierarchy) return [];
    let changed = false;
    const queries: BuildingOccupancyQuery[] = [];
    for (const view of this.views.values()) {
      const root = viewRoot(view);
      if (!changed && this.viewMatrixChanged(view, root.transform.worldMatrix.elements)) {
        this.surfaceRevision++;
        changed = true;
      }
      if (root.isActiveInHierarchy) {
        queries.push(this.ensureViewOccupancy(view));
      }
    }
    return queries;
  }
  private queriesFor(entries: readonly View[]): BuildingOccupancyQuery[] {
    const queries: BuildingOccupancyQuery[] = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      queries[i] = this.ensureViewOccupancy(entries[i]);
    }
    return queries;
  }
  /** Occupied envelopes of the currently published component geometry.
   * Independent of GPU residency and entrance animation; no planning OBB approximation. */
  get bounds() {
    return this.occupancyQueries().flatMap((query) => query.bounds);
  }
  /** Presentation bounds include the roof and generated units even while hidden
   * for a comparison or an atomic publication. Collision bounds stay separate. */
  get visualBounds(): { min: number[]; max: number[] }[] {
    const result: { min: number[]; max: number[] }[] = [];
    const append = (box: BoundingBox) =>
      result.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
    for (const view of this.views.values()) {
      const box = new BoundingBox(new Vector3(...view.view.bounds.min), new Vector3(...view.view.bounds.max));
      BoundingBox.transform(box, view.view.root.transform.worldMatrix, box);
      append(box);
    }
    return result;
  }
  captureOccupancyQuery() {
    return this.captureQueries(this.occupancyQueries());
  }
  private captureQueries(queries: readonly BuildingOccupancyQuery[]) {
    return Object.freeze({
      intersectBounds(min: [number, number, number], max: [number, number, number]) {
        for (const query of queries) {
          const hit = query.intersectBounds(min, max);
          if (hit) return hit;
        }
        return null;
      }
    });
  }
  async inspectBinding(frame: Entity, id: string, polygon?: number[][]) {
    const view = this.views.get(frame);
    if (!view) throw Error("Building surface has no published group");
    this.readTransforms();
    if (this.input(frame).signature !== view.signature) throw Error("Building has unpublished changes");
    if (view.fine) return view.fine.inspectSurface(id, polygon);
    if (!view.inspection) {
      const input = this.input(view.frame),
        controller = new AbortController();
      if (input.signature !== view.signature) throw Error("Building has unpublished changes");
      const result = (async () => {
        retainBuildingResource(input.assets ?? null, 1);
        try {
          buildingAssets(input.assets!);
          controller.signal.throwIfAborted();
          const { renderInput: layout } = await view.cpu.compile(controller.signal);
          return resolveDocument(
            { document: layout.placementDocument, plans: layout.plans, groups: layout.groups },
            layout.placementDocument
          ).cells;
        } finally {
          retainBuildingResource(input.assets ?? null, -1);
        }
      })();
      view.inspection = { controller, result };
      void result.catch(() => {
        if (view.inspection?.controller === controller) view.inspection = undefined;
      });
    }
    const cells = await view.inspection.result;
    this.readTransforms();
    if (this.views.get(view.frame) !== view || this.input(view.frame).signature !== view.signature)
      throw Error("Building changed during surface inspection");
    return inspectMasonrySurface(cells, id, polygon);
  }
  resolve(id: string): Component | undefined {
    const object = this.host?.resolve(id);
    if (object && this.members.has(object)) return object;
  }
  visitPickBatches(visitor: RuntimePickVisitor): void {
    const activeScene = this.engine.sceneManager.activeScene;
    if (activeScene) BuildingGlobalProxy.existing(activeScene)?.visitPickBatches(visitor);
    for (const view of this.views.values()) {
      const scopedVisitor: RuntimePickVisitor & { __fromRuntime?: boolean } = (batch) =>
        visitor({
          ...batch,
          resolve: (index, position) => {
            const id = batch.resolve(index, position);
            return id === undefined ? undefined : buildingInstanceKey(view.frame, id);
          }
        });
      scopedVisitor.__fromRuntime = true;
      view.view.visitPickBatches(scopedVisitor);
      for (const draw of view.fine?.runtime.draws.values() ?? [])
        for (const renderer of draw.lodRenderer ? [draw.renderer, draw.lodRenderer] : [draw.renderer]) {
          if (!renderer.enabled || !renderer.entity.isActiveInHierarchy) continue;
          const ids = draw.pickIds ?? [
            draw.objectBinding?.id ??
              (draw.pickId !== undefined ? buildingPartKey(draw.pickId) : buildingGroupKey(draw.ownerId!))
          ];
          scopedVisitor({
            renderer,
            count: ids.length,
            resolve: (index) => ids[index],
            prepare: () => {
              if (draw.pickIds) renderer.shaderData.setFloat("renderer_MasonryPickObjects", 1);
            },
            restore: () => renderer.shaderData.setFloat("renderer_MasonryPickObjects", 0)
          });
        }
    }
  }
  metrics() {
    const count = (entity: Entity): number => 1 + entity.children.reduce((sum, child) => sum + count(child), 0);
    const mainTriangles = 0;
    let draws = 0,
      renderers = 0,
      derivedEntities = count(this.entity);
    for (const view of this.entries) {
      for (const draw of view.fine?.runtime.draws.values() ?? []) {
        draws++;
        renderers += Number(draw.renderer.enabled) + Number(Boolean(draw.lodRenderer?.enabled));
      }
      if (view.fine) derivedEntities += count(view.fine.runtime.root);
      derivedEntities += count(view.view.root);
      const coarse = view.view.root.getComponentsIncludeChildren(MeshRenderer, []);
      draws += coarse.length;
      renderers += coarse.filter((renderer) => renderer.enabled && renderer.entity.isActiveInHierarchy).length;
    }
    const bodies = [...this.views.values()].flatMap((view) => view.bodies);
    this.residency?.refreshMetrics();
    return {
      ...this.residencyMetrics,
      triangles: this.residencyMetrics.triangles + mainTriangles,
      mainThreadTriangles: mainTriangles,
      authoredObjects: this.members.size,
      buildings: bodies.length,
      groups: this.views.size,
      houses: bodies.length ? this.host!.kinds(bodies).filter((kind) => kind === "house").length : 0,
      draws,
      enabledRenderers: renderers,
      derivedEntities,
      errors: [
        ...(this.error ? [String(this.error)] : []),
        ...this.entries.flatMap((view) => (view.error ? [view.error] : []))
      ]
    };
  }
  diagnostics() {
    return [...this.views.values()].flatMap((v) => v.diagnostics);
  }
  errors() {
    const errors = this.error ? [String(this.error)] : [];
    for (const view of this.entries) if (view.error) errors.push(view.error);
    return errors;
  }
  /**
   * Prepares offscreen representative LOD1 (BuildingDistanceView) and LOD0 (EngineResidentScene
   * + BrickPackKernel TransformFeedback) renderers so startup shader warmup compiles all building
   * shader variants before the user ever walks near a village.
   */
  async prepareShaderWarmup(signal?: AbortSignal): Promise<{
    renderers: MeshRenderer[];
    extraMaterials: Map<MeshRenderer, Material[]>;
    decorationPointLightBudget: number;
    dispose(): void;
  }> {
    return this.prepareShaderWarmupForViews(this.entries, [...this.views.values()], signal, this.publishedTerrain);
  }

  private async prepareShaderWarmupForViews(
    profileEntries: readonly ProfileView[],
    allViews: readonly View[],
    signal?: AbortSignal,
    publishedTerrain = this.publishedTerrain
  ): Promise<{
    renderers: MeshRenderer[];
    extraMaterials: Map<MeshRenderer, Material[]>;
    decorationPointLightBudget: number;
    dispose(): void;
  }> {
    const empty = {
      renderers: [] as MeshRenderer[],
      extraMaterials: new Map<MeshRenderer, Material[]>(),
      decorationPointLightBudget: 0,
      dispose() {}
    };
    if (this.closed || !this.host) return empty;
    signal?.throwIfAborted();

    // Report the signed delta for the 4-slot decoration point-light pool:
    // - Once a world with decoration lights is mounted, the pool stays active with zero-energy idle slots
    //   so `SCENE_POINT_LIGHT_COUNT` stays constant instead of compiling dual 0-light / 4-light shader sets.
    // - If the pool is active and the target world also has decoration lights, no point-light transition occurs (`0`).
    // - If the pool is active and the target world has no decoration lights, precompile `-activeSlots` (lights-OFF)
    //   even when `profileEntries.length === 0`.
    // - If the pool is inactive and the target world has decoration lights, precompile `+4` (lights-ON).
    const activeDecorationLights = this.lights?.root.isActiveInHierarchy ? this.lights.metrics.allocated : 0;
    const targetHasDecorationLights = allViews.some((view) => view.lights.length > 0);
    const decorationPointLightBudget =
      activeDecorationLights > 0
        ? targetHasDecorationLights
          ? 0
          : -activeDecorationLights
        : targetHasDecorationLights
          ? 4
          : 0;

    if (profileEntries.length === 0) return { ...empty, decorationPointLightBudget };

    const extraMaterials =
      BuildingGlobalProxy.existing(this.entity.scene!)?.getWarmupExtraMaterials() ??
      new Map<MeshRenderer, Material[]>();

    // Sort closest to camera first and choose a minimal representative subset (up to 3 buildings)
    // covering distinct part/material features so LOD1/LOD0 shaders warm up without materializing
    // distant buildings' LOD1 textures across the whole map.
    const camPos = this.host.camera.entity.transform.worldPosition;
    const ranked = profileEntries
      .filter((entry) => viewValid(entry))
      .map((entry) => {
        const b = entry.view.bounds;
        const cx = (b.min[0]! + b.max[0]!) * 0.5;
        const cy = (b.min[1]! + b.max[1]!) * 0.5;
        const cz = (b.min[2]! + b.max[2]!) * 0.5;
        const wm = entry.frame.transform.worldMatrix.elements;
        const wx = wm[0]! * cx + wm[4]! * cy + wm[8]! * cz + wm[12]!;
        const wy = wm[1]! * cx + wm[5]! * cy + wm[9]! * cz + wm[13]!;
        const wz = wm[2]! * cx + wm[6]! * cy + wm[10]! * cz + wm[14]!;
        const dx = wx - camPos.x;
        const dy = wy - camPos.y;
        const dz = wz - camPos.z;
        return { entry, distSq: dx * dx + dy * dy + dz * dz };
      })
      .sort((a, b) => a.distSq - b.distSq);

    const selected: Array<{ entry: ProfileView; input: BuildingRuntimeInput }> = [];
    const seenFeatures = new Set<string>();
    for (const { entry } of ranked) {
      let input: BuildingRuntimeInput;
      try {
        input = this.input(entry.frame, publishedTerrain);
      } catch {
        continue;
      }
      if (!input.assets) continue;
      const groupSharedById = new Map<string, Readonly<Record<string, unknown>>>();
      for (const group of input.draft.groups) {
        if (group.shared) groupSharedById.set(group.id, group.shared);
      }
      const resolveRef = (groupId: string, value: unknown): Record<string, unknown> | undefined => {
        if (!value || typeof value !== "object") return undefined;
        const obj = value as Record<string, unknown>;
        const ref = obj["@shared"];
        if (typeof ref === "string") {
          const shared = groupSharedById.get(groupId)?.[ref];
          if (shared && typeof shared === "object") {
            return { ...(shared as Record<string, unknown>), ...obj };
          }
        }
        return obj;
      };
      // Fingerprint strictly by shader-affecting features:
      // 1. Resolved unit material source (`brick`, `roof_tile`, `wooden_plank`, etc.) + part type.
      // 2. Whether the group produces a gable wall-roof joint (`injectWallRoofJoint` changes the brick/wood shader hash).
      const groupHasWallRoofJoint = new Map<string, boolean>();
      for (const group of input.draft.groups) {
        const house = group.shared?.house as
          | { circle?: unknown; roof?: { height?: number; ridge_length?: number } }
          | undefined;
        groupHasWallRoofJoint.set(
          group.id,
          Boolean(
            house &&
              hasConstructionWallRoofJointParams(
                Boolean(house.circle),
                house.roof?.height ?? 0,
                house.roof?.ridge_length ?? 0
              )
          )
        );
      }
      const features = new Set<string>();
      for (const part of input.draft.parts) {
        const unit = resolveRef(part.group, part.unit);
        const sourceKey =
          unit?.source === undefined ? "" : typeof unit.source === "string" ? unit.source : JSON.stringify(unit.source);
        const jointFlag = groupHasWallRoofJoint.get(part.group) ? "1" : "0";
        if (sourceKey) features.add(`unit:${sourceKey}|joint=${jointFlag}`);
        features.add(`part:${part.type}|${sourceKey}|joint=${jointFlag}`);
      }
      const addsFeature = [...features].some((f) => !seenFeatures.has(f));
      if (selected.length === 0 || addsFeature) {
        selected.push({ entry, input });
        for (const f of features) seenFeatures.add(f);
        if (selected.length >= 12) break;
      }
    }
    if (selected.length === 0) return { renderers: [], extraMaterials, decorationPointLightBudget, dispose() {} };

    const warmupRoot = this.entity.createChild("Masonry shader warmup");
    warmupRoot.isActive = false;
    markGeneratedBuildingOutput(warmupRoot);
    const details: Candidate[] = [];
    const warmedFarEntries: ProfileView[] = [];
    const renderers: MeshRenderer[] = [];
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    let cleanedUp = false;
    try {
      const preparedItems = await Promise.all(
        selected.map(async ({ entry, input }) => {
          signal?.throwIfAborted();
          if (cleanedUp || this.closed || !viewValid(entry)) return undefined;
          // Only release LOD1 after warmup for already-committed LOD2 views; releaseDetailedVisual()
          // itself guards views whose entrance cannot be played on GlobalProxy or that are actively viewing LOD1.
          const releaseFarAfterWarmup = this.views.get(entry.frame) === entry && !entry.fine && entry.lod === 2;
          if (releaseFarAfterWarmup) warmedFarEntries.push(entry);
          await entry.view.warmupDetailedVisual?.();
          if (cleanedUp) {
            if (releaseFarAfterWarmup && this.views.get(entry.frame) === entry && !entry.fine && entry.lod === 2) {
              entry.view.releaseDetailedVisual?.();
            }
            return undefined;
          }
          signal?.throwIfAborted();
          if (this.closed || !viewValid(entry)) return undefined;
          const detail = await prepareBuildingDetail(entry.cpu, {
            assets: input.assets!,
            parent: warmupRoot,
            camera: this.host!.camera,
            signal: controller.signal,
            terrainGrid: input.terrain?.grid,
            rigidDecorations: rigidBindings(input.bindings)
          });
          if (cleanedUp) {
            detail.destroy();
            return undefined;
          }
          details.push(detail);
          return { entry, detail };
        })
      );
      for (const item of preparedItems) {
        if (!item) continue;
        renderers.push(...item.entry.view.root.getComponentsIncludeChildren(MeshRenderer, []));
        renderers.push(...item.detail.runtime.root.getComponentsIncludeChildren(MeshRenderer, []));
      }
      return {
        renderers,
        extraMaterials,
        decorationPointLightBudget,
        dispose: () => {
          cleanedUp = true;
          controller.abort();
          for (const detail of details) detail.destroy();
          details.length = 0;
          for (const entry of warmedFarEntries) {
            if (!entry.fine && entry.lod === 2) entry.view.releaseDetailedVisual?.();
          }
          for (const entry of this.entries) {
            entry.view.releasePendingGeometry?.();
          }
          warmedFarEntries.length = 0;
          if (!warmupRoot.destroyed) warmupRoot.destroy();
        }
      };
    } catch (error) {
      cleanedUp = true;
      controller.abort(error);
      for (const detail of details) detail.destroy();
      details.length = 0;
      for (const entry of warmedFarEntries) {
        if (!entry.fine && entry.lod === 2) entry.view.releaseDetailedVisual?.();
      }
      warmedFarEntries.length = 0;
      if (!warmupRoot.destroyed) warmupRoot.destroy();
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  placementMetrics() {
    let profileUnits = 0,
      flatUnits = 0,
      entityInstances = 0;
    for (const v of this.views.values()) profileUnits += v.fine?.unitCount ?? 0;
    return { profileUnits, flatUnits, entityInstances };
  }
  onDestroy(): void {
    this.terrainUpdate?.discard();
    this.closed = true;
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    this.clearExitingViews();
    for (const view of [...this.views.values()]) this.retire(view, false);
    this.compiler.dispose();
    for (const flag of this.members.values()) flag.destroy();
    this.members.clear();
    this.dirtyTransformMembers.clear();
    BuildingRuntime.clearInputCache(this);
    this.lights?.dispose();
  }
}
