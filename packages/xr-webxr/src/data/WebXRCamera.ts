import { Matrix, Quaternion, Vector3, Vector4, IXRCamera, EnumXRDevicePhase } from "@galacean/engine";

export class WebXRCamera implements IXRCamera {
  // pose
  position: Vector3 = new Vector3();
  matrix: Matrix = new Matrix();
  quaternion: Quaternion = new Quaternion();
  linearVelocity: Vector3 = new Vector3();
  // display
  project: Matrix = new Matrix();
  viewport: Vector4 = new Vector4();
  // state
  phase: EnumXRDevicePhase = EnumXRDevicePhase.leave;
  // render target
  frameBuffer?: WebGLFramebuffer;
  frameWidth?: number;
  frameHeight?: number;
}
