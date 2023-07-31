import { Matrix, Vector4 } from "@galacean/engine-math";
import { XRDevice } from "./XRDevice";

export class XRCamera extends XRDevice {
  // display
  project: Matrix = new Matrix();
  viewport: Vector4 = new Vector4();
}
