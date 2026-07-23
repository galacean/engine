/** Query-driven fully-underwater state with bounded hysteresis and camera-feature ownership. */
import type { Vector3 } from "@galacean/engine-math";
import { createWaterWorldVolumeSample, type WaterWorldVolumeSample } from "../body/WaterWorld";
import {
  CameraWaterFeatureBroker,
  type WaterCameraFeatureQuality,
  type WaterCameraFeatureRequest
} from "./CameraWaterFeatureBroker";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "./WaterOpticalProfile";
import type { UnderwaterPostProcessTarget } from "./UnderwaterPostProcessPass";

const DEFAULT_ENTER_DEPTH = 0.08;
const DEFAULT_EXIT_HEIGHT = 0.12;
const DEFAULT_BOTTOM_EXIT_TOLERANCE = 0.04;
let nextUnderwaterConsumerId = 0;

export interface UnderwaterVolumeWorld {
  findContainingVolume(worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean;
  sampleBodyVolume(bodyId: string, worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean;
}

export interface UnderwaterControllerOptions {
  readonly world: UnderwaterVolumeWorld;
  readonly getCameraPosition: () => Vector3;
  readonly cameraFeatures: CameraWaterFeatureBroker;
  readonly postProcess: UnderwaterPostProcessTarget;
  readonly fallbackOpticalProfile?: WaterOpticalProfile;
  readonly quality?: WaterCameraFeatureQuality;
  readonly enterDepth?: number;
  readonly exitHeight?: number;
  readonly bottomExitTolerance?: number;
  readonly consumerId?: string;
}

export interface UnderwaterControllerMetrics {
  readonly updateCount: number;
  readonly enterCount: number;
  readonly exitCount: number;
  readonly bodySwitchCount: number;
  readonly activeBodyId: string;
  readonly signedSurfaceDistance: number;
  readonly submergedDepth: number;
  readonly postProcessExecutionCount: number;
}

interface MutableUnderwaterControllerMetrics {
  updateCount: number;
  enterCount: number;
  exitCount: number;
  bodySwitchCount: number;
  activeBodyId: string;
  signedSurfaceDistance: number;
  submergedDepth: number;
  postProcessExecutionCount: number;
}

export class UnderwaterController {
  private readonly _candidate = createWaterWorldVolumeSample();
  private readonly _activeSample = createWaterWorldVolumeSample();
  private readonly _consumerId: string;
  private readonly _enterDepth: number;
  private readonly _exitHeight: number;
  private readonly _bottomExitTolerance: number;
  private readonly _fallbackOpticalProfile: WaterOpticalProfile;
  private readonly _request: WaterCameraFeatureRequest;
  private readonly _metrics: MutableUnderwaterControllerMetrics = {
    updateCount: 0,
    enterCount: 0,
    exitCount: 0,
    bodySwitchCount: 0,
    activeBodyId: "",
    signedSurfaceDistance: 0,
    submergedDepth: 0,
    postProcessExecutionCount: 0
  };
  private _activeProfile?: WaterOpticalProfile;
  private _destroyed = false;

  constructor(private readonly _options: UnderwaterControllerOptions) {
    this._consumerId = _options.consumerId ?? `underwater-camera-${nextUnderwaterConsumerId++}`;
    this._enterDepth = Math.max(0, _options.enterDepth ?? DEFAULT_ENTER_DEPTH);
    this._exitHeight = Math.max(0, _options.exitHeight ?? DEFAULT_EXIT_HEIGHT);
    this._bottomExitTolerance = Math.max(0, _options.bottomExitTolerance ?? DEFAULT_BOTTOM_EXIT_TOLERANCE);
    this._fallbackOpticalProfile = _options.fallbackOpticalProfile ?? DEFAULT_WATER_OPTICAL_PROFILE;
    this._request = Object.freeze({
      depthTexture: true,
      opaqueTexture: false,
      reflection: "none" as const,
      caustics: false,
      underwater: true,
      quality: _options.quality ?? "medium"
    });
    _options.postProcess.isActive = false;
  }

  get isUnderwater(): boolean {
    return this._metrics.activeBodyId !== "";
  }

  get activeBodyId(): string {
    return this._metrics.activeBodyId;
  }

  /** Active WaterWorld profile identity; undefined while the camera is outside all water volumes. */
  get activeOpticalProfile(): WaterOpticalProfile | undefined {
    return this._activeProfile;
  }

  get metrics(): UnderwaterControllerMetrics {
    this._metrics.postProcessExecutionCount = this._options.postProcess.metrics.executionCount;
    return this._metrics;
  }

  update(): boolean {
    if (this._destroyed) return false;
    const metrics = this._metrics;
    metrics.updateCount++;
    const position = this._options.getCameraPosition();
    const candidate = this._candidate;
    const hasContainingCandidate = this._options.world.findContainingVolume(position, candidate);
    const activeBodyId = metrics.activeBodyId;

    if (activeBodyId === "") {
      if (hasContainingCandidate && this._canEnter(candidate)) this._activate(candidate, false);
      return this.isUnderwater;
    }

    if (hasContainingCandidate && candidate.waterBodyId === activeBodyId) {
      this._updateActiveSample(candidate);
      return true;
    }

    if (hasContainingCandidate && this._canEnter(candidate)) {
      this._activate(candidate, true);
      return true;
    }

    const activeSample = this._activeSample;
    const sampledActive = this._options.world.sampleBodyVolume(activeBodyId, position, activeSample);
    if (sampledActive && this._canRemain(position, activeSample)) {
      this._updateActiveSample(activeSample);
      return true;
    }

    this._deactivate();
    return false;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._deactivate();
  }

  private _canEnter(sample: WaterWorldVolumeSample): boolean {
    return sample.insideVolume && sample.signedSurfaceDistance <= -this._enterDepth;
  }

  private _canRemain(position: Vector3, sample: WaterWorldVolumeSample): boolean {
    return (
      sample.insideFootprint &&
      sample.signedSurfaceDistance <= this._exitHeight &&
      position.y >= sample.bottomHeight - this._bottomExitTolerance
    );
  }

  private _activate(sample: WaterWorldVolumeSample, switchedBody: boolean): void {
    const metrics = this._metrics;
    const wasInactive = metrics.activeBodyId === "";
    if (wasInactive) metrics.enterCount++;
    else if (switchedBody && metrics.activeBodyId !== sample.waterBodyId) metrics.bodySwitchCount++;
    metrics.activeBodyId = sample.waterBodyId;
    if (wasInactive) {
      this._options.cameraFeatures.setRequest(this._consumerId, this._request);
      this._options.postProcess.isActive = true;
    }
    this._updateActiveSample(sample);
  }

  private _updateActiveSample(sample: WaterWorldVolumeSample): void {
    const profile = sample.opticalProfile ?? this._fallbackOpticalProfile;
    if (profile !== this._activeProfile) {
      this._activeProfile = profile;
      this._options.postProcess.setOpticalProfile(profile);
    }
    this._metrics.signedSurfaceDistance = sample.signedSurfaceDistance;
    this._metrics.submergedDepth = sample.submergedDepth;
  }

  private _deactivate(): void {
    const metrics = this._metrics;
    if (metrics.activeBodyId !== "") metrics.exitCount++;
    metrics.activeBodyId = "";
    metrics.signedSurfaceDistance = 0;
    metrics.submergedDepth = 0;
    this._activeProfile = undefined;
    this._options.postProcess.isActive = false;
    this._options.cameraFeatures.removeRequest(this._consumerId);
  }
}
