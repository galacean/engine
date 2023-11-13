export class IXRInputEvent {
  targetRayMode: "gaze" | "tracked-pointer" | "screen";
  type: "select" | "selectend" | "selectstart" | "squeeze" | "squeezeend" | "squeezestart";
  input: number;
  id?: number;
  /** normalized */
  x?: number;
  /** normalized */
  y?: number;
}
