import { KeyframeValueType } from "../../../Keyframe";
import { AnimationPropertyReference, MountedParseFlag } from "../../AnimationPropertyReference";
import { AnimationPropertyReferenceManager } from "../../AnimationPropertyReferenceManager";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<KeyframeValueType> {
  private _getReference: AnimationPropertyReference;
  private _setReference: AnimationPropertyReference;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    const { referenceManager } = owner;

    if (owner.getProperty) {
      this._getReference = referenceManager.addReference(owner.component, owner.getProperty, MountedParseFlag.Get);
      this._setReference = referenceManager.addReference(owner.component, owner.property, MountedParseFlag.Set);
      this._setReference.invDependencies.push(this._getReference.index);
    } else {
      this._getReference = this._setReference = referenceManager.addReference(
        owner.component,
        owner.property,
        MountedParseFlag.Both
      );
    }
  }

  getTargetValue(): KeyframeValueType {
    return this._getReference.getValue();
  }

  setTargetValue(value: KeyframeValueType): void {
    this._setReference.setValue(value);
  }
}
