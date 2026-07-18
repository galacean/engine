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
// Each type is identified and handled in one step — no intermediate CloneMode, and no separate
// "is this a container" predicate whose truths must each be mirrored by a clone branch elsewhere.
CloneManager._cloneByDefault = (value: object, reuse: any, cloneMap: Map<object, object>): any => {
  // Already produced for this source in the graph — a deep clone made earlier, or, for an
  // Entity / Component inside the cloned subtree, its clone registered at tree-build time. Reusing
  // it dedups shared / cyclic references and doubles as the in-subtree remap.
  const existing = cloneMap.get(value);
  if (existing) return existing;

  // Containers — identify and clone in one step.
  if (ArrayBuffer.isView(value)) return CloneManager._cloneBufferView(value, reuse, cloneMap);
  if (Array.isArray(value)) return CloneManager._cloneArray(value, cloneMap);
  if (value instanceof Map) return CloneManager._cloneMapValue(value, cloneMap);
  if (value instanceof Set) return CloneManager._cloneSetValue(value, cloneMap);

  // Engine-bound families — never deep cloned. An Entity / Component reaching here is outside the
  // cloned subtree (inside was returned by the dedup above), so its original reference is kept.
  if (value instanceof Entity || value instanceof Component) return value;
  if (value instanceof ReferResource) return value;
  if (
    value instanceof UpdateFlagManager ||
    value instanceof UpdateFlag ||
    value instanceof DisorderedArray ||
    value instanceof SafeLoopArray
  ) {
    return reuse;
  }

  // Deep-cloned objects: the DataObject family, plain / null-prototype objects, and math value
  // types (dispatched by their callable `copyFrom` — math cannot depend on core, so it cannot
  // extend DataObject). Any other class instance is shared. Placed after the engine-bound families
  // so one of those can never be mistaken for a value type.
  const ctor = (<{ constructor?: Function }>value).constructor;
  if (
    value instanceof DataObject ||
    ctor === Object ||
    ctor === undefined ||
    typeof (<ICustomClone>value).copyFrom === "function"
  ) {
    return CloneManager._cloneClassInstance(value, reuse, cloneMap);
  }
  return value;
};

CloneManager._isRemapType = (value: any): boolean => value instanceof Entity || value instanceof Component;

CloneManager._isCountedResource = (value: any): boolean => value instanceof ReferResource;
