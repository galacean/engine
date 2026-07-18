import { ReferResource } from "../asset/ReferResource";
import { IReferable } from "../asset/IReferable";
import { Logger } from "../base/Logger";
import { TypedArray } from "../base/Constant";
import { DataObject } from "../base/DataObject";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { UpdateFlag } from "../UpdateFlag";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { DisorderedArray } from "../utils/DisorderedArray";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { ICustomClone } from "./ComponentCloner";
import { CloneMode } from "./enums/CloneMode";

/**
 * @internal
 * Clone execution. Identifies each value by type and clones it in one step — a field decorator
 * (highest priority) is honored here, and with no decorator the built-in default by type family
 * applies. Engine classes are imported here rather than in `CloneManager`, which every decorated
 * class pulls in while still being defined.
 */
export class CloneUtil {
  /**
   * @internal
   * Clone gate for one value.
   */
  static _cloneValue(source: any, reuse: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    // A function is a value, not a graph: an explicit decorator shares the source function, while
    // the default keeps the clone's own constructor-rebound binding when it has one.
    if (typeof source === "function") {
      return fieldMode === undefined && typeof reuse === "function" ? reuse : source;
    }
    if (source === null || typeof source !== "object") return source;

    switch (fieldMode) {
      case CloneMode.Assignment:
        return source;
      case CloneMode.Deep:
        // `@deepClone` is an explicit intent: force a deep copy, and throw if it can't be honored.
        return CloneUtil._cloneByType(source, reuse, cloneMap, true);
      default:
        return CloneUtil._cloneByType(source, reuse, cloneMap);
    }
  }

  /**
   * @internal
   * Clone all enumerable fields of source into target; each field goes back through the gate,
   * honoring field-level decorators.
   */
  static deepCloneObject(source: any, target: object, cloneMap: Map<object, object>): void {
    // Resolved once per object (a single prototype-chain walk), not once per field.
    const fieldModes = source._fieldModes;
    for (const k in source) {
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneUtil._cloneValue(source[k], target[k], cloneMap, fieldMode);
    }
  }

  /**
   * @internal
   * Identify a value by type family and clone it. `forceDeepClone` (a `@deepClone`'d field) turns
   * the one ambiguous case — a class with no deep-clone default — from "share" into "field-walk",
   * and makes an engine-bound value throw instead of silently resolving to its default.
   */
  static _cloneByType(value: any, reuse: any, cloneMap: Map<object, object>, forceDeepClone = false): any {
    // `@deepClone` on an engine-bound value is a mistake in the developer's intent — reject it
    // before the dedup below, which would otherwise quietly resolve an in-subtree Entity to its
    // clone and hide the misuse.
    if (forceDeepClone) CloneUtil._assertDeepCloneable(value);

    // Already produced for this source in the graph — a clone made earlier, or, for an Entity /
    // Component inside the cloned subtree, its clone registered at tree-build time. Reusing it
    // dedups shared / cyclic references and doubles as the in-subtree remap.
    const existing = cloneMap.get(value);
    if (existing) return existing;

    if (ArrayBuffer.isView(value)) {
      return CloneUtil._deepCloneArrayBuffer(<ArrayBufferView>value, reuse, cloneMap);
    } else if (Array.isArray(value)) {
      return CloneUtil._deepCloneArray(value, reuse, cloneMap);
    } else if (value instanceof Map) {
      return CloneUtil._deepCloneMap(value, reuse, cloneMap);
    } else if (value instanceof Set) {
      return CloneUtil._deepCloneSet(value, reuse, cloneMap);
    } else if (value instanceof Entity || value instanceof Component) {
      // Outside the cloned subtree (inside was returned by the dedup above): keep the original.
      return value;
    } else if (value instanceof ReferResource) {
      return value;
    } else if (
      value instanceof UpdateFlagManager ||
      value instanceof UpdateFlag ||
      value instanceof DisorderedArray ||
      value instanceof SafeLoopArray
    ) {
      return reuse;
    } else {
      // A non-container object. A compatible preset of the exact same type is reused as the clone
      // target; otherwise a bare instance is constructed (null-prototype objects have no
      // constructor, so rebuild as such).
      const ctor = (<any>value).constructor;
      const reusable = reuse && reuse !== value && reuse.constructor === ctor ? reuse : null;

      // Math value type (Vector3, Color, ...) — a class instance carrying a callable copyFrom; copy
      // via it. Math cannot depend on core, so it cannot extend DataObject and is recognized this
      // way. Plain / null-prototype objects never take this branch, even when a `copyFrom` data
      // field rides in the payload.
      if (ctor && ctor !== Object && typeof (<ICustomClone>value).copyFrom === "function") {
        const dst = <ICustomClone>(reusable ?? CloneUtil._bareConstruct(ctor));
        cloneMap.set(value, dst);
        dst.copyFrom(<ICustomClone>value);
        (<ICustomClone>value)._cloneTo?.(dst, cloneMap);
        return dst;
      }

      // Field-walk deep clone: the DataObject family and plain / null-prototype objects always; any
      // other class instance only when `@deepClone` forces it (the default shares it).
      if (value instanceof DataObject || ctor === Object || ctor === undefined || forceDeepClone) {
        const dst = reusable ?? (ctor ? CloneUtil._bareConstruct(ctor) : Object.create(null));
        cloneMap.set(value, dst);
        CloneUtil.deepCloneObject(value, dst, cloneMap);
        (<ICustomClone>value)._cloneTo?.(<ICustomClone>dst, cloneMap);
        return dst;
      }

      // A class instance with no deep-clone default, on the default path — shared.
      return value;
    }
  }

