import { KeyFrameTangentType, KeyFrameValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler<V extends KeyFrameValueType>
  implements IAnimationCurveOwnerAssembler<V>
{
  private _propertyReference: PropertyReference<V>;

  initialization(owner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>): void {
    this._propertyReference = this._getPropertyReference(owner);
  }

  getValue(): V {
    const propertyReference = this._propertyReference;
    const originValue = propertyReference.mounted[propertyReference.propertyName];
    return originValue;
  }
  setValue(value: V): void {
    const propertyReference = this._propertyReference;
    propertyReference.mounted[propertyReference.propertyName] = value;
  }

  protected _getPropertyReference(
    owner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>
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
export interface PropertyReference<V extends KeyFrameValueType> {
  mounted: Record<string, V>;
  propertyName: string;
}
