import { XRInputType } from "./XRInputType";

export class XRInputEvent {
  targetRayMode: "gaze" | "tracked-pointer" | "screen";
  type: "select" | "selectend" | "selectstart" | "squeeze" | "squeezeend" | "squeezestart";
  input: XRInputType;
  id?: number;
  /** normalized */
  x?: number;
  /** normalized */
  y?: number;
}
