import { XRControllerPoseMode } from "./XRControllerPoseMode";
import { IXRInput } from "@galacean/engine-design";
import { XRInputButton } from "./XRInputButton";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";
import { XRPose } from "../XRPose";

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
  poseMode: XRControllerPoseMode = XRControllerPoseMode.Grip;
  /** The grip space pose of the controller in XR space. */
  gripPose: XRPose = new XRPose();
  /** The target ray space pose of the controller in XR space. */
  targetRayPose: XRPose = new XRPose();

  protected _pose: XRPose;

  /**
   * Returns the pose of the controller in XR space.
   */
  get pose(): XRPose {
    if (this.poseMode === XRControllerPoseMode.Grip) {
      return this.gripPose;
    } else {
      return this.targetRayPose;
    }
  }

  /**
   * @internal
   */
  constructor(public type: XRTrackedInputDevice) {}

  /**
   *
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
