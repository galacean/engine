import { KeyframeValueType } from "../../../Keyframe";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<KeyframeValueType> {
  private _getMounted: Record<string, KeyframeValueType | Function>;
  private _setMounted: Record<string, KeyframeValueType | Function>;

  private _getType: HandleType;
  private _setType: HandleType;

  private _getValueName: string;
  private _setValueName: string;

  private _getArgs: any[];
  private _setArgs: any[];
  private _replaceValueIndex: number;

  private _getArrayIndex: number;
  private _setArrayIndex: number;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    let mounted = owner.component;

    const setProperties = owner.property.split(".");

    if (owner.getProperty) {
      const getProperties = owner.getProperty.split(".");
      this._initializeMounted(mounted, getProperties, MountedParseFlag.Get);
      this._initializeMounted(mounted, setProperties, MountedParseFlag.Set);
    } else {
      this._initializeMounted(mounted, setProperties, MountedParseFlag.Both);
    }
  }

  getTargetValue(): KeyframeValueType {
    switch (this._getType) {
      case HandleType.Array:
        return this._getMounted[this._getArrayIndex] as KeyframeValueType;
      case HandleType.Method:
        return (this._getMounted[this._getValueName] as Function).apply(this._getMounted, this._getArgs);
      case HandleType.Property:
        return this._getMounted[this._getValueName] as KeyframeValueType;
    }
  }

  setTargetValue(value: KeyframeValueType): void {
    switch (this._setType) {
      case HandleType.Array:
        this._setMounted[this._setArrayIndex] = value;
        break;
      case HandleType.Method:
        const args = this._setArgs;
        args[this._replaceValueIndex] = value;
        (this._setMounted[this._setValueName] as Function).apply(this._setMounted, args);
        break;
      case HandleType.Property:
        this._setMounted[this._setValueName] = value;
        break;
    }
  }

  private _initializeMounted(mounted: any, properties: string[], parseFlag: MountedParseFlag): void {
    const endIndex = properties.length - 1;
    for (let i = 0; i < endIndex; i++) {
      const property = properties[i];
      if (property.indexOf("[") > -1) {
        // is array
        const indexPos = property.indexOf("[");
        mounted = mounted[property.slice(0, indexPos)];
        mounted = mounted[parseInt(property.slice(indexPos + 1, -1))];
      } else if (property.endsWith(")")) {
        // is method
        const methodName = property.slice(0, property.indexOf("("));
        const args = property
          .match(/\w+\(([^)]*)\)/)[1]
          .split(",")
          .map((arg) => arg.trim().replace(/['"]+/g, ""))
          .filter((arg) => arg !== "");
        mounted = mounted[methodName].apply(mounted, args);
      } else {
        // is property
        mounted = mounted[property];
      }
    }

    const property = properties[endIndex];

    let handleType: HandleType;
    let arrayIndex: number;
    let methodName: string;
    let args: any[];

    if (property.indexOf("[") > -1) {
      const indexPos = property.indexOf("[");
      handleType = HandleType.Array;
      mounted = mounted[property.slice(0, indexPos)];
      arrayIndex = parseInt(property.slice(indexPos + 1, -1));
    } else if (property.endsWith(")")) {
      methodName = property.slice(0, property.indexOf("("));
      args = property
        .match(/\w+\(([^)]*)\)/)[1]
        .split(",")
        .map((arg) => arg.trim().replace(/['"]+/g, ""))
        .filter((arg) => arg !== "");
      handleType = HandleType.Method;
      if (parseFlag & MountedParseFlag.Set) {
        const index = args.indexOf("$value");
        this._replaceValueIndex = index > -1 ? index : args.length;
      }
    } else {
      handleType = HandleType.Property;
    }

    if (parseFlag & MountedParseFlag.Set) {
      this._setMounted = mounted;
      this._setType = handleType;
      this._setArrayIndex = arrayIndex;
      this._setValueName = property;
      methodName && (this._setValueName = methodName);
      this._setArgs = args;
    }
    if (parseFlag & MountedParseFlag.Get) {
      this._getMounted = mounted;
      this._getType = handleType;
      this._getArrayIndex = arrayIndex;
      this._getValueName = property;
      methodName && (this._getValueName = methodName);
      this._getArgs = args;
    }
  }
}

enum HandleType {
  Property,
  Method,
  Array
}

enum MountedParseFlag {
  Get = 0x1,
  Set = 0x2,
  Both = 0x3
}
