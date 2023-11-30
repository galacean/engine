import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { XRControllerPoseMode } from "./XRControllerPoseMode";
import { DisorderedArray } from "../../DisorderedArray";
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
  upMap: number[] = [];
  /** Record button pressed. */
  downMap: number[] = [];
  /** Record button lifted in the current frame. */
  upList: DisorderedArray<XRInputButton>;
  /** Record button pressed in the current frame. */
  downList: DisorderedArray<XRInputButton>;
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

  constructor(public type: XRTrackedInputDevice) {
    this.upMap = [];
    this.downMap = [];
    this.upList = new DisorderedArray();
    this.downList = new DisorderedArray();
    this.poseMode = XRControllerPoseMode.Grip;
    this.gripPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
    this.targetRayPose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  }
}
