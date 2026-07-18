import { Component } from "../Component";
import { Entity } from "../Entity";
import { ReferResource } from "../asset/ReferResource";
import { DataObject } from "../base/DataObject";
import { UpdateFlag } from "../UpdateFlag";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { DisorderedArray } from "../utils/DisorderedArray";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { CloneManager } from "./CloneManager";
import { ICustomClone } from "./ComponentCloner";

// The built-in default decision lives here — a module-graph sink — so the gate itself never
// imports the intrinsic classes (a top-level class import inside CloneManager would reorder
// module evaluation and break `extends` chains). The deep marker stays a string-keyed property
// because it survives duplicated engine packages, where `instanceof` silently fails; the
// intrinsic families below are always same-realm with the gate, so `instanceof` is safe.
// One pass, by type family: decide and execute together, no intermediate CloneMode.
CloneManager._cloneByDefault = (value: object, reuse: any, cloneMap: Map<object, object>): any => {
  if (CloneManager._isContainer(value)) return CloneManager._deepClone(value, reuse, cloneMap);
  if ((<ICustomClone>value)._isDeepCloneType) {
    // Every DataObject carries this marker too — narrow to it only once Deep is already
    // established, so the common case (Entity / asset / plain-share fields, the majority of a
    // typical scene) never pays for the extra check.
    if (value instanceof DataObject) {
      // DataObject.clone()/copyFrom() are self-contained (they own the _clone/_copyFrom dispatch);
      // route here instead of into _deepClone's generic copyFrom-branch, which would misfire —
      // every DataObject exposes a public `copyFrom`, defeating that branch's duck-typed
      // math-type check.
      if (reuse instanceof DataObject && reuse !== value && reuse.constructor === value.constructor) {
        reuse.copyFrom(value, cloneMap);
        return reuse;
      }
      return value.clone(cloneMap);
    }
    return CloneManager._deepClone(value, reuse, cloneMap);
  }
  if (value instanceof Entity || value instanceof Component) return cloneMap.get(value) ?? value;
  if (value instanceof ReferResource) return value;
  if (
    value instanceof UpdateFlagManager ||
    value instanceof UpdateFlag ||
    value instanceof DisorderedArray ||
    value instanceof SafeLoopArray
  ) {
    return reuse;
  }
  return value;
};

CloneManager._isRemapType = (value: any): boolean => value instanceof Entity || value instanceof Component;

CloneManager._isCountedResource = (value: any): boolean => value instanceof ReferResource;

// DataObject's own public `copyFrom` is a dispatcher, not a specialized copy — excluded so
// `_deepClone` never calls back into it (that would recurse into `_deepClone` itself).
CloneManager._hasSpecializedCopy = (value: any): boolean =>
  !(value instanceof DataObject) && typeof value.copyFrom === "function";
