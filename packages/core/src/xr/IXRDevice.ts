import { IXRFeature, IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { EnumXRMode } from "./enum/EnumXRMode";
import { XRInputManager } from "./input/XRInputManager";
import { XRSessionManager } from "./session/XRSessionManager";

export interface IXRDevice {
  isSupported(mode: EnumXRMode): Promise<void>;
  createInputManager(engine: Engine): XRInputManager;
  createSessionManager(engine: Engine): XRSessionManager;
  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void>;
  createFeature(engine: Engine, descriptor: IXRFeatureDescriptor): Promise<IXRFeature>;
}
