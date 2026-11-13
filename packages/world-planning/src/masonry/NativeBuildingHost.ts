import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import { type Camera, type Scene } from "@galacean/engine";
import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { BuildingManager } from "@galacean/engine-building/building/parts/architecture/BuildingManager";
import type { ConstructionTerrainSource } from "@galacean/engine-building/building/runtime/TerrainField";
import type { PublishedPlanningSeedScene } from "../spatial/runtime/PlanningSeedScenePublication";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { SeedWorldPickVisitor } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { masonryRockTerrainSource, masonryTerrainSource } from "./MasonryPlacement";

/** Application lifecycle only. Source components own authoring; the Scene manager
 * owns every live/hidden mesh. Retiring a world must never destroy its buildings. */
export class NativeBuildingHost {
  readonly system: BuildingManager;
  private bound = false;
  private disposed = false;
  private current?: NativeBuildingWorld;
  private readonly unregister: () => void;
  private diagnostic?: { id: string; occurredAt: string; message: string };
  constructor(
    project: RuntimeProjectSession,
    private readonly editor: RuntimeEditor,
    scene: Scene,
    private readonly camera: Camera
  ) {
    this.system = BuildingManager.forScene(scene);
    this.unregister = project.registerRuntimeActivation({
      before: () => this.system.beginInputUpdate(),
      finish: () => this.system.endInputUpdate(),
      after: () => this.synchronize(),
      diagnostics: () => (this.diagnostic ? [this.diagnostic] : [])
    });
  }
  async synchronize(): Promise<void> {
    if (this.bound) {
      try {
        await this.system.flush();
        this.diagnostic = undefined;
      } catch (error) {
        this.recordFailure(error);
        throw error;
      }
    }
  }
  private recordFailure(error: unknown): void {
    this.diagnostic = { id: "building-runtime", occurredAt: new Date().toISOString(), message: String(error) };
  }
  async prepare({
    terrain,
    signal
  }: {
    terrain: ConstructionTerrainSource;
    signal: AbortSignal;
  }): Promise<NativeBuildingWorld> {
    if (this.disposed) throw Error("Building host is disposed");
    // Bind to the current Scene projection; a saved consumer error must not prevent editor startup.
    if (!this.bound) {
      this.system.visible = false;
      this.system.bind({ camera: this.camera, terrain });
      this.bound = true;
      // The Scene owns the entrance clock, including startup with unavailable geometry.
      this.system.publishEntrance();
    }
    let prepared: Candidate | undefined;
    try {
      prepared = await this.system.prepareTerrain(terrain, signal);
      this.diagnostic = undefined;
    } catch (error) {
      prepared?.discard();
      signal.throwIfAborted();
      this.recordFailure(error);
      // Only initial startup may publish an editor with unavailable buildings.
      // Later terrain publications must still preserve their atomic boundary.
      if (this.current) throw error;
    }
    const candidate: NativeBuildingWorld = new NativeBuildingWorld(
      this.system,
      prepared,
      () => {
        this.current = candidate;
      },
      () => this.current === candidate
    );
    return candidate;
  }
  dispose(): void {
    this.disposed = true;
    this.unregister();
    this.system.destroy();
    this.current = undefined;
  }
}

type Candidate = Awaited<ReturnType<BuildingManager["prepareTerrain"]>>;
/** A world publication handle, never a second building model or Scene owner. */
export class NativeBuildingWorld {
  private accepted = false;
  private closed = false;
  private readonly wasVisible: boolean;
  constructor(
    private readonly system: BuildingManager,
    private prepared: Candidate | undefined,
    private readonly accept: () => void,
    private readonly isCurrent: () => boolean
  ) {
    this.wasVisible = system.visible;
  }
  assertCurrent(): void {
    if (this.accepted || this.closed) throw Error("Building world candidate is settled");
    this.prepared?.assertCurrent();
  }
  commitPublication(): void {
    this.assertCurrent();
    this.prepared?.commit();
    this.system.visible = true;
  }
  rollbackPublication(): void {
    if (this.accepted || this.closed) return;
    this.prepared?.rollback();
    this.system.visible = this.wasVisible;
  }
  activate(): void {
    if (this.accepted || this.closed) throw Error("Building world candidate is settled");
    this.accepted = true;
    this.accept();
    this.prepared?.finalize();
    this.prepared = undefined;
  }
  get publicationRevision() {
    return this.system.publicationRevision;
  }
  get presentationRevision() {
    return `${this.system.generation}:${this.system.publicationRevision}`;
  }
  get enabled() {
    return !this.closed && this.system.visible;
  }
  set enabled(value: boolean) {
    this.system.visible = value;
  }
  get metrics() {
    return this.system.metrics();
  }
  get terrainSource() {
    return this.system.terrainSource!;
  }
  get terrainEditPending() {
    return this.system.terrainEditPending;
  }
  get bounds() {
    return this.accepted || !this.prepared ? this.system.bounds : this.prepared.bounds;
  }
  captureOccupancyQuery() {
    return this.accepted || !this.prepared
      ? this.system.captureOccupancyQuery()
      : this.prepared.captureOccupancyQuery();
  }
  visitPickBatches(visitor: SeedWorldPickVisitor) {
    if (this.accepted && this.isCurrent()) this.system.visitPickBatches(visitor);
  }
  startEntrance() {
    this.system.startEntrance();
  }
  async prepareTerrain(published: Pick<PublishedPlanningSeedScene, "data" | "revision">, signal?: AbortSignal) {
    const next = masonryTerrainSource(published);
    return this.system.prepareTerrain(
      { ...next, grid: { ...next.grid, supports: this.terrainSource.grid.supports } },
      signal
    );
  }
  async prepareRockSupports(
    _plan: IslandPlan,
    formations: readonly RockFormationMesh[],
    revision: number,
    signal: AbortSignal
  ) {
    const started = performance.now();
    const candidate = await this.system.prepareTerrain(
      masonryRockTerrainSource(this.terrainSource, formations, revision),
      signal
    );
    return {
      metrics: { ...candidate.metrics, buildingSupportMs: performance.now() - started },
      prepareCommit: candidate.assertCurrent,
      commit: candidate.commit,
      rollback: candidate.rollback,
      finalize: candidate.finalize,
      discard: candidate.discard
    };
  }
  async destroy(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (!this.accepted) this.prepared?.discard();
    this.prepared = undefined;
  }
}
