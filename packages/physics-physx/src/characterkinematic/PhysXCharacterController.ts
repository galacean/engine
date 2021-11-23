import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";

export class PhysXCharacterController implements ICharacterController {
  /** @internal */
  _id: number;
  /** @internal */
  _pxController: any;

  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController.move(disp, minDist, elapsedTime);
  }

  isSetControllerCollisionFlag(flags: number, flag: number): boolean {
    throw "";
    // this._pxController.isSetControllerCollisionFlag(flags, CPxControllerCollisionFlag(UInt32(flag)))
  }

  setPosition(position: Vector3): boolean {
    return this._pxController.setPosition(position);
  }

  setFootPosition(position: Vector3) {
    this._pxController.setFootPosition(position);
  }

  setStepOffset(offset: number) {
    this._pxController.setStepOffset(offset);
  }

  setNonWalkableMode(flag: number) {
    // this._pxController.setNonWalkableMode(CPxControllerNonWalkableMode(UInt32(flag)))
  }

  setContactOffset(offset: number) {
    this._pxController.setContactOffset(offset);
  }

  setUpDirection(up: Vector3) {
    this._pxController.setUpDirection(up);
  }

  setSlopeLimit(slopeLimit: number) {
    this._pxController.setSlopeLimit(slopeLimit);
  }

  invalidateCache() {
    this._pxController.invalidateCache();
  }

  resize(height: number) {
    this._pxController.resize(height);
  }

  setUniqueID(id: number) {
    this._id = id;
    // this._pxController.setQueryFilterData(UInt32(id), w1: 0, w2: 0, w3: 0)
  }

  getPosition(position: Vector3) {
    position = this._pxController.getPosition();
  }
}
