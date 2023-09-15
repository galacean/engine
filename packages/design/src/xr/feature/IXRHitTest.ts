import { IXRFeature } from "./IXRFeature";

export interface IXRHitTest extends IXRFeature {
  hitTest(screenX: number, screenY: number): Promise<any>;
}
