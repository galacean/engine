import { AssetType, Camera, Color, Entity, GLTFResource, JSONAsset, Script } from "@galacean/engine";
import type { Animal, AnimalRoamingArea } from "./Animal";
import { AnimalCompanion } from "./AnimalCompanion";
import { GLBAnimalPresenter } from "./GLBAnimalPresenter";
import { readAnimalSpecies, type AnimalSpeciesDocument } from "./AnimalSpeciesAsset";
import { AnimalSystemComponent } from "./AnimalSystemComponent";
import type { AnimalSystem } from "./AnimalSystem";
import type { AnimalCommand, AnimalHost, AnimalReceipt, AnimalSnapshot } from "./AnimalTypes";

/** Serializable instance settings; shared species resources remain unchanged. */
export interface AnimalInstanceSettings {
  mode: "roaming" | "companion";
  seed: number;
  scale: number;
  area: AnimalRoamingArea;
  position: readonly [number, number];
  color: readonly [number, number, number];
}

/**
 * Scene component owning one animal instance and its borrowed Asset references.
 * Scene loaders set species/model/settings before onStart; runtime creation follows the same initialization path.
 */
export class AnimalComponent extends Script {
  /** Stock JSONAsset containing an AnimalSpeciesDocument; Scene serialization uses a resource reference. */
  species!: JSONAsset;
  /** Stock GLTF resource resolved by the host or Scene loader. */
  model!: GLTFResource;
  /** Authored instance settings, independent of runtime diagnostics. */
  settings: AnimalInstanceSettings = {
    mode: "roaming",
    seed: 1,
    scale: 1,
    area: { radius: 10 },
    position: [0, 0],
    color: [1, 1, 1]
  };
  /** Companion world queries and rider control; assigned by a deterministic host adapter. */
  host?: AnimalHost;
  /** Camera used for the optional authored three-level LOD. */
  lodCamera?: Camera;
  private _system?: AnimalSystem;
  private _animal?: Animal;
  private _companion?: AnimalCompanion;
  private _presenter?: GLBAnimalPresenter;
  private _initializing?: Promise<void>;
  private _ownedSpecies = false;
  private _lastPresentationTime = 0;

  /**
   * Resolve an asset and attach a ready instance under a host-owned Entity.
   * @param parent Scene parent; companion world transforms require an identity parent.
   * @param species Shared serializable species document, containing the model URL and capability data.
   * @param options Instance settings and optional companion host.
   * @returns A ready component; companions start absent until summoned.
   */
  static async create(
    parent: Entity,
    species: AnimalSpeciesDocument,
    options: Partial<AnimalInstanceSettings> & { host?: AnimalHost } = {}
  ): Promise<AnimalComponent> {
    const owner = parent.createChild(`Animal: ${species.id}`);
    owner.isActive = false;
    const component = owner.addComponent(AnimalComponent);
    component.species = new JSONAsset(parent.engine);
    component.species.data = species;
    component._ownedSpecies = true;
    const { host, ...settings } = options;
    component.settings = { ...component.settings, ...settings };
    component.host = host;
    try {
      readAnimalSpecies(component.species);
      component.model = await parent.engine.resourceManager.load<GLTFResource>({
        url: species.modelUrl,
        type: AssetType.GLTF,
        params: { keepMeshData: !!species.companion?.dissolve }
      });
      if (parent.destroyed || owner.destroyed) throw new Error("Animal host was destroyed during loading");
      await component.initialize();
      if (owner.destroyed) throw new Error("Animal was destroyed during initialization");
      owner.isActive = true;
      return component;
    } catch (error) {
      owner.destroy();
      throw error;
    }
  }

  /**
   * Initialize resolved Scene properties once; repeated calls join the same work.
   * @returns Completion after resource binding, capability validation and system registration.
   */
  initialize(): Promise<void> {
    return (this._initializing ??= this._initialize().catch((error) => {
      this._releaseRuntime();
      throw error;
    }));
  }

  /** Resolve properties supplied by a normal Scene/Prefab loader. */
  override onStart(): void {
    void this.initialize().catch((error) => {
      this.enabled = false;
      console.error("Animal initialization failed", error);
    });
  }

  /** Restore work after an Entity or component is re-enabled. */
  override onEnable(): void {
    const agent = this._animal ?? this._companion;
    if (agent) this._system?.setActive(agent, true);
  }

