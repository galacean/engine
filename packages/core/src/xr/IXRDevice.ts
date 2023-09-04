import { IXRFeature, IXRFeatureDescriptor, IXRSessionManager } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { EnumXRMode } from "./enum/EnumXRMode";
import { XRInputManager } from "./input/XRInputManager";

export interface IXRDevice {
  isSupported(mode: EnumXRMode): Promise<void>;
  createInputManager(engine: Engine): XRInputManager;
  createSessionManager(engine: Engine): IXRSessionManager;
  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void>;
  createFeature(engine: Engine, descriptor: IXRFeatureDescriptor): Promise<IXRFeature>;
}
