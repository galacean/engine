import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

export interface IXRFeature {
  descriptor: IXRFeatureDescriptor;
  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void>;
  _initialize(descriptor: IXRFeatureDescriptor): Promise<void>;
  _onUpdate(): void;
  _onDestroy(): void;
  _onSessionInit(): void;
  _onSessionStart(): void;
  _onSessionStop(): void;
  _onSessionDestroy(): void;
  _onFlagChange(flag: number, ...param): void;
}
