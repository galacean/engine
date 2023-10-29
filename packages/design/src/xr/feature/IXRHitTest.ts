import { IXRPlatformFeature } from "./IXRPlatformFeature";

export interface IXRHitTest extends IXRPlatformFeature {
  hitTest(screenX: number, screenY: number): Promise<any>;
}
