import { ICharacterControllerDesc } from "@oasis-engine/design";

export class PhysXCharacterControllerDesc implements ICharacterControllerDesc {
  /** @internal */
  _pxControllerDesc: any;

  getType(): number {
    return this._pxControllerDesc.getType();
  }
}
