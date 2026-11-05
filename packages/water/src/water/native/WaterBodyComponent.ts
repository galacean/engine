import { Script, Material, ignoreClone, type Scene } from "@galacean/engine-core";
import type {
  WaterInteractionRequestV1,
  WaterRepresentationInstanceStateV1
} from "../authoring/body/WaterBodyInstance";
import { WaterBodyResource, WaterLookResource, WaterQualityResource, WaterTerrainResource } from "./WaterResources";
import {
  compileWaterShape,
  validateWaterShape,
  validateWaterAuthoringSettings,
  type WaterShapeAuthoring
} from "./WaterAuthoring";
import { waterMaterialKey } from "./WaterMaterial";
import { hashStableValue } from "../compiler/shared/determinism";
import { createWaterBodyInstance } from "../authoring/body/WaterBodyInstance";
import { createImmutableWaterSnapshot } from "../authoring/identity/WaterImmutableSnapshot";
import type { WaterBodyConnection } from "./WaterConnections";
import { createWaterQualitySettings, type WaterQualityInput, type WaterQualitySettings } from "./WaterQualitySettings";

export interface WaterBodyConfiguration {
  readonly asset: WaterBodyResource;
  readonly look?: WaterLookResource;
  readonly quality: WaterQualityResource;
  readonly material?: Material;
  readonly visible?: boolean;
  readonly priority?: number;
  readonly interaction?: WaterInteractionRequestV1;
  readonly representationState?: WaterRepresentationInstanceStateV1;
  /** Host compiler output may already be expressed in world metres. Not an author placement. */
  readonly sourceSpace?: "world";
}

/** Scene/Prefab author input. Compiler buffers and runtime resources never enter this value. */
export interface WaterBodyAuthoring
  extends Omit<WaterBodyConfiguration, "asset" | "look" | "quality" | "representationState" | "sourceSpace"> {
  readonly material: Material;
  readonly quality: WaterQualitySettings;
  readonly shape: WaterShapeAuthoring;
  readonly terrain?: WaterTerrainResource;
  /** The host prepares the final Terrain and the Water batch in one publication. */
  readonly terrainBinding?: "host";
  readonly connections?: readonly WaterBodyConnection[];
}

export type WaterBodyAuthoringInput = Omit<WaterBodyAuthoring, "quality"> & {
  readonly quality?: WaterQualityInput;
};

/** Internal bridge. Scene registry contains owners, not another copy of authored water data. */
export interface NativeWaterOwner {
  register(body: WaterBodyComponent): void;
  publish(body: WaterBodyComponent, config: Readonly<WaterBodyConfiguration>, signal: AbortSignal): Promise<number>;
  detach(body: WaterBodyComponent, forget?: boolean): Promise<void>;
  requestAuthoringUpdate?(body: WaterBodyComponent): Promise<void>;
}
export const nativeWaterOwners = new WeakMap<Scene, NativeWaterOwner>();

/** A retained configuration candidate. Only the System may publish it after the whole batch is ready. */
export interface PreparedWaterBodyConfiguration {
  readonly configuration: Readonly<WaterBodyConfiguration>;
  readonly signal: AbortSignal;
  check(): void;
  commit(revision: number): void;
  rollback(error?: unknown): void;
}

