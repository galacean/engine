import { IXRFeatureDescriptor } from "../feature/IXRFeatureDescriptor";

export interface IXRSessionManager {
  initialize(mode: number, requestFeatures: IXRFeatureDescriptor[]): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;

  addStateChangeListener(listener: Function): void;
  removeStateChangeListener(listener: Function): void;
}