  /** Disabled components leave the active motion and decision sets. */
  override onDisable(): void {
    const agent = this._animal ?? this._companion;
    if (agent) this._system?.setActive(agent, false);
  }

  /** Live allocation-free roaming output; companion state is available through inspect(). */
  get motion() {
    return this._animal?.motion;
  }
  /** Optional rider capability, independent of species identity. */
  get mounted(): boolean {
    return this._companion?.mounted ?? false;
  }
  /** Animated saddle anchor consumed by existing rider hosts. */
  get saddle(): Entity {
    if (!this._companion) throw new Error("Animal has no companion capability");
    return this._companion.saddle;
  }
  /** Native animation currently evaluated by the companion presentation. */
  get currentAnimation(): string {
    return this._companion?.currentAnimation ?? "—";
  }
  /** Companion operation and interaction events. */
  get events() {
    return this._requireCompanion().events;
  }
  /** Accepted ground movement for sound/footstep adapters. */
  get groundedTravel() {
    return this._requireCompanion().groundedTravel;
  }

  /** Submit an idempotent companion command; unsupported capabilities reject deterministically. */
  execute(command: AnimalCommand): AnimalReceipt {
    return (
      this._companion?.execute(command) ?? {
        requestId: command.requestId,
        status: "rejected",
        detail: "unsupported_capability"
      }
    );
  }

  /** Copy companion diagnostics on demand, outside frame-loop consumers. */
  inspect(): AnimalSnapshot {
    return this._requireCompanion().inspect();
  }

  /** Evaluate presentation after the shared system has integrated all moving agents. */
  override onLateUpdate(seconds: number): void {
    if (this._animal) {
      const elapsed = this._system!.time - this._lastPresentationTime;
      this._lastPresentationTime = this._system!.time;
      this._presenter!.update(this._animal.motion, elapsed);
      if (this.lodCamera) this._presenter!.updateCameraLod(this.lodCamera);
    }
    this._companion?.lateUpdate(seconds);
    if (this.lodCamera) this._companion?.updateCameraLod(this.lodCamera);
  }

  /** Release this Entity and its instance-owned resources; borrowed model assets survive. */
  dispose(): void {
    if (!this.entity.destroyed) this.entity.destroy();
  }

  /** Unregister before destroying instance renderers, materials and controllers. */
  override onDestroy(): void {
    this._releaseRuntime();
    if (this._ownedSpecies) this.species.destroy();
  }

  private _releaseRuntime(): void {
    this._animal?.dispose();
    this._companion?.dispose();
    this._presenter?.dispose();
    this._animal = undefined;
    this._companion = undefined;
    this._presenter = undefined;
  }

  private async _initialize(): Promise<void> {
    if (this.entity.destroyed) throw new Error("Cannot initialize a destroyed animal");
    const species = readAnimalSpecies(this.species);
    const settings = this.settings;
    if (!Number.isFinite(settings.scale) || settings.scale <= 0) throw new RangeError("Animal scale must be positive");
    this._system = AnimalSystemComponent.getOrCreate(this.entity.scene!).system;
    this._lastPresentationTime = this._system.time;
    if (settings.mode === "companion") {
      if (!species.companion || !this.host)
        throw new Error("Companion animal requires a capability profile and world host");
      this._companion = new AnimalCompanion(
        this.entity,
        this.host,
        this._system,
        species,
        settings.scale,
        settings.seed
      );
      await this._companion.initialize(this.model, species);
    } else {
      if (!species.roaming) throw new Error("Animal has no roaming capability");
      const roaming = species.roaming;
      this._presenter = new GLBAnimalPresenter(
        this.entity,
        this.model,
        { ...roaming.presentation, scale: roaming.presentation.scale * settings.scale, lod: species.lod },
        new Color(...settings.color, 1)
      );
      this._animal = this._system.createAnimal(roaming.definition, settings.seed, settings.area, settings.position);
      this._presenter.update(this._animal.motion, 0);
    }
    this._system.setActive((this._animal ?? this._companion)!, this.enabled && this.entity.isActiveInHierarchy);
  }

  private _requireCompanion(): AnimalCompanion {
    if (!this._companion) throw new Error("Animal has no companion capability");
    return this._companion;
  }
}
