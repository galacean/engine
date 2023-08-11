import { IXRSessionDescriptor } from "../descriptor/IXRSessionDescriptor";
import { IXRFeatureDescriptor } from "../descriptor/IXRFeatureDescriptor";
import { EnumXRMode } from "../enum/EnumXRMode";
import { IXRSession } from "./IXRSession";

export interface IXRPlatform {
  isSupported(mode: EnumXRMode): Promise<void>;
  isSupportedFeature(descriptor: IXRFeatureDescriptor): Promise<void>;
  createSession(config: IXRSessionDescriptor): Promise<IXRSession>;
  destroySession(session: IXRSession): Promise<void>;
}
