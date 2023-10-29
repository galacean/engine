import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { XRInputButton } from "./XRInputButton";
import { IXRPose } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRInput } from "./XRInput";
import { XRControllerPoseMode } from "./XRControllerPoseMode";

export class XRController extends XRInput {
  targetRayPose: IXRPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  gripPose: IXRPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };

  private _poseMode: XRControllerPoseMode;

  get poseMode(): XRControllerPoseMode {
    return this._poseMode;
  }

  set poseMode(mode: XRControllerPoseMode) {
    switch (mode) {
      case XRControllerPoseMode.Auto:
      case XRControllerPoseMode.Grip:
        this.pose = this.gripPose;
        break;
      case XRControllerPoseMode.TargetRay:
        this.pose = this.targetRayPose;
        break;
      default:
        break;
    }
  }

  pressedButtons: XRInputButton = XRInputButton.None;
  upMap: number[] = [];
  downMap: number[] = [];
  upList: DisorderedArray<XRInputButton> = new DisorderedArray();
  downList: DisorderedArray<XRInputButton> = new DisorderedArray();

  isButtonDown(button: XRInputButton): boolean {
    return this.downMap[button] === this._engine.time.frameCount;
  }
  isButtonUp(button: XRInputButton): boolean {
    return this.upMap[button] === this._engine.time.frameCount;
  }
  isButtonHeldDown(button: XRInputButton): boolean {
    return (this.pressedButtons & button) !== 0;
  }

  constructor(protected _engine: Engine) {
    super();
    this.poseMode = XRControllerPoseMode.Auto;
  }
}
