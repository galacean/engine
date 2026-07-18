import { Component } from "../Component";
import { Entity } from "../Entity";
import { ReferResource } from "../asset/ReferResource";
import { DataObject } from "../base/DataObject";
import { TypedArray } from "../base/Constant";
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
// `forceDeep` is the one difference between the default path and a `@deepClone`'d field: it flips
// the sole ambiguous case — a class instance with no deep-clone default (not DataObject / math /
// container) — from "share" to "field-walk". Everything else resolves the same on both paths.
CloneManager._cloneByDefault = (value: object, reuse: any, cloneMap: Map<object, object>, forceDeep = false): any => {
  // Already produced for this source in the graph — a deep clone made earlier, or, for an
  // Entity / Component inside the cloned subtree, its clone registered at tree-build time. Reusing
  // it dedups shared / cyclic references and doubles as the in-subtree remap.
  const existing = cloneMap.get(value);
  if (existing) return existing;

  // Containers — a fresh structure, each member re-entering the gate.
  if (ArrayBuffer.isView(value)) {
    // Byte copy into a reused view of matching layout, else a fresh one.
    let dst: ArrayBufferView;
    if (value instanceof DataView) {
      if (reuse instanceof DataView && reuse !== value && reuse.byteLength === value.byteLength) {
        new Uint8Array(reuse.buffer, reuse.byteOffset, reuse.byteLength).set(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        );
        dst = reuse;
      } else {
        dst = new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      }
    } else {
      const src = <TypedArray>value;
      if (
        reuse &&
        reuse !== value &&
        reuse.constructor === src.constructor &&
        (<TypedArray>reuse).length === src.length
      ) {
        (<TypedArray>reuse).set(src);
        dst = reuse;
      } else {
        dst = src.slice();
      }
    }
    cloneMap.set(value, dst);
    return dst;
  }
  if (Array.isArray(value)) {
    const dst = new Array(value.length);
    cloneMap.set(value, dst);
    for (let i = 0, n = value.length; i < n; i++) dst[i] = CloneManager._cloneValue(value[i], undefined, cloneMap);
    return dst;
  }
  if (value instanceof Map) {
    const dst = new Map<any, any>();
    cloneMap.set(value, dst);
    for (const entry of value) {
      dst.set(
        CloneManager._cloneValue(entry[0], undefined, cloneMap),
        CloneManager._cloneValue(entry[1], undefined, cloneMap)
      );
    }
    return dst;
  }
  if (value instanceof Set) {
    const dst = new Set<any>();
    cloneMap.set(value, dst);
    for (const v of value) dst.add(CloneManager._cloneValue(v, undefined, cloneMap));
    return dst;
  }

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

  // Everything remaining is a non-container object. A compatible preset of the exact same type is
  // reused as the clone target; otherwise a bare instance is constructed (null-prototype objects
  // have no constructor, so rebuild as such).
  const ctor = (<any>value).constructor;
  const reusable = reuse && reuse !== value && reuse.constructor === ctor ? reuse : null;

  // Math value type (Vector3, Color, ...) — a class instance carrying a callable copyFrom; copy
  // via it. Math cannot depend on core, so it cannot extend DataObject and is recognized this way.
  if (ctor && ctor !== Object && typeof (<ICustomClone>value).copyFrom === "function") {
    const dst = <ICustomClone>(reusable ?? CloneManager._bareConstruct(ctor));
    cloneMap.set(value, dst);
    dst.copyFrom(<ICustomClone>value);
    (<ICustomClone>value)._cloneTo?.(dst, cloneMap);
    return dst;
  }

  // Field-walk deep clone: the DataObject family and plain / null-prototype objects always; any
  // other class instance only when `@deepClone` forces it (default shares it — see `forceDeep`).
  if (value instanceof DataObject || ctor === Object || ctor === undefined || forceDeep) {
    const dst = reusable ?? (ctor ? CloneManager._bareConstruct(ctor) : Object.create(null));
    cloneMap.set(value, dst);
    CloneManager.deepCloneObject(value, dst, cloneMap);
    (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
    return dst;
  }

  // A class instance with no deep-clone default, on the default path — shared.
  return value;
};

CloneManager._isRemapType = (value: any): boolean => value instanceof Entity || value instanceof Component;

CloneManager._isCountedResource = (value: any): boolean => value instanceof ReferResource;
