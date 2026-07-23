import { Engine, Entity } from "@galacean/engine-core";
import type { WaterOpticalProfile } from "../../../runtime/optics/WaterOpticalProfile";
import type {
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback
} from "../../../runtime/optics/WaterSurfaceOpticsTypes";
import type { HeightfieldWaterResource } from "../../../runtime/heightfield/HeightfieldWaterResource";
import { HeightfieldWaterRuntimeController } from "../../../runtime/heightfield/HeightfieldWaterRuntimeController";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode
} from "../../../runtime/heightfield/HeightfieldWaterRuntimeEnums";

type SecondaryPoolHeightfieldRuntime = Pick<
  HeightfieldWaterRuntimeController,
  | "activeSurfaceOpticsReadback"
  | "replaceActiveIncremental"
  | "setOpticalProfile"
  | "setRefractionEnabled"
  | "setCompositionMode"
  | "setDepthWriteEnabled"
  | "setRenderPriority"
  | "setDebugMode"
  | "setSurfaceTimeOverride"
  | "setSurfaceOpticsBinding"
  | "flushDeferredResources"
  | "destroy"
>;

export type WaterOpticsSecondaryPoolRuntimeFactory = (engine: Engine, root: Entity) => SecondaryPoolHeightfieldRuntime;

/** Lab-only lazy owner that keeps the P0 fixtures free of secondary-Pool GPU resources. */
export class WaterOpticsSecondaryPoolRuntime {
  private _runtime?: SecondaryPoolHeightfieldRuntime;
  private _resource?: HeightfieldWaterResource;
  private _visible = false;
  private _opticalProfile?: WaterOpticalProfile;
  private _surfaceBinding?: Readonly<WaterSurfaceOpticsBinding>;
  private _refractionEnabled = true;
  private _compositionMode = HeightfieldWaterCompositionMode.PrecomposedReplace;
  private _depthWriteEnabled = false;
  private _renderPriority = 0;
  private _debugMode = HeightfieldWaterDebugMode.Final;
  private _surfaceTimeOverride?: number;
  private _createCount = 0;
  private _destroyCount = 0;
  private _generation = 0;

  constructor(
    private readonly _engine: Engine,
    readonly root: Entity,
    private readonly _runtimeFactory: WaterOpticsSecondaryPoolRuntimeFactory = (engine, runtimeRoot) =>
      new HeightfieldWaterRuntimeController(engine, runtimeRoot)
  ) {
    root.isActive = false;
  }

  get activeSurfaceOpticsReadback(): Readonly<WaterSurfaceOpticsBindingReadback> | undefined {
    return this._runtime?.activeSurfaceOpticsReadback;
  }

  get metrics(): Readonly<{
    created: boolean;
    visible: boolean;
    createCount: number;
    destroyCount: number;
    balancedLiveCount: 0 | 1;
  }> {
    return Object.freeze({
      created: this._runtime !== undefined,
      visible: this._runtime !== undefined && this._visible,
      createCount: this._createCount,
      destroyCount: this._destroyCount,
      balancedLiveCount: this._runtime ? 1 : 0
    });
  }

  async ensure(resource: HeightfieldWaterResource): Promise<void> {
    if (this._runtime && this._resource === resource) {
      this.root.isActive = this._visible;
      return;
    }
    const generation = ++this._generation;
    this._releaseCurrentRuntime();
    const runtime = this._runtimeFactory(this._engine, this.root);
    this._runtime = runtime;
    this._resource = resource;
    this._createCount++;
    if (this._opticalProfile) runtime.setOpticalProfile(this._opticalProfile);
    runtime.setRefractionEnabled(this._refractionEnabled);
    runtime.setCompositionMode(this._compositionMode);
    runtime.setDepthWriteEnabled(this._depthWriteEnabled);
    runtime.setRenderPriority(this._renderPriority);
    runtime.setDebugMode(this._debugMode);
    runtime.setSurfaceTimeOverride(this._surfaceTimeOverride);
    try {
      await runtime.replaceActiveIncremental("water-optics-lab-secondary-pool", resource, { frameBudgetMs: 4 });
      if (generation !== this._generation || this._runtime !== runtime) return;
      if (this._surfaceBinding) runtime.setSurfaceOpticsBinding(this._surfaceBinding);
      this.root.isActive = this._visible;
      runtime.flushDeferredResources();
    } catch (error) {
      if (generation === this._generation && this._runtime === runtime) this._releaseCurrentRuntime();
      throw error;
    }
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this.root.isActive = visible && this._runtime !== undefined;
  }

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._opticalProfile = profile;
    this._runtime?.setOpticalProfile(profile);
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._runtime?.setRefractionEnabled(enabled);
  }

  setCompositionMode(mode: HeightfieldWaterCompositionMode): void {
    this._compositionMode = mode;
    this._runtime?.setCompositionMode(mode);
  }

  setDepthWriteEnabled(enabled: boolean): void {
    this._depthWriteEnabled = enabled;
    this._runtime?.setDepthWriteEnabled(enabled);
  }

  setRenderPriority(priority: number): void {
    this._renderPriority = priority;
    this._runtime?.setRenderPriority(priority);
  }

  setDebugMode(mode: HeightfieldWaterDebugMode): void {
    this._debugMode = mode;
    this._runtime?.setDebugMode(mode);
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
    this._runtime?.setSurfaceTimeOverride(elapsedTime);
  }

  setSurfaceOpticsBinding(binding: Readonly<WaterSurfaceOpticsBinding>): void {
    this._surfaceBinding = binding;
    this._runtime?.setSurfaceOpticsBinding(binding);
  }

  release(): void {
    this._generation++;
    this._releaseCurrentRuntime();
  }

  private _releaseCurrentRuntime(): void {
    if (!this._runtime) {
      this.root.isActive = false;
      this._resource = undefined;
      return;
    }
    this._runtime.destroy();
    this._runtime = undefined;
    this._resource = undefined;
    this.root.isActive = false;
    this._destroyCount++;
  }

  destroy(): void {
    this.release();
    this.root.destroy();
  }
}
