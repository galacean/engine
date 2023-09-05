import { IXRFeature } from "./IXRFeature";

export interface IXRHitTest extends IXRFeature {
  startHitTest(x: number, y: number): Promise<any>;
  stopHitTest(): Promise<any>;
}