  /**
   * @internal
   * Settle a slot's counted ownership after the gate wrote it: an unchanged slot keeps its
   * account, a displaced owned counted preset releases one reference, and a slot sharing the
   * source's counted value acquires one. Destroy releases the slot (class contract).
   */
  static _transferSlotOwnership(cloned: any, sourceValue: any, preset: any): void {
    // Slot content unchanged (Ignore kept / value type copied in place / function reused).
    if (cloned === preset) return;
    if (CloneUtil._isReferenceResource(preset)) {
      const presetRefCount = (<{ refCount?: number }>preset).refCount;
      presetRefCount !== undefined &&
        presetRefCount <= 0 &&
        Logger.error(
          `CloneUtil: the clone's preset ${preset.constructor.name} holds no owned reference; ` +
            `a constructor presetting a ref-counted resource must acquire it (assign via its setter or an explicit +1).`
        );
      (<IReferable>preset)._addReferCount(-1);
    }
    // `cloned === sourceValue` ⇔ the slot shared the source value (only the Assignment path
    // returns a registered resource as-is), so it owns one reference.
    if (cloned === sourceValue && CloneUtil._isReferenceResource(cloned)) {
      (<IReferable>cloned)._addReferCount(1);
    }
  }

  /**
   * @internal
   * ArrayBuffer view — byte copy into a reused view of matching layout, else a fresh one.
   */
  static _deepCloneArrayBuffer(value: ArrayBufferView, reuse: any, cloneMap: Map<object, object>): ArrayBufferView {
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

  /**
   * @internal
   * Array — every element re-enters the gate. A preset of the same type and length is filled in
   * place; `reuse !== value` guards the case where the clone still shares the source's array
   * (a class-level default table), where writing into it would corrupt the source.
   */
  static _deepCloneArray(value: any[], reuse: any, cloneMap: Map<object, object>): any[] {
    const dst =
      reuse !== value &&
      Array.isArray(reuse) &&
      reuse.constructor === value.constructor &&
      reuse.length === value.length
        ? reuse
        : new Array(value.length);
    cloneMap.set(value, dst);
    for (let i = 0, n = value.length; i < n; i++) dst[i] = CloneUtil._cloneValue(value[i], undefined, cloneMap);
    return dst;
  }

  /**
   * @internal
   * Map — every key and value re-enters the gate. A reused preset is cleared first: it holds the
   * clone's own constructor-built entries, which would otherwise survive alongside the source's.
   */
  static _deepCloneMap(value: Map<any, any>, reuse: any, cloneMap: Map<object, object>): Map<any, any> {
    let dst: Map<any, any>;
    if (reuse instanceof Map && reuse !== value && reuse.constructor === value.constructor) {
      reuse.clear();
      dst = reuse;
    } else {
      dst = new Map<any, any>();
    }
    cloneMap.set(value, dst);
    for (const entry of value) {
      dst.set(
        CloneUtil._cloneValue(entry[0], undefined, cloneMap),
        CloneUtil._cloneValue(entry[1], undefined, cloneMap)
      );
    }
    return dst;
  }

  /**
   * @internal
   * Set — every member re-enters the gate. A reused preset is cleared first, for the same reason
   * as `Map`.
   */
  static _deepCloneSet(value: Set<any>, reuse: any, cloneMap: Map<object, object>): Set<any> {
    let dst: Set<any>;
    if (reuse instanceof Set && reuse !== value && reuse.constructor === value.constructor) {
      reuse.clear();
      dst = reuse;
    } else {
      dst = new Set<any>();
    }
    cloneMap.set(value, dst);
    for (const v of value) dst.add(CloneUtil._cloneValue(v, undefined, cloneMap));
    return dst;
  }

  /**
   * @internal
   * A field decorator is the developer's explicit intent, so `@deepClone` on a value that can't be
   * deep cloned is surfaced rather than silently resolved to that value's default behavior.
   */
  static _assertDeepCloneable(value: any): void {
    if (value instanceof Entity || value instanceof Component) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${value.constructor.name}" — Entity / Component ` +
          `references are engine-bound. Remove @deepClone to remap the reference by default.`
      );
    }
    if (value instanceof ReferResource) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${value.constructor.name}" — assets are engine-bound ` +
          `and shared by reference. Remove @deepClone to share it, or copy it via the asset's own clone() API.`
      );
    }
    if (
      value instanceof UpdateFlagManager ||
      value instanceof UpdateFlag ||
      value instanceof DisorderedArray ||
      value instanceof SafeLoopArray
    ) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${value.constructor.name}" — engine runtime state is ` +
          `transient and belongs to the instance holding it. Remove @deepClone to keep the clone's own.`
      );
    }
  }

  /**
   * @internal
   * Remap types are the only values whose clones are registered before the field walk begins (at
   * tree-build time), so looking one up in the identity map yields the same answer regardless of
   * the order fields happen to be walked in.
   */
  static _isRemapType(value: any): boolean {
    return value instanceof Entity || value instanceof Component;
  }

  /**
   * @internal
   * Counted = the ReferResource family only.
   */
  static _isReferenceResource(value: any): boolean {
    return value instanceof ReferResource;
  }

  /**
   * @internal
   * A deep-cloned instance without a compatible preset is constructed bare; name the contract
   * when that fails instead of surfacing the constructor's raw error.
   */
  static _bareConstruct(ctor: new () => any): any {
    try {
      return new ctor();
    } catch (e) {
      throw new Error(
        `CloneUtil: failed to bare-construct "${ctor.name}" — a type cloned deep must support ` +
          `argument-less construction (the gate creates preset-less instances bare, then populates fields). ` +
          `Cause: ${e}`
      );
    }
  }
}
