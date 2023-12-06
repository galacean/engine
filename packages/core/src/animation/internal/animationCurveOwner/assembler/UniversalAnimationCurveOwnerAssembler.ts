import { KeyframeValueType, MethodParam } from "../../../Keyframe";
import { AnimationMethodCurve } from "../../../animationCurve";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

enum SetType {
  Property,
  Method,
  Array
}
/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<KeyframeValueType> {
  private _mounted: Record<string, KeyframeValueType>;
  private _propertyName: string;
  private _isMethodParamValue: KeyframeValueType;
  private _setType: SetType;
  private _methodName: string;
  private _args: any[];
  private _arrayIndex: number;
  private _replaceValueIndex: number;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    const endIndex = properties.length - 1;
    for (let i = 0; i < endIndex; i++) {
      const property = properties[i];
      if (property.indexOf("[") > -1) {
        // 数组索引
        const indexPos = property.indexOf("[");
        mounted = mounted[property.slice(0, indexPos)];
        mounted = mounted[parseInt(property.slice(indexPos + 1, -1))];
      } else if (property.endsWith(")")) {
        // 函数调用
        const methodName = property.slice(0, property.indexOf("("));
        const args = property
          .match(/\w+\(([^)]*)\)/)[1]
          .split(",")
          .map((arg) => arg.trim().replace(/['"]+/g, ""))
          .filter((arg) => arg !== "");
        mounted = mounted[methodName](...args);
      } else {
        // 属性访问
        mounted = mounted[property];
      }
    }

    const property = properties[endIndex];

    this._mounted = mounted;
    this._isMethodParamValue = owner.cureType === AnimationMethodCurve;

    if (property.indexOf("[") > -1) {
      const indexPos = property.indexOf("[");
      this._setType = SetType.Array;
      this._mounted = mounted[property.slice(0, indexPos)];
      this._arrayIndex = parseInt(property.slice(indexPos + 1, -1));
      // 数组索引
    } else if (property.endsWith(")")) {
      this._methodName = property.slice(0, property.indexOf("("));
      const args = (this._args = property
        .match(/\w+\(([^)]*)\)/)[1]
        .split(",")
        .map((arg) => arg.trim().replace(/['"]+/g, ""))
        .filter((arg) => arg !== ""));
      this._setType = SetType.Method;
      const index = args.indexOf("$value");
      this._replaceValueIndex = index > -1 ? index : args.length;
    } else {
      this._setType = SetType.Property;
    }

    this._propertyName = property;
  }

  getTargetValue(): KeyframeValueType {
    const property = this._propertyName;
    const setType = this._setType;

    if (setType === SetType.Array) {
      // 数组索引
      return this._mounted[this._arrayIndex];
    } else if (setType === SetType.Method) {
      return this._mounted[`_o_${property}`];
    } else {
      return this._mounted[property];
    }
  }

  setTargetValue(value: KeyframeValueType): void {
    const property = this._propertyName;
    const setType = this._setType;

    if (setType === SetType.Array) {
      // 数组索引
      this._mounted[this._arrayIndex] = value;
    } else if (setType === SetType.Method) {
      const methodName = this._methodName;
      const args = this._args;
      const replaceValueIndex = this._replaceValueIndex;

      if (this._isMethodParamValue) {
        if (!value) return;

        for (let i = 0, n = (value as MethodParam).length; i < n; i++) {
          args.splice(replaceValueIndex, 1, ...value[i]);
          (this._mounted[methodName] as any)(...args);
        }
      } else {
        args[replaceValueIndex] = value;
        (this._mounted[methodName] as any)(...args);
      }

      // saveOriginValue
      this._mounted[`_o_${property}`] = value;
    } else {
      this._mounted[property] = value;
    }
  }
}
