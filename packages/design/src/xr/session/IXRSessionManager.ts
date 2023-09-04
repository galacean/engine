import { IXRSessionDescriptor } from "./IXRSessionDescriptor";

export interface IXRSessionManager {
  initialize(descriptor: IXRSessionDescriptor): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}
