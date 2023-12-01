import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { XRControllerPoseMode } from "./XRControllerPoseMode";
import { IXRInput, IXRPose } from "@galacean/engine-design";
import { XRInputButton } from "./XRInputButton";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";

/**
 * The XR controller.
 */
export class XRController implements IXRInput {
  /** The tracking state of xr input. */
  trackingState: XRTrackingState = XRTrackingState.NotTracking;
  /** The currently pressed buttons of this controller. */
  pressedButtons: XRInputButton = XRInputButton.None;
  /** Record button lifted. */
  down: number = 0;
  /** Record button pressed. */
  up: number = 0;
  /** the pose mode of the controller. (Default is Grip) */
  poseMode: XRControllerPoseMode;
  /** The grip space pose of the controller in XR space. */
  gripPose: IXRPose;
  /** The target ray space pose of the controller in XR space. */
  targetRayPose: IXRPose;

  protected _pose: IXRPose;

  /**
   * Returns the pose of the controller in XR space.
   */
  get pose(): IXRPose {
    if (this.poseMode === XRControllerPoseMode.Grip) {
      return this.gripPose;
    } else {
      return this.targetRayPose;
    }
  }

  /**
   * @internal
   */
  constructor(public type: XRTrackedInputDevice) {
    this.poseMode = XRControllerPoseMode.Grip;
    this.gripPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
    this.targetRayPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  }

  /**
   * Returns whether the button is pressed.
   * @param button - The button to check
   * @returns Whether the button is pressed
   */
  isButtonDown(button: XRInputButton): boolean {
    return (this.down & button) !== 0;
  }

  /**
   * Returns whether the button is lifted.
   * @param button - The button to check
   * @returns Whether the button is lifted
   */
  isButtonUp(button: XRInputButton): boolean {
    return (this.up & button) !== 0;
  }

  /**
   * Returns whether the button is held down.
   * @param button - The button to check
   * @returns Whether the button is held down
   */
  isButtonHeldDown(button: XRInputButton): boolean {
    return (this.pressedButtons & button) !== 0;
  }
}
