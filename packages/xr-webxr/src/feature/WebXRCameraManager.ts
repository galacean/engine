import { IXRCameraManager, EnumXRInputSource, Camera, EnumXRFeature, Engine } from "@galacean/engine";
import { WebXRProvider, registerXRFeature } from "../WebXRProvider";
import { WebXRInputManager } from "./WebXRInputManager";
import { WebXRCamera } from "../data/WebXRCamera";

@registerXRFeature(EnumXRFeature.camera)
export class WebXRCameraManager implements IXRCameraManager {
  static isSupported(engine: Engine, provider: WebXRProvider): Promise<boolean> {
    return new Promise((resolve, reject) => {
      resolve(true);
    });
  }

  static create(engine: Engine, provider: WebXRProvider): Promise<WebXRCameraManager> {
    return new Promise((resolve, reject) => {
      resolve(new WebXRCameraManager(engine, provider));
    });
  }

  private _engine: Engine;
  private _provider: WebXRProvider;

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

  onUpdate(): void {
    const { _cameras: cameras } = this;
    const input = this._engine.xrManager.getFeature<WebXRInputManager>(EnumXRFeature.input);
    for (let i = 0, n = cameras.length; i < n; i++) {
      const camera = cameras[i];
      const xrCamera = input.getDevice<WebXRCamera>(i);
      if (camera && xrCamera) {
        camera.viewport = xrCamera.viewport;
        camera.projectionMatrix = xrCamera.project;
      }
    }
  }

  onEnable(): void {}

  onDisable(): void {}

  onDestroy(): void {
    this._cameras.length = 0;
  }

  constructor(engine: Engine, provider: WebXRProvider) {
    this._engine = engine;
    this._provider = provider;
  }
}
