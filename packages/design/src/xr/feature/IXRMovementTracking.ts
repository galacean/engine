import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRMovementTracking extends IXRPlatformFeature {
  get trackingMode(): number;
  set trackingMode(value: number);
}
