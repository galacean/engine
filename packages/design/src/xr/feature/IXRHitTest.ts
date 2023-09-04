import { IXRFeature } from "./IXRFeature";

export interface IXRHitTest extends IXRFeature {
  hitTest(x: number, y: number): Promise<any>;
}
