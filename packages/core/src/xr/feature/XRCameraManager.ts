import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { registerFeature } from "../XRManager";
import { XRCamera } from "../data/XRCamera";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { EnumXRSubsystem } from "../enum/EnumXRSubsystem";
import { XRInputSubsystem } from "../subsystem/XRInputSubsystem";
import { XRFeature } from "./XRFeature";
import { XRInputManager } from "./XRInputManager";

@registerFeature(EnumXRFeature.camera, [EnumXRSubsystem.input])
export class XRCameraManager extends XRFeature {
  private _cameras: Camera[] = [];
  private _automaticNear: number;
  private _customNear: number = undefined;
  private _automaticFar: number;
  private _customFar: number = undefined;

  get near(): number {
    if (this._customNear) {
      return this._customNear;
    } else {
      return this._automaticNear;
    }
  }

  set near(value: number) {
    this._customNear = value;
  }

  get far(): number {
    if (this._customFar) {
      return this._customFar;
    } else {
      return this._automaticFar;
    }
  }

  set far(value: number) {
    this._customFar = value;
  }

  attachCamera(source: EnumXRInputSource, camera: Camera): void {
    this._cameras[source] = camera;
  }

  detachCamera(source: EnumXRInputSource): void {
    this._cameras[source] = null;
  }

  getCamera(source: EnumXRInputSource): Camera {
    return this._cameras[source];
  }

  override onUpdate(): void {
    const { _cameras: cameras } = this;
    const input = this._engine.xrManager.getFeature<XRInputManager>(EnumXRFeature.input);
    for (let i = 0, n = cameras.length; i < n; i++) {
      const camera = cameras[i];
      const xrCamera = input.getDevice<XRCamera>(i);
      if (camera && xrCamera) {
        camera.viewport = xrCamera.viewport;
        camera.projectionMatrix = xrCamera.project;
      }
    }
  }

  override onEnable(): void {}

  override onDisable(): void {}

  override onDestroy(): void {
    this._cameras.length = 0;
  }
}
