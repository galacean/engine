import { IXRFeatureDescriptor } from "../feature/IXRFeatureDescriptor";

export interface IXRSessionDescriptor {
  mode: number;
  requestFeatures: IXRFeatureDescriptor[];
}
