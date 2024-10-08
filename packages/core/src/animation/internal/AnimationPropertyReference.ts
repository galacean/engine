import { AnimationPropertyReferenceManager } from "./AnimationPropertyReferenceManager";

/**
 * @internal
 */
export abstract class AnimationPropertyReference {
  manager: AnimationPropertyReferenceManager;
  parseFlag: MountedParseFlag;
  invDependencies = new Array<number>();
  value: any;
  index: number;

  private _parent: AnimationPropertyReference;
  private _dirty = true;

  get dirty(): boolean {
    return this._dirty;
  }

  set dirty(value: boolean) {
    this._dirty = value;
    if (value) {
      for (let i = 0; i < this.invDependencies.length; i++) {
        const index = this.invDependencies[i];
        const reference = this.manager.animationPropertyReferences[index];
        reference.dirty = true;
      }
    }
  }

  get parent(): AnimationPropertyReference {
    return this._parent;
  }

  set parent(dependence: AnimationPropertyReference) {
    this._parent = dependence;
    dependence.invDependencies.push(this.index);
  }

  abstract getValue(): any;
  abstract setValue(value: any): void;
}

/**
 * @internal
 */
export class ComponentReference extends AnimationPropertyReference {
  getValue() {
    return this.value;
  }

  setValue(value: any) {
    this.value = value;
  }
}

/**
 * @internal
 */
export class PropertyReference extends AnimationPropertyReference {
  property: string;

  constructor(propertyStr: string) {
    super();
    this.property = propertyStr;
  }

  getValue() {
    const dependence = this.parent;

    if (dependence.dirty) {
      dependence.getValue();
    }

    if (this.dirty) {
      this.value = dependence.value[this.property];
      this.dirty = false;
    }
    return this.value;
  }

  setValue(value: any) {
    const dependence = this.parent;
    if (dependence.dirty) {
      dependence.getValue();
    }

    this.value = dependence.value[this.property] = value;
    this.dirty = true;
  }
}

/**
 * @internal
 */
export class MethodReference extends AnimationPropertyReference {
  methodName: string;
  args: any[];
  replaceValueIndex: number;

  constructor(propertyStr: string) {
    super();
    this.methodName = propertyStr.slice(0, propertyStr.indexOf("("));
    this.args = propertyStr
      .match(/\w+\(([^)]*)\)/)[1]
      .split(",")
      .map((arg) => arg.trim().replace(/['"]+/g, ""))
      .filter((arg) => arg !== "");
    this.replaceValueIndex = this.args.indexOf("$value");
  }

  getValue() {
    const dependence = this.parent;
    if (dependence.dirty) {
      dependence.getValue();
    }
    this.value = dependence.value[this.methodName].apply(dependence.value, this.args);
    this.dirty = false;
    return this.value;
  }

  setValue(value: any) {
    const dependence = this.parent;
    if (dependence.dirty) {
      dependence.getValue();
    }
    const args = this.args;
    if (this.replaceValueIndex >= 0) {
      args[this.replaceValueIndex] = value;
    }
    dependence.value[this.methodName].apply(dependence.value, args);
    this.dirty = true;
  }
}

/**
 * @internal
 */
export class ArrayReference extends AnimationPropertyReference {
  property: string;
  arrayIndex: number;

  constructor(propertyStr: string) {
    super();
    const indexPos = propertyStr.indexOf("[");
    this.property = propertyStr.slice(0, indexPos);
    this.arrayIndex = parseInt(propertyStr.slice(indexPos + 1, -1));
  }

  getValue() {
    const dependence = this.parent;
    if (dependence.dirty) {
      dependence.getValue();
    }
    this.value = dependence.value[this.property][this.arrayIndex];
    this.dirty = false;
    return this.value;
  }

  setValue(value: any) {
    const dependence = this.parent;
    if (dependence.dirty) {
      dependence.getValue();
    }
    dependence.value[this.property][this.arrayIndex] = value;
    this.dirty = true;
  }
}

/**
 * @internal
 */
export enum MountedParseFlag {
  Get = 0x1,
  Set = 0x2,
  Both = 0x3
}
