import { IXRController } from "@galacean/engine-design";
import { XRPose } from "../XRPose";
import { XRInput } from "./XRInput";
import { XRInputButton } from "./XRInputButton";

/**
 * The XR controller.
 */
export class XRController extends XRInput implements IXRController {
  /** The currently pressed buttons of this controller. */
  pressedButtons: XRInputButton = XRInputButton.None;
  /** Record button lifted. */
  down: number = 0;
  /** Record button pressed. */
  up: number = 0;
  /** The grip space pose of the controller in XR space. */
  gripPose: XRPose = new XRPose();
  /** The target ray space pose of the controller in XR space. */
  targetRayPose: XRPose = new XRPose();

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
