import { IXRSessionDescriptor } from "../descriptor/IXRSessionDescriptor";
import { IXRFeatureDescriptor } from "../descriptor/IXRFeatureDescriptor";
import { EnumXRMode } from "../enum/EnumXRMode";
import { IXRSession } from "./IXRSession";
import { Engine } from "../../Engine";
import { IXRInputProvider } from "../input/IXRInputProvider";

export interface IXRPlatform {
  get inputProvider(): new (engine: Engine) => IXRInputProvider;

  isSupported(mode: EnumXRMode): Promise<void>;
  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void>;
  createSession(engine: Engine, config: IXRSessionDescriptor): Promise<IXRSession>;
  destroySession(session: IXRSession): Promise<void>;
}
