import { PointerPhase } from "../../input";

export class XRPointer {
  static uid: number = 0;

  id: number = 0;
  x: number = 0;
  y: number = 0;
  buttons: number = 0;
  phase: PointerPhase = PointerPhase.Leave;
}
