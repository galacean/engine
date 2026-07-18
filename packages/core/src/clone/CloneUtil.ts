import { IReferable } from "../asset/IReferable";
import { ReferResource } from "../asset/ReferResource";
import { TypedArray } from "../base/Constant";
import { DataObject } from "../base/DataObject";
import { Logger } from "../base/Logger";
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
  /** @internal */
  static _cloneValue(source: any, preset: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    // A function is a value, not a graph: an explicit decorator shares the source function, while
    // the default keeps the clone's own constructor-rebound binding when it has one.
    if (typeof source === "function") {
      return fieldMode === undefined && typeof preset === "function" ? preset : source;
    }
    if (source === null || typeof source !== "object") return source;

    switch (fieldMode) {
      case CloneMode.Assignment:
        return source;
      case CloneMode.Deep:
        // `@deepClone` is an explicit intent: force a deep copy, and throw if it can't be honored.
        return CloneUtil._cloneByDefault(source, preset, cloneMap, true);
      default:
        return CloneUtil._cloneByDefault(source, preset, cloneMap);
    }
  }

  /** @internal */
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
   * `forceDeepClone` (a `@deepClone`'d field) flips a class with no deep-clone default from
   * "share" to "field-walk", and makes an engine-bound value throw instead of resolving to its
   * default.
   */
  static _cloneByDefault(source: any, preset: any, cloneMap: Map<object, object>, forceDeepClone = false): any {
    // Engine-bound families come first: none of them produces a new object, so they need no dedup
    // — an Entity's own map lookup *is* the remap, and the others never enter the map. Being ahead
    // of the dedup is also what lets `@deepClone` on one of them be rejected: behind it, an
    // in-subtree Entity would resolve to its clone and the misuse would go unnoticed.
    if (source instanceof Entity || source instanceof Component) {
      if (forceDeepClone) {
        throw new Error(
          `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — Entity / Component ` +
            `references are engine-bound. Remove @deepClone to remap the reference by default.`
        );
      }
      // In-subtree: the clone registered at tree-build time. Outside: keep the original reference.
      return cloneMap.get(source) ?? source;
    }
    if (source instanceof ReferResource) {
      if (forceDeepClone) {
        throw new Error(
          `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — assets are engine-bound ` +
            `and shared by reference. Remove @deepClone to share it, or copy it via the asset's own clone() API.`
        );
      }
      return source;
    }
    if (
      source instanceof UpdateFlagManager ||
      source instanceof UpdateFlag ||
      source instanceof DisorderedArray ||
      source instanceof SafeLoopArray
    ) {
      if (forceDeepClone) {
        throw new Error(
          `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — engine runtime state is ` +
            `transient and belongs to the instance holding it. Remove @deepClone to keep the clone's own.`
        );
      }
      return preset;
    }

    // No dedup here: whether a value produces a clone at all depends on `forceDeepClone` (a
    // default-less class is shared by default, cloned when forced), so each branch that actually
    // produces one dedups for itself. Looking up first would let a `@deepClone`'d field's copy be
    // handed to a plain field that asked to share — and only when it happened to be walked first.
    if (ArrayBuffer.isView(source)) return CloneUtil._deepCloneArrayBuffer(<ArrayBufferView>source, preset, cloneMap);
    if (Array.isArray(source)) return CloneUtil._deepCloneArray(source, preset, cloneMap);
    if (source instanceof Map) return CloneUtil._deepCloneMap(source, preset, cloneMap);
    if (source instanceof Set) return CloneUtil._deepCloneSet(source, preset, cloneMap);

    // A non-container object. A compatible preset of the exact same type is reused as the clone
    // target; otherwise a bare instance is constructed (null-prototype objects have no
    // constructor, so rebuild as such).
    const ctor = (<any>source).constructor;
    const reusable = preset && preset !== source && preset.constructor === ctor ? preset : null;

    // Math value type (Vector3, Color, ...) — a class instance carrying a callable copyFrom; copy
    // via it. Math cannot depend on core, so it cannot extend DataObject and is recognized this
    // way. Plain / null-prototype objects never take this branch, even when a `copyFrom` data
    // field rides in the payload.
    if (ctor && ctor !== Object && typeof (<ICustomClone>source).copyFrom === "function") {
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const dst = <ICustomClone>(reusable ?? CloneUtil._bareConstruct(ctor));
      cloneMap.set(source, dst);
      dst.copyFrom(<ICustomClone>source);
      (<ICustomClone>source)._cloneTo?.(dst, cloneMap);
      return dst;
    }

    // Field-walk deep clone: the DataObject family and plain / null-prototype objects always; any
    // other class instance only when `@deepClone` forces it (the default shares it).
    if (source instanceof DataObject || ctor === Object || ctor === undefined || forceDeepClone) {
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const dst = reusable ?? (ctor ? CloneUtil._bareConstruct(ctor) : Object.create(null));
      cloneMap.set(source, dst);
      CloneUtil.deepCloneObject(source, dst, cloneMap);
      (<ICustomClone>source)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }

    // A class instance with no deep-clone default, on the default path — shared.
    return source;
  }

  /** @internal */
  static _transferSlotOwnership(cloned: any, source: any, preset: any): void {
    // Slot content unchanged (Ignore kept / value type copied in place / function reused).
    if (cloned === preset) return;
    if (preset instanceof ReferResource) {
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
    if (cloned === source && cloned instanceof ReferResource) {
      (<IReferable>cloned)._addReferCount(1);
    }
  }

  /** @internal */
  static _deepCloneArrayBuffer(source: ArrayBufferView, preset: any, cloneMap: Map<object, object>): ArrayBufferView {
    const existing = cloneMap.get(source);
    if (existing) return <ArrayBufferView>existing;

    let dst: ArrayBufferView;
    if (source instanceof DataView) {
      if (preset instanceof DataView && preset !== source && preset.byteLength === source.byteLength) {
        new Uint8Array(preset.buffer, preset.byteOffset, preset.byteLength).set(
          new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
        );
        dst = preset;
      } else {
        dst = new DataView(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
      }
    } else {
      const src = <TypedArray>source;
      if (
        preset &&
        preset !== source &&
        preset.constructor === src.constructor &&
        (<TypedArray>preset).length === src.length
      ) {
        (<TypedArray>preset).set(src);
        dst = preset;
      } else {
        dst = src.slice();
      }
    }
    cloneMap.set(source, dst);
    return dst;
  }

  /** @internal */
  static _deepCloneArray(source: any[], preset: any, cloneMap: Map<object, object>): any[] {
    const existing = cloneMap.get(source);
    if (existing) return <any[]>existing;

    // `preset !== source`: the clone may still alias the source's array (a class-level default
    // table), and filling that in place would write through into the source.
    const dst =
      preset !== source &&
      Array.isArray(preset) &&
      preset.constructor === source.constructor &&
      preset.length === source.length
        ? preset
        : new Array(source.length);
    cloneMap.set(source, dst);
    for (let i = 0, n = source.length; i < n; i++) dst[i] = CloneUtil._cloneValue(source[i], undefined, cloneMap);
    return dst;
  }

  /** @internal */
  static _deepCloneMap(source: Map<any, any>, preset: any, cloneMap: Map<object, object>): Map<any, any> {
    const existing = cloneMap.get(source);
    if (existing) return <Map<any, any>>existing;

    let dst: Map<any, any>;
    if (preset instanceof Map && preset !== source && preset.constructor === source.constructor) {
      // Clear before refilling: the preset holds the clone's own constructor-built entries, which
      // would otherwise survive alongside the source's.
      preset.clear();
      dst = preset;
    } else {
      dst = new Map<any, any>();
    }
    cloneMap.set(source, dst);
    for (const entry of source) {
      dst.set(
        CloneUtil._cloneValue(entry[0], undefined, cloneMap),
        CloneUtil._cloneValue(entry[1], undefined, cloneMap)
      );
    }
    return dst;
  }

  /** @internal */
  static _deepCloneSet(source: Set<any>, preset: any, cloneMap: Map<object, object>): Set<any> {
    const existing = cloneMap.get(source);
    if (existing) return <Set<any>>existing;

    let dst: Set<any>;
    if (preset instanceof Set && preset !== source && preset.constructor === source.constructor) {
      // Cleared before refilling, same as `Map`.
      preset.clear();
      dst = preset;
    } else {
      dst = new Set<any>();
    }
    cloneMap.set(source, dst);
    for (const v of source) dst.add(CloneUtil._cloneValue(v, undefined, cloneMap));
    return dst;
  }

  /** @internal */
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
