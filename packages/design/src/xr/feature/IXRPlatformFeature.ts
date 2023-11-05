import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

export interface IXRPlatformFeature {
  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void>;
  _initialize(descriptor: IXRFeatureDescriptor): Promise<void>;
  _onUpdate(): void;
  _onDestroy(): void;
  _onSessionInit(): void;
  _onSessionStart(): void;
  _onSessionStop(): void;
  _onSessionDestroy(): void;
}
