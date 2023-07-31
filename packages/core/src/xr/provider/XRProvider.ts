import { EnumXRMode } from "../enum/EnumXRMode";
import { EnumXRTrackingMode } from "../enum/EnumXRTrackingMode";
import { XRSubsystem } from "../subsystem/XRSubsystem";
import { Engine } from "../../Engine";
import { EnumXRSubsystem } from "../enum/EnumXRSubsystem";

export class XRProvider {
  name: string = "none";

  protected _engine: Engine;

  isSupportedMode(mode: EnumXRMode): Promise<void> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.isSupportedMode"));
    });
  }

  isSupportedTrackingMode(mode: EnumXRTrackingMode): Promise<void> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.isSupportedTrackingMode"));
    });
  }

  isSupportedSubsystem(feature: number): Promise<void> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.isSupportedSubsystem"));
    });
  }

  createSubsystem<T extends XRSubsystem>(feature: number): Promise<T> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.createSubsystem"));
    });
  }

  initialize(
    mode: EnumXRMode,
    trackingMode: EnumXRTrackingMode,
    subsystems: EnumXRSubsystem[]
  ): Promise<XRSubsystem[]> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.initialize"));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      reject(new Error("You need to override this method: XRProvider.start"));
    });
  }

  onUpdate(): void {}

  onLateUpdate(): void {}

  onDestroy(): void {}

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
