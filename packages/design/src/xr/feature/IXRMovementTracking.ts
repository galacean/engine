import { IXRFeature } from "./IXRFeature";

export interface IXRMovementTracking extends IXRFeature {
  get trackingMode(): number;
  set trackingMode(value: number);
}
