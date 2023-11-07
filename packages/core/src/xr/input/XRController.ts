import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { XRInputButton } from "./XRInputButton";
import { IXRPose } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRInput } from "./XRInput";
import { XRControllerPoseMode } from "./XRControllerPoseMode";

export class XRController extends XRInput {
  /** The target ray pose of the controller. */
  targetRayPose: IXRPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  /** The grip pose of the controller. */
  gripPose: IXRPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  /** The currently pressed buttons of this controller. */
  pressedButtons: XRInputButton = XRInputButton.None;
  /** Record button lifted. */
  upMap: number[] = [];
  /** Record button pressed. */
  downMap: number[] = [];
  /** Record button lifted in the current frame. */
  upList: DisorderedArray<XRInputButton> = new DisorderedArray();
  /** Record button pressed in the current frame. */
  downList: DisorderedArray<XRInputButton> = new DisorderedArray();

  private _poseMode: XRControllerPoseMode;

  /**
   * Returns the pose mode of the controller. (Default is Grip)
   */
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

  /**
   * Returns whether the button is pressed.
   * @param button - The button to check
   * @returns Whether the button is pressed
   */
  isButtonDown(button: XRInputButton): boolean {
    return this.downMap[button] === this._engine.time.frameCount;
  }

  /**
   * Returns whether the button is lifted.
   * @param button - The button to check
   * @returns Whether the button is lifted
   */
  isButtonUp(button: XRInputButton): boolean {
    return this.upMap[button] === this._engine.time.frameCount;
  }

  /**
   * Returns whether the button is held down.
   * @param button - The button to check
   * @returns Whether the button is held down
   */
  isButtonHeldDown(button: XRInputButton): boolean {
    return (this.pressedButtons & button) !== 0;
  }

  constructor(protected _engine: Engine) {
    super();
    this.poseMode = XRControllerPoseMode.Auto;
  }
}