function resources(config?: WaterBodyConfiguration) {
  return config
    ? [
        config.asset,
        config.quality,
        ...(config.look ? [config.look] : []),
        ...(config.material ? [config.material] : [])
      ]
    : [];
}
function retain(config: WaterBodyConfiguration, delta: number): void {
  for (const resource of resources(config))
    if (!resource.destroyed) (resource as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
export function freezeConfiguration(config: WaterBodyConfiguration): Readonly<WaterBodyConfiguration> {
  const { asset, look, quality, material, ...settings } = config;
  return Object.freeze({ ...createImmutableWaterSnapshot(settings), asset, look, quality, material });
}

/** Scene instance. Transform is owned by Entity; authoring assets may be shared. */
export class WaterBodyComponent extends Script {
  private _authoring?: Readonly<WaterBodyAuthoring>;
  private _authoringAsset?: { key: string; resource: WaterBodyResource };
  private _authoringQuality?: { key: string; resource: WaterQualityResource };
  private _authoringAssets = new Set<WaterBodyResource | WaterQualityResource>();
  get authoring(): Readonly<WaterBodyAuthoring> | undefined {
    const input = this._authoring;
    // ReflectionParser resolves plain objects into the getter value before calling the setter.
    // Return a detached draft so property application cannot mutate accepted inputs.
    return (
      input && {
        ...input,
        quality: structuredClone(input.quality),
        shape: structuredClone(input.shape),
        interaction: input.interaction && { ...input.interaction },
        connections: input.connections?.map((connection) => ({
          ...connection,
          section: structuredClone(connection.section),
          transitionLengths: [...connection.transitionLengths]
        }))
      }
    );
  }
  set authoring(value: WaterBodyAuthoringInput) {
    if (this._disposed) throw new Error("DESTROYED: Water component was destroyed.");
    const shape = validateWaterShape(value.shape);
    const refs = [value.terrain, value.material].filter((resource) => resource !== undefined);
    if (
      (value.terrainBinding === "host"
        ? value.terrain !== undefined
        : !(value.terrain instanceof WaterTerrainResource)) ||
      (value.terrainBinding !== undefined && value.terrainBinding !== "host") ||
      refs.some((resource) => resource.destroyed || resource.engine !== this.engine)
    )
      throw new TypeError("INVALID_ARGUMENT: Authoring requires live Terrain and Material resources from this Engine.");
    if (!(value.material instanceof Material))
      throw new TypeError("INVALID_ARGUMENT: Source Water requires a native Material.");
    const quality = validateWaterAuthoringSettings(value);
    if (
      value.connections?.some(
        (connection) =>
          !(connection.target instanceof WaterBodyComponent) ||
          connection.target === this ||
          connection.target.entity.scene !== this.entity.scene
      )
    )
      throw new Error("INVALID_ARGUMENT: Water connections require another Water component in this Scene.");
    for (const resource of refs) resource._addReferCount(1);
    if (this._authoring)
      for (const resource of [this._authoring.terrain, this._authoring.material]) resource?._addReferCount(-1);
    this._authoring = Object.freeze({
      ...value,
      shape,
      quality,
      interaction: value.interaction && Object.freeze({ ...value.interaction }),
      connections: value.connections?.map((connection) =>
        Object.freeze({
          ...connection,
          section: createImmutableWaterSnapshot(connection.section),
          transitionLengths: createImmutableWaterSnapshot(connection.transitionLengths)
        })
      )
    });
    this._ready = this.refresh();
    void this._ready.catch(() => {});
  }
  /** @internal Called once after all inputs of a public transaction are installed. */
  _compileAuthoring(): WaterBodyConfiguration {
    try {
      return this.compileAuthoring();
    } catch (error) {
      const failure = new Error(`Water '${this.waterId}'.shape: ${String(error)}`);
      this.rejectConfiguration(failure);
      throw failure;
    }
  }
  /** @internal Returning to the last published author input also resolves an earlier compile failure. */
  _clearAuthoringError(): void {
    this._error = undefined;
  }
  /** @internal Immutable compiler input, owned by this Source component rather than a project asset. */
  _compileQuality(): WaterQualityResource {
    const quality = this._authoring!.quality;
    const key = hashStableValue(quality);
    if (this._authoringQuality?.key !== key || this._authoringQuality.resource.destroyed) {
      const resource = new WaterQualityResource(this.engine, {
        ...quality,
        schemaVersion: 2,
        id: "component-water-quality"
      });
      resource._addReferCount(1);
      this._authoringAssets.add(resource);
      this._authoringQuality = { key, resource };
    }
    return this._authoringQuality.resource;
  }
  private compileAuthoring(): WaterBodyConfiguration {
    const input = this._authoring;
    if (!input?.terrain)
      throw new Error("MISSING_DEPENDENCY: Water requires a manual bed or a host Terrain publication.");
    const key = hashStableValue([input.shape, input.terrain.contentHash]);
    if (this._authoringAsset?.key !== key || this._authoringAsset.resource.destroyed) {
      const resource = new WaterBodyResource(
        this.engine,
        compileWaterShape(input.shape, input.terrain.data, `authored:${this.waterId}`)
      );
      resource._addReferCount(1);
      this._authoringAssets.add(resource);
      this._authoringAsset = { key, resource };
    }
    const {
      shape,
      terrain: _terrain,
      terrainBinding: _binding,
      connections: _connections,
      quality: _quality,
      ...settings
    } = input;
    return {
      ...settings,
      quality: this._compileQuality(),
      asset: this._authoringAsset!.resource,
      representationState: shape.kind === "ocean" ? shape.layout : undefined
    };
  }
  /** @internal Local invalidation key, including the effective world transform. */
  _authoringKey(): string {
    const input = this._authoring!;
    return hashStableValue({
      shape: input.shape,
      terrain: input.terrain?.contentHash,
      material: waterMaterialKey(input.material),
      quality: input.quality,
      visible: input.visible ?? true,
      priority: input.priority ?? 0,
      connections: input.connections?.map((connection) => ({
        ...connection,
        target: connection.target.waterId,
        shape: connection.target._authoring?.shape,
        terrain: connection.target._authoring?.terrain?.contentHash,
        enabled: connection.target.enabled && connection.target.entity.isActiveInHierarchy,
        transform: connection.target.transformKey()
      })),
      interaction: input.interaction,
      enabled: this.enabled && this.entity.isActiveInHierarchy,
      transform: this.transformKey()
    });
  }
  /** @internal The component owns private compiler inputs until replacement or Scene disposal. */
  _ownCompiledAsset(resource: WaterBodyResource): void {
    resource._addReferCount(1);
    this._authoringAssets.add(resource);
  }
  /** @internal Retire only private compiler inputs that are no longer accepted or cached. */
  _releaseAuthoringAssets(): void {
    for (const asset of this._authoringAssets) {
      if (
        asset === this._authoringAsset?.resource ||
        asset === this._authoringQuality?.resource ||
        asset === this._configuration?.asset ||
        asset === this._configuration?.quality
      )
        continue;
      this._authoringAssets.delete(asset);
      asset._addReferCount(-1);
      asset.destroy();
    }
  }
  private _waterId = `water:${crypto.randomUUID()}`;
  get waterId(): string {
    return this._waterId;
  }
  set waterId(value: string) {
    if (!value || typeof value !== "string") throw new TypeError("INVALID_ARGUMENT: Water identity is required.");
    if (this._owner && value !== this._waterId) throw new Error("CONFLICT: A registered Water identity is immutable.");
    this._waterId = value;
  }
  private _configuration?: Readonly<WaterBodyConfiguration>;
  private _controller?: AbortController;
  private _owner?: NativeWaterOwner;
  private _retained?: WaterBodyConfiguration;
  private _disposed = false;
  private _transformKey = "";
  private _revision = 0;
  private _error?: string;
  private _ready: Promise<void> = Promise.resolve();
  private _pending = new Set<Promise<void>>();
  private _disposeTask?: Promise<void>;

  get configuration(): Readonly<WaterBodyConfiguration> | undefined {
    return this._configuration;
  }
  set configuration(value: WaterBodyConfiguration | undefined) {
    if (this._disposed) throw new Error("DESTROYED: Water component was destroyed.");
    if (!value) return;
    // Scene/Prefab parsers assign properties while their Entities are inactive.
    // Retain the authored resources until activation can publish the runtime.
    if (!this.entity.isActiveInHierarchy && !this._owner) {
      let next: Readonly<WaterBodyConfiguration>;
      try {
        this.validate(value);
        next = freezeConfiguration(value);
      } catch (error) {
        this.rejectConfiguration(error);
        throw error; // Scene/Prefab parsers must also observe invalid authored data.
      }
      retain(next, 1);
      if (this._retained) retain(this._retained, -1);
      this._configuration = this._retained = next;
      this._error = undefined;
      this._ready = Promise.resolve();
    } else void this.configure(value).catch(() => {});
  }
  get ready(): Promise<void> {
    return this._ready;
  }
  get revision(): number {
    return this._revision;
  }
  get lastError(): string | undefined {
    return this._error;
  }

  configure(config: WaterBodyConfiguration, signal?: AbortSignal): Promise<void> {
    if (this._disposed) return Promise.reject(new Error("DESTROYED: Water component was destroyed."));
    let next: Readonly<WaterBodyConfiguration>;
    try {
      this.validate(config);
      next = freezeConfiguration(config);
    } catch (error) {
      return this.rejectConfiguration(error);
    }
    retain(next, 1);
    this._controller?.abort();
    const controller = (this._controller = new AbortController());
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    const task = Promise.resolve()
      .then(async () => {
        controller.signal.throwIfAborted();
        const owner = nativeWaterOwners.get(this.entity.scene!);
        if (!owner) throw new Error("MISSING_DEPENDENCY: Scene requires a WaterSystem.");
        if (this._owner && this._owner !== owner) await this._owner.detach(this);
        this._owner = owner;
        const transformKey = this.transformKey();
        const revision = await owner.publish(this, next, controller.signal);
        // Owner checks the abort token immediately before its synchronous commit.
        this._configuration = next;
        if (this._retained) retain(this._retained, -1);
        this._retained = next;
        this._revision = revision;
        this._error = undefined;
        this._transformKey = transformKey;
      })
      .catch((error) => {
        retain(next, -1);
        if (this._controller === controller) this._error = String(error);
        throw error;
      })
      .finally(() => {
        signal?.removeEventListener("abort", cancel);
        this._pending.delete(task);
      });
    this._pending.add(task);
    this._ready = task;
    void task.catch(() => {});
    return task;
  }

  refresh(): Promise<void> {
    if (this._authoring)
      return nativeWaterOwners.get(this.entity.scene!)?.requestAuthoringUpdate?.(this) ?? Promise.resolve();
    return this._configuration ? this.configure(this._configuration) : Promise.resolve();
  }
  /** @internal Pins author resources and freezes Transform/activation until batch publication. */
  _prepareConfiguration(
    owner: NativeWaterOwner,
    config: WaterBodyConfiguration,
    signal: AbortSignal
  ): PreparedWaterBodyConfiguration {
    if (this._disposed) throw new Error("DESTROYED: Water component was destroyed.");
    this.validate(config);
    if (this._owner && this._owner !== owner) throw new Error("CONFLICT: Water component belongs to another System.");
    const next = freezeConfiguration(config);
    retain(next, 1);
    this._controller?.abort();
    const controller = (this._controller = new AbortController());
    const combined = AbortSignal.any([controller.signal, signal]);
    const transformKey = this.transformKey();
    const active = this.enabled && this.entity.isActiveInHierarchy;
    const scene = this.entity.scene;
    const waterId = this.waterId;
    let finish!: () => void;
    let fail!: (error: unknown) => void;
    const task = new Promise<void>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    this._pending.add(task);
    this._ready = task;
    void task.catch(() => {});
    let finalized = false;
    const release = () => {
      finalized = true;
      this._pending.delete(task);
    };
    const check = () => {
      combined.throwIfAborted();
      this.validate(next);
      if (
        finalized ||
        this._disposed ||
        this.waterId !== waterId ||
        this.entity.scene !== scene ||
        this.transformKey() !== transformKey ||
        active !== (this.enabled && this.entity.isActiveInHierarchy)
      )
        throw new Error("CONFLICT: Water batch candidate is stale.");
    };
    return {
      configuration: next,
      signal: combined,
      check,
      commit: (revision) => {
        // The System checks every candidate before the synchronous Host commit.
        this._owner = owner;
        this._configuration = next;
        if (this._retained) retain(this._retained, -1);
        this._retained = next;
        this._revision = revision;
        this._error = undefined;
        this._transformKey = transformKey;
        release();
        finish();
      },
      rollback: (error = new Error("CANCELLED: Water batch was discarded.")) => {
        if (finalized) return;
        retain(next, -1);
        if (this._controller === controller) this._error = String(error);
        release();
        fail(error);
      }
    };
  }
  /** Register authored instances independently of whether they run or participate in queries. */
  _registerWith(owner: NativeWaterOwner): void {
    if (this._disposed || !this._configuration) return;
    owner.register(this);
    if (this._owner && this._owner !== owner) void this._owner.detach(this, true).catch(() => {});
    this._owner = owner;
  }
  override onAwake(): void {
    const scene = this.entity.scene;
    const owner = scene ? nativeWaterOwners.get(scene) : undefined;
    if (owner) this._registerWith(owner);
  }
  override onEnable(): void {
    void this.refresh().catch(() => {});
  }
  override onDisable(): void {
    this._controller?.abort();
    if (this._owner) this._ready = this._owner.detach(this);
    void this._ready.catch((error) => {
      this._error = String(error);
    });
  }
  override onUpdate(): void {
    // A transform refresh must never supersede a caller's in-flight configuration.
    // Recheck after settlement, using the newly accepted configuration if it succeeded.
    if (this._pending.size === 0 && this._configuration && this._transformKey !== this.transformKey()) {
      this._transformKey = this.transformKey();
      void this.refresh().catch(() => {});
    }
  }
  override onDestroy(): void {
    void this.dispose();
  }
  dispose(): Promise<void> {
    if (this._disposeTask) return this._disposeTask;
    this._disposed = true;
    this._controller?.abort();
    this._ready = this._disposeTask = Promise.allSettled([...this._pending, this._owner?.detach(this, true)]).then(
      () => {
        if (this._retained) retain(this._retained, -1);
        this._retained = undefined;
        if (this._authoring)
          for (const resource of [this._authoring.terrain, this._authoring.material]) resource?._addReferCount(-1);
        this._authoring = undefined;
        for (const asset of this._authoringAssets) {
          asset._addReferCount(-1);
          asset.destroy();
        }
        this._authoringAssets.clear();
        this._authoringAsset = undefined;
        this._authoringQuality = undefined;
      }
    );
    return this._disposeTask;
  }
  /** Engine clone hook also retains resources for inactive Prefab instances. */
  _onClone(target: WaterBodyComponent): void {
    target._authoringAsset = undefined;
    target._authoringQuality = undefined;
    if (target._authoring) {
      target._authoring = Object.freeze({
        ...target._authoring,
        shape: validateWaterShape(target._authoring.shape),
        quality: createWaterQualitySettings(target._authoring.shape.kind, target._authoring.quality)
      });
      for (const resource of [target._authoring.terrain, target._authoring.material]) resource?._addReferCount(1);
    }
    if (target._configuration) {
      target._configuration = freezeConfiguration({
        ...target._configuration,
        ...(target._authoring ? { quality: target._compileQuality() } : {})
      });
      retain(target._configuration, 1);
      target._retained = target._configuration;
    }
  }
  cancel(): void {
    this._controller?.abort();
  }
  private rejectConfiguration(error: unknown): Promise<void> {
    this._controller?.abort();
    this._controller = undefined;
    this._error = String(error);
    this._ready = Promise.reject(error);
    void this._ready.catch(() => {});
    return this._ready;
  }
  private validate(config: WaterBodyConfiguration): void {
    if (config.sourceSpace !== undefined && config.sourceSpace !== "world")
      throw new TypeError("INVALID_ARGUMENT: Unknown Water compiler coordinate space.");
    if (
      !(config.asset instanceof WaterBodyResource) ||
      (!config.material && !(config.look instanceof WaterLookResource)) ||
      !(config.quality instanceof WaterQualityResource) ||
      (config.material !== undefined && !(config.material instanceof Material))
    )
      throw new TypeError(
        "INVALID_ARGUMENT: Water configuration requires native Body, Quality and Material or runtime Look input."
      );
    if (resources(config).some((r) => r.engine !== this.engine || r.destroyed))
      throw new Error("INVALID_ARGUMENT: Water resources must be live and belong to this Engine.");
    try {
      createWaterBodyInstance({
        id: this.waterId,
        assetId: config.asset.contentHash,
        lookPresetId: config.look?.contentHash ?? waterMaterialKey(config.material)!,
        qualityPlanId: config.quality.contentHash,
        visible: config.visible ?? true,
        priority: config.priority ?? 0,
        interaction: config.interaction ?? { query: true, buoyancy: false, wake: false },
        representationState: config.representationState,
        transform: { position: [0, 0, 0], yawDegrees: 0, scaleXZ: [1, 1] }
      });
    } catch (error) {
      throw new TypeError(`INVALID_ARGUMENT: ${String(error)}`);
    }
  }
  private transformKey(): string {
    const t = this.entity.transform,
      p = t.worldPosition,
      r = t.worldRotationQuaternion,
      s = t.lossyWorldScale;
    return `${p.x},${p.y},${p.z}:${r.x},${r.y},${r.z},${r.w}:${s.x},${s.y},${s.z}`;
  }
}

for (const key of [
  "_authoringAsset",
  "_authoringQuality",
  "_authoringAssets",
  "_waterId",
  "_controller",
  "_owner",
  "_retained",
  "_disposed",
  "_transformKey",
  "_revision",
  "_error",
  "_ready",
  "_pending",
  "_disposeTask"
])
  ignoreClone(WaterBodyComponent.prototype, key);
