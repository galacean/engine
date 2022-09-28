import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler<V extends KeyframeValueType>
  implements IAnimationCurveOwnerAssembler<V>
{
  private _propertyReference: PropertyReference<V>;

  initialize(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    this._propertyReference = this._getPropertyReference(owner);
  }

  getTargetValue(): V {
    const propertyReference = this._propertyReference;
    const originValue = propertyReference.mounted[propertyReference.propertyName];
    return originValue;
  }
  setTargetValue(value: V): void {
    const propertyReference = this._propertyReference;
    propertyReference.mounted[propertyReference.propertyName] = value;
  }

  protected _getPropertyReference(
    owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>
  ): PropertyReference<V> {
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    for (let i = 0, n = properties.length; i < n - 1; i++) {
      mounted = mounted[properties[i]];
    }

    return {
      mounted,
      propertyName: properties[properties.length - 1]
    };
  }
}

/**
 * @internal
 */
export interface PropertyReference<V extends KeyframeValueType> {
  mounted: Record<string, V>;
  propertyName: string;
}
