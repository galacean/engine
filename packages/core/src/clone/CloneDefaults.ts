import { Component } from "../Component";
import { Entity } from "../Entity";
import { ReferResource } from "../asset/ReferResource";
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
  if ((<ICustomClone>value)._isDeepCloneType) return CloneManager._deepClone(value, reuse, cloneMap);
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
