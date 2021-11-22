import { ICharacterController } from "./ICharacterController";

export interface ICapsuleCharacterController extends ICharacterController {
  setRadius(radius: number): boolean;

  setHeight(height: number): boolean;

  setClimbingMode(mode: number): boolean;
}
