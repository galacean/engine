import { IReferable, IVector3, IVector4 } from "@galacean/engine";
import { XRFeatureType } from "../feature/XRFeatureType";
import { XRPlaneMode } from "../feature/trackable/plane/XRPlaneMode";

declare module "@galacean/engine" {
  interface ISceneConfig {
    xr: {
      sessionMode: number;
      origin: string;
      camera: string;
      leftCamera: string;
      rightCamera: string;
      features: IXRFeatureSchema[];
    };
  }
}

export interface IXRFeatureSchema {
  type: XRFeatureType;
  enable: boolean;
}

export interface IAnchorTrackingSchema extends IXRFeatureSchema {
  anchors: IAnchor[];
  prefab: null | IReferable;
}

export interface IImageTrackingSchema extends IXRFeatureSchema {
  images: IReferable[];
  prefab: null | IReferable;
}

export interface IHitTestSchema extends IXRFeatureSchema {}

export interface IPlaneTrackingSchema extends IXRFeatureSchema {
  detectionMode: XRPlaneMode;
  prefab: null | IReferable;
}

export interface IAnchor {
  position: IVector3;
  rotation: IVector4;
}