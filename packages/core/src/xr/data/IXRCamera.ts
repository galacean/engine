import { Matrix, Vector4 } from "@galacean/engine-math";
import { IXRDevice } from "./IXRDevice";
import { Camera } from "../../Camera";

export interface IXRCamera extends IXRDevice {
  project: Matrix;
  viewport: Vector4;
}
