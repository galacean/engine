import { Component } from "../../Component";
import {
  AnimationPropertyReference,
  ArrayReference,
  ComponentReference,
  MethodReference,
  MountedParseFlag,
  PropertyReference
} from "./AnimationPropertyReference";

/**
 * @internal
 */
export class AnimationPropertyReferenceManager {
  animationPropertyReferences: AnimationPropertyReference[] = [];

  private _referenceIndexMap: Map<string | Component, AnimationPropertyReference> = new Map();
  private _subProperties = new Array<string>();

  addReference(component: Component, propertyStr: string, parseFlag: MountedParseFlag): AnimationPropertyReference {
    const instanceId = component.instanceId;

    let reference: AnimationPropertyReference;

    const existedReference = this._referenceIndexMap.get(component);
    if (existedReference) {
      reference = existedReference;
    } else {
      reference = new ComponentReference();
      reference.manager = this;
      reference.value = component;
    }

    const properties = propertyStr.split(".");
    const endIndex = properties.length - 1;

    const subProperties = this._subProperties;
    subProperties.length = 0;

    for (let i = 0; i <= endIndex; i++) {
      const property = properties[i];
      subProperties.push(property);
      const uniqueKey = `${instanceId}-${subProperties.join(".")}`;
      const existReference = this._referenceIndexMap.get(uniqueKey);
      if (existReference) {
        reference = existReference;
        continue;
      }

      const parent = reference;

      if (property.indexOf("[") > -1) {
        // is array
        reference = new ArrayReference(property);
      } else if (property.endsWith(")")) {
        // is method
        reference = new MethodReference(property);
      } else {
        // is property
        reference = new PropertyReference(property);
      }

      reference.manager = this;
      reference.index = this.animationPropertyReferences.length;
      reference.parent = parent;

      // Get the value once when initializing to improve runtime performance
      if (parseFlag & MountedParseFlag.Get) {
        reference.getValue();
      }
      this._referenceIndexMap.set(uniqueKey, reference);
      this.animationPropertyReferences.push(reference);
    }

    return reference;
  }

  clear() {
    this.animationPropertyReferences.length = 0;
    this._referenceIndexMap.clear();
  }
}
