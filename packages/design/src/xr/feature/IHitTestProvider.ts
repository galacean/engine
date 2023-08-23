import { IXRFeatureProvider } from "./IXRFeatureProvider";

export interface IHitTestProvider extends IXRFeatureProvider {
  hitTest(x: number, y: number): Promise<any>;
}
