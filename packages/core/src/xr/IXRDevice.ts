import { IXRPlatformFeature } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { XRSessionType } from "./session/XRSessionType";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";

export interface IXRDevice {
  isSupported(mode: XRSessionType): Promise<void>;
  createInputManager(engine: Engine): XRInputManager;
  createSessionManager(engine: Engine): XRSessionManager;
  createPlatformFeature(engine: Engine, type: number): IXRPlatformFeature;
}
