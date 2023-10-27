import { Engine } from "../../Engine";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { IXRInput } from "@galacean/engine-design";
import { XRInputTrackingState } from "./XRInputTrackingState";

export abstract class XRInput implements IXRInput {
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  trackingState: XRInputTrackingState = XRInputTrackingState.NotTracking;

  constructor(protected _engine: Engine) {}
}
