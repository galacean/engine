import { CharacterController } from "./CharacterController";
import { ICapsuleCharacterController } from "@oasis-engine/design";
import { CapsuleCharacterControllerDesc } from "./CapsuleCharacterControllerDesc";

export enum CapsuleClimbingMode {
  /// Standard mode, let the capsule climb over surfaces according to impact normal
  EASY,
  /// Constrained mode, try to limit climbing according to the step offset
  CONSTRAINED
}

/**
 * A capsule character controller.
 */
export class CapsuleCharacterController extends CharacterController {
  private _radius: number = 0;
  private _height: number = 0;
  private _climbingMode: CapsuleClimbingMode = CapsuleClimbingMode.EASY;

  /**
   * The radius for the controller.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(newValue: number) {
    this._radius = newValue;
    (<ICapsuleCharacterController>this._nativeCharacterController).setRadius(newValue);
  }

  /**
   * The height for the controller.
   */
  get height(): number {
    return this._height;
  }

  set height(newValue: number) {
    this._height = newValue;
    (<ICapsuleCharacterController>this._nativeCharacterController).setHeight(newValue);
  }

  /**
   * The capsule controller's climbing mode.
   */
  get climbingMode(): CapsuleClimbingMode {
    return this._climbingMode;
  }

  set climbingMode(newValue: CapsuleClimbingMode) {
    this._climbingMode = newValue;
    (<ICapsuleCharacterController>this._nativeCharacterController).setClimbingMode(newValue);
  }

  setDesc(desc: CapsuleCharacterControllerDesc) {
    desc.position = this.entity.transform.worldPosition;
    desc.material = this._material;

    this._nativeCharacterController = this.engine.physicsManager!.characterControllerManager!.createController(
      desc._nativeCharacterControllerDesc
    );
    this._nativeCharacterController.setUniqueID(this._id);
    this.engine.physicsManager!._addCharacterController(this);
  }
}
