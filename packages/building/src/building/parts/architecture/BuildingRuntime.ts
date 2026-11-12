import { buildingPartKey, buildingGroupKey } from "../../runtime/BuildingObjectIdentity";
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
import { ConstructionSurfaceQuery } from "../../runtime/ConstructionSurfaceQuery";
import { ConstructionEntrance, type ConstructionEntranceState } from "../../runtime/ConstructionEntrance";
import { createBuildingDistanceView } from "../../runtime/BuildingDistanceView";
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
/** Runtime handles never enter author data or material random seeds. */
export function buildingInstanceKey(frame: Entity, localId: string): string {
  return JSON.stringify([frame.instanceId, localId]);
}
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
  worldMatrix: Float64Array;
  retryAt?: number;
  structure: ConstructionSurfaceQuery;
  worldStructure?: ConstructionSurfaceQuery;
  structureMatrix: Float64Array;
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
  protected readonly members = new Map<Component, ReturnType<Entity["transform"]["registerWorldChangeFlag"]>>();
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
  private error?: unknown;
  private publishedTerrain?: ConstructionTerrainSource;
  private terrainUpdate?: { discard(): void };
  private inputUpdates = 0;
  private closed = false;
  private lights?: ConstructionDecorationLights;
  private readonly lightDescriptors: ConstructionDecorationLight[] = [];
  private readonly lightPosition = new Vector3();
  private readonly entrance = new ConstructionEntrance();
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
    for (const view of this.views.values()) showView(view, value);
    this.updateResidency(0);
    this.updateLights(0);
  }
  get publicationRevision(): number {
    this.surfaceQueries();
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
    for (const view of this.entries) {
      if (
        changed &&
        ![...view.groupIds.values()].some((id) => changed.has(buildingInstanceKey(view.frame, buildingGroupKey(id))))
      )
        continue;
      view.view.setEntrance(view.entranceStates);
      view.fine?.runtime.setEntrance(view.entranceStates);
    }
  }

  bind(host: BuildingRuntimeHost): void {
    this.terrainUpdate?.discard();
    this.build?.controller.abort();
    this.detailBuild?.controller.abort();
    if (host.terrain) validateConstructionTerrain(host.terrain.grid);
    this.publishedTerrain = host.terrain;
    this.host = host;
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
    this.members.set(component, component.entity.transform.registerWorldChangeFlag());
    this.invalidate();
  }
  protected removeMember(component: Component): void {
    this.members.get(component)?.destroy();
    this.members.delete(component);
    if (this.host?.isBody(component)) {
      for (const build of [this.build, this.detailBuild])
        if (build?.bodies.includes(component)) build.controller.abort();
      for (const [frame, view] of this.views)
        if (view.bodies.includes(component)) {
          view.signature = "";
          for (const build of [this.build, this.detailBuild]) if (build?.frame === frame) build.controller.abort();
          const id = view.groupIds.get(component)!;
          view.view.setOwnerVisible(id, false);
          view.structure = view.structure.withoutOwner(id);
          view.worldStructure = undefined;
          this.surfaceRevision++;
          for (const draw of view.fine?.runtime.draws.values() ?? [])
            if (draw.ownerId === id) {
              draw.enabled = false;
              draw.renderer.enabled = draw.lodRenderer.enabled = false;
            }
          if (view.bodies.every((body) => !this.members.has(body))) this.retire(view);
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

  invalidate(): void {
    this.revision++;
  }
  private readTransforms(): void {
    // A restarted Worker no longer owns these snapshots, even if author inputs are unchanged.
    for (const view of this.views.values())
      if (view.signature && !viewValid(view)) {
        view.signature = "";
        this.invalidate();
      }
    for (const [member, flag] of this.members)
      if (flag.flag) {
        member.entity.transform.worldMatrix;
        flag.flag = false;
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
      for (const frame of this.frames().keys()) {
        const input = this.input(frame, next),
          old = this.views.get(frame);
        const unchanged =
          old &&
          previous &&
          old.signature === this.input(frame, previous).signature &&
          input.execution !== "main" &&
          !terrainAffectsRegion(buildingWorldRegion(input.draft, input.placement), previous.grid, next.grid);
        const view = unchanged
          ? old
          : await this.prepareView(frame, input, check, signal ?? new AbortController().signal);
        prepared.push(view);
        preparedSignatures.set(view, input.signature);
        check();
      }
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
        captureSurfaceQuery: () => this.captureQueries(queries),
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
    const bodies = this.frames().get(frame);
    if (!bodies?.length) throw Error("Building group no longer has active owners");
    return this.host!.collect(frame, bodies, this.members.keys(), publishedTerrain);
  }
  private validateBuild(force = false): void {
    for (const build of [this.build, this.detailBuild]) {
      if (!build || build.controller.signal.aborted || (!force && build.checkedRevision === this.revision)) continue;
      build.checkedRevision = this.revision;
      try {
        if (this.input(build.frame).signature === build.signature) continue;
      } catch {
        /* Report the invalid current input through the next publication. */
      }
      build.controller.abort();
      this.invalidate();
    }
  }
  private retire(view: View): void {
    if (view.kind === "profile") this.residency?.desired.delete(view);
    this.views.delete(view.frame);
    const index = view.kind === "profile" ? this.entries.indexOf(view) : -1;
    if (index >= 0) this.entries.splice(index, 1);
    destroyView(view);
    if (this.residency) {
      this.residency.selectionDirty = true;
      this.residency.invalidate();
    }
    this.detailDirty = true;
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
  private acceptEntrance(view: View): void {
    for (const [id, range] of view.view.entranceRanges) {
      const key = buildingInstanceKey(view.frame, buildingGroupKey(id));
      if (this.entranceEnabled) this.entrance.accept(key, range.min, range.max, this.entranceStarted);
      else this.entrance.define(key, range.min, range.max);
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
      const { preview: geometry, structure: structureData } = candidate;
      check();
      const structure = ConstructionSurfaceQuery.fromSnapshot(structureData!);
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
        signal
      );
      markGeneratedBuildingOutput(distance.root);
      distance.root.isActive = false;
      await distance.ready;
      check();
      if (!cpu.valid) throw Error("Building compilation snapshot expired during view preparation");
      if (this.closed) throw Error("Building system is disposed");
      const lights = bindLights(constructionDecorationLights(geometry.decorationParts), bindings, frame);
      return {
        kind: "profile",
        entranceStates: new Map(),
        frame,
        view: distance,
        signature,
        lights,
        bodies,
        groupIds,
        structure,
        cpu,
        diagnostics: candidate.diagnostics,
        focus: bindFocus(candidate.focus, bindings, frame, true),
        structureMatrix: new Float64Array(16).fill(NaN),
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
        for (const [frame, view] of this.views) if (!frames.has(frame)) this.retire(view);
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
            this.acceptEntrance(candidate);
            if (!old || !old.structure.hasSameGeometry(candidate.structure)) this.surfaceRevision++;
            if (old) this.retire(old);
            this.views.set(frame, candidate);
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
    this.residency.updateDemand(deltaTime);
    this.residency.updatePresentation(now);
    if (!this.shown)
      for (const view of this.entries) {
        view.view.root.isActive = false;
        if (view.fine) view.fine.runtime.root.isActive = false;
      }
    if (this.entries.some((entry) => entry.retryAt !== undefined && now >= entry.retryAt)) this.detailDirty = true;
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
        fine = undefined;
        view.error = undefined;
        view.retryAt = undefined;
        residency.invalidate();
        residency.updatePresentation(performance.now());
        if (!this.shown) {
          view.view.root.isActive = false;
          view.fine.runtime.root.isActive = false;
        }
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
    this.lightDescriptors.length = 0;
    if (this.shown)
      for (const view of this.views.values())
        for (const light of view.lights) {
          if (view.kind === "profile" && (this.entrance.states.get(light.descriptor.ownerId)?.progress ?? 1) < 1)
            continue;
          const object = light.member;
          if (!this.members.has(object)) continue;
          Vector3.transformCoordinate(light.local, object.entity.transform.worldMatrix, this.lightPosition);
          const p = light.descriptor.position;
          p[0] = this.lightPosition.x;
          p[1] = this.lightPosition.y;
          p[2] = this.lightPosition.z;
          this.lightDescriptors.push(light.descriptor);
        }
    if (!this.lights && this.lightDescriptors.length) this.lights = new ConstructionDecorationLights(this.entity, 4);
    this.lights?.update(this.lightDescriptors, this.host.camera, deltaSeconds);
  }
  private surfaceQueries(): ConstructionSurfaceQuery[] {
    if (!this.shown || !this.enabled || !this.entity.isActiveInHierarchy) return [];
    if (
      [...this.views.values()].some(
        (view) => !view.structureMatrix.every((value, i) => value === viewRoot(view).transform.worldMatrix.elements[i])
      )
    )
      this.surfaceRevision++;
    return this.queriesFor([...this.views.values()].filter((view) => viewRoot(view).isActiveInHierarchy));
  }
  private queriesFor(entries: readonly View[]): ConstructionSurfaceQuery[] {
    return entries.map((view) => {
      const matrix = viewRoot(view).transform.worldMatrix,
        elements = matrix.elements;
      if (!view.worldStructure || !view.structureMatrix.every((value, index) => value === elements[index])) {
        view.worldStructure = ConstructionSurfaceQuery.fromSnapshot(
          view.structure
            .transformed(matrix)
            .snapshot()
            .map((part) => ({ ...part, owner: buildingInstanceKey(view.frame, buildingGroupKey(part.owner)) }))
        );
        view.structureMatrix.set(elements);
      }
      return view.worldStructure;
    });
  }
  /** Structural surfaces from the published component geometry, including openings.
   * Independent of GPU residency and entrance animation; no planning OBB approximation. */
  get bounds() {
    return this.surfaceQueries().flatMap((query) => query.bounds);
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
  captureSurfaceQuery() {
    return this.captureQueries(this.surfaceQueries());
  }
  private captureQueries(queries: readonly ConstructionSurfaceQuery[]) {
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
  intersectSegment(start: [number, number, number], end: [number, number, number]) {
    let closest: ReturnType<ConstructionSurfaceQuery["intersectSegment"]> = null;
    for (const query of this.surfaceQueries()) {
      const hit = query.intersectSegment(start, end);
      if (hit && (!closest || hit.fraction < closest.fraction)) closest = hit;
    }
    return closest;
  }
  intersectCapsule(start: [number, number, number], end: [number, number, number], radius: number) {
    for (const query of this.surfaceQueries()) {
      const hit = query.intersectCapsule(start, end, radius);
      if (hit) return hit;
    }
    return null;
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
    if (this.views.get(view.frame) !== view || this.input(view.frame).signature !== view.signature)
      throw Error("Building changed during surface inspection");
    return inspectMasonrySurface(cells, id, polygon);
  }
  resolve(id: string): Component | undefined {
    const object = this.host?.resolve(id);
    if (object && this.members.has(object)) return object;
  }
  visitPickBatches(visitor: RuntimePickVisitor): void {
    for (const view of this.views.values()) {
      const scopedVisitor: RuntimePickVisitor = (batch) =>
        visitor({
          ...batch,
          resolve: (index, position) => {
            const id = batch.resolve(index, position);
            return id === undefined ? undefined : buildingInstanceKey(view.frame, id);
          }
        });
      view.view.visitPickBatches(scopedVisitor);
      for (const draw of view.fine?.runtime.draws.values() ?? [])
        for (const renderer of [draw.renderer, draw.lodRenderer]) {
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
        renderers += Number(draw.renderer.enabled) + Number(draw.lodRenderer.enabled);
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
    return this.metrics().errors;
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
    for (const view of [...this.views.values()]) this.retire(view);
    this.compiler.dispose();
    for (const flag of this.members.values()) flag.destroy();
    this.members.clear();
    this.lights?.dispose();
  }
}
