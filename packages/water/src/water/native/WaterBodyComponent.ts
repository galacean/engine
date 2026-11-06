import { Script, ignoreClone, type Scene } from "@galacean/engine-core";
import type {
  WaterInteractionRequestV1,
  WaterRepresentationInstanceStateV1
} from "../authoring/body/WaterBodyInstance";
import { WaterBodyResource, WaterLookResource, WaterQualityResource } from "./WaterResources";
import { createWaterBodyInstance } from "../authoring/body/WaterBodyInstance";
import { createImmutableWaterSnapshot } from "../authoring/identity/WaterImmutableSnapshot";

export interface WaterBodyConfiguration {
  readonly asset: WaterBodyResource;
  readonly look: WaterLookResource;
  readonly quality: WaterQualityResource;
  readonly visible?: boolean;
  readonly priority?: number;
  readonly interaction?: WaterInteractionRequestV1;
  readonly representationState?: WaterRepresentationInstanceStateV1;
}

/** Internal bridge. Scene registry contains owners, not another copy of authored water data. */
export interface NativeWaterOwner {
  register(body: WaterBodyComponent): void;
  publish(body: WaterBodyComponent, config: Readonly<WaterBodyConfiguration>, signal: AbortSignal): Promise<number>;
  detach(body: WaterBodyComponent, forget?: boolean): Promise<void>;
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
  return config ? [config.asset, config.look, config.quality] : [];
}
function retain(config: WaterBodyConfiguration, delta: number): void {
  for (const resource of resources(config))
    if (!resource.destroyed) (resource as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
export function freezeConfiguration(config: WaterBodyConfiguration): Readonly<WaterBodyConfiguration> {
  const { asset, look, quality, ...settings } = config;
  return Object.freeze({ ...createImmutableWaterSnapshot(settings), asset, look, quality });
}

/** Scene instance. Transform is owned by Entity; authoring assets may be shared. */
export class WaterBodyComponent extends Script {
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
      }
    );
    return this._disposeTask;
  }
  /** Engine clone hook also retains resources for inactive Prefab instances. */
  _onClone(target: WaterBodyComponent): void {
    if (target._configuration) {
      target._configuration = freezeConfiguration(target._configuration);
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
    if (
      !(config.asset instanceof WaterBodyResource) ||
      !(config.look instanceof WaterLookResource) ||
      !(config.quality instanceof WaterQualityResource)
    )
      throw new TypeError("INVALID_ARGUMENT: Water configuration requires native Body, Look and Quality resources.");
    if (resources(config).some((r) => r.engine !== this.engine || r.destroyed))
      throw new Error("INVALID_ARGUMENT: Water resources must be live and belong to this Engine.");
    try {
      createWaterBodyInstance({
        id: this.waterId,
        assetId: config.asset.contentHash,
        lookPresetId: config.look.contentHash,
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
