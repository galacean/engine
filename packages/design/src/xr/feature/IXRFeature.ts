import { IXRFeatureDescriptor } from "./IXRFeatureDescriptor";

export interface IXRFeature {
  descriptor: IXRFeatureDescriptor;
  _initialize(descriptor: IXRFeatureDescriptor): Promise<void>;
  _onUpdate(): void;
  _onDestroy(): void;
}
