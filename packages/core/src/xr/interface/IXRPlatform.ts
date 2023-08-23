import { Engine } from "../../Engine";
import { IXRInputProvider, IXRSession } from "@galacean/engine-design";
import { EnumXRMode } from "../enum/EnumXRMode";
import { IXRFeatureDescriptor } from "../descriptor/IXRFeatureDescriptor";
import { IXRSessionDescriptor } from "../descriptor/IXRSessionDescriptor";

export interface IXRPlatform {
  get inputProvider(): new (engine: Engine) => IXRInputProvider;

  isSupported(mode: EnumXRMode): Promise<void>;
  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void>;
  createSession(engine: Engine, config: IXRSessionDescriptor): Promise<IXRSession>;
  destroySession(session: IXRSession): Promise<void>;
}
