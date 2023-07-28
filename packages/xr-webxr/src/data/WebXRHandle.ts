import {
  Vector3,
  Matrix,
  Quaternion,
  EnumXRButton,
  IXRHandle,
  EnumXRDevicePhase,
  DisorderedArray
} from "@galacean/engine";

/**
 * XR 手柄
 */
export class WebXRHandle implements IXRHandle {
  // pose
  matrix: Matrix = new Matrix();
  position: Vector3 = new Vector3();
  quaternion: Quaternion = new Quaternion();
  linearVelocity: Vector3 = new Vector3();
  /** The currently pressed buttons for this handle. */
  pressedButtons: EnumXRButton = EnumXRButton.None;
  // state
  phase: EnumXRDevicePhase = EnumXRDevicePhase.leave;
  /** @internal */
  _inputSource: XRInputSource;
  /** @internal */
  _events: XRInputSourceEvent[] = [];
  /** @internal */
  _upMap: number[] = [];
  /** @internal */
  _downMap: number[] = [];
  /** @internal */
  _upList: DisorderedArray<EnumXRButton> = new DisorderedArray();
  /** @internal */
  _downList: DisorderedArray<EnumXRButton> = new DisorderedArray();
}
