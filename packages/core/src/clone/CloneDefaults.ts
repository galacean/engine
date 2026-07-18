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
// module evaluation and break `extends` chains). All families resolve by `instanceof`: every
// instance the gate can meet is engine-constructed, always same-realm with the gate.
// One pass, by type family: decide and execute together, no intermediate CloneMode.
CloneManager._cloneByDefault = (value: object, reuse: any, cloneMap: Map<object, object>): any => {
  if (CloneManager._isContainer(value) || value instanceof DataObject) {
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
  // Math-style value types keep the historical duck-typed dispatch: a callable `copyFrom` means
  // deep clone via it (math cannot depend on core, so it cannot extend DataObject). Placed after
  // the intrinsic families so an engine-bound object can never be mistaken for a value type.
  if (typeof (<ICustomClone>value).copyFrom === "function") {
    return CloneManager._deepClone(value, reuse, cloneMap);
  }
  return value;
};

CloneManager._isRemapType = (value: any): boolean => value instanceof Entity || value instanceof Component;

CloneManager._isCountedResource = (value: any): boolean => value instanceof ReferResource;
