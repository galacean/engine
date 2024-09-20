import { KeyframeValueType } from "../../../Keyframe";
import { AnimationPropertyReference, MountedParseFlag } from "../../AnimationPropertyReference";
import { AnimationPropertyReferenceManager } from "../../AnimationPropertyReferenceManager";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<KeyframeValueType> {
  getReference: AnimationPropertyReference;
  setReference: AnimationPropertyReference;
  referenceManager: AnimationPropertyReferenceManager;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    const { referenceManager } = owner;
    this.referenceManager = referenceManager;

    if (owner.getProperty) {
      this.getReference = referenceManager.addReference(owner.component, owner.getProperty, MountedParseFlag.Get);
      this.setReference = referenceManager.addReference(owner.component, owner.property, MountedParseFlag.Set);
      this.setReference.invDependencies.push(this.getReference.index);
    } else {
      this.getReference = this.setReference = referenceManager.addReference(
        owner.component,
        owner.property,
        MountedParseFlag.Both
      );
    }
  }

  getTargetValue(): KeyframeValueType {
    return this.getReference.getValue();
  }

  setTargetValue(value: KeyframeValueType): void {
    this.setReference.setValue(value);
  }
}
