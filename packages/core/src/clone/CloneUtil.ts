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
 * Split from `CloneManager`, which must stay free of engine imports.
 */
export class CloneUtil {
  /**
   * @internal
   */
  static _deepCloneObject(source: any, target: object, cloneMap: Map<object, object>, forceDeepClone = false): void {
    const fieldModes = source._fieldModes;
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneUtil._cloneValue(source[k], target[k], cloneMap, fieldMode, forceDeepClone);
    }
  }

  /**
   * @internal
   */
  static _cloneValue(
    source: any,
    preset: any,
    cloneMap: Map<object, object>,
    fieldMode?: CloneMode,
    forceDeepClone = false
  ): any {
    if (fieldMode === CloneMode.Assignment) return source;
    if (fieldMode === CloneMode.Deep) {
      // The explicit decorator must be honorable on the value it decorates; the deep intent it
      // propagates into the subtree is softer — engine-bound members keep their defaults.
      CloneUtil._assertDeepClonable(source);
      forceDeepClone = true;
    }
    return CloneUtil._cloneByDefault(source, preset, cloneMap, forceDeepClone);
  }

  /**
   * @internal
   * `forceDeepClone` (a `@deepClone` somewhere up the walk) deep-copies the whole subtree: a
   * class with no deep default flips from "share" to "field-walk", and containers carry the
   * force into their members. Engine-bound values keep their defaults (remap / share / own).
   */
  static _cloneByDefault(source: any, preset: any, cloneMap: Map<object, object>, forceDeepClone = false): any {
    if (typeof source === "function") return forceDeepClone ? source : typeof preset === "function" ? preset : source;
    if (source === null || typeof source !== "object") return source;
    if (source instanceof Entity || source instanceof Component) return cloneMap.get(source) ?? source;
    if (source instanceof ReferResource) return source;
    if (source instanceof UpdateFlagManager || source instanceof UpdateFlag) return preset;
    if (ArrayBuffer.isView(source)) return CloneUtil._deepCloneArrayBuffer(<ArrayBufferView>source, preset, cloneMap);
    if (Array.isArray(source)) return CloneUtil._deepCloneArray(source, preset, cloneMap, forceDeepClone);
    if (source instanceof Map) return CloneUtil._deepCloneMap(source, preset, cloneMap, forceDeepClone);
    if (source instanceof Set) return CloneUtil._deepCloneSet(source, preset, cloneMap, forceDeepClone);
    if (source instanceof DisorderedArray || source instanceof SafeLoopArray) {
      if (!forceDeepClone) return preset;
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const dst = CloneUtil._createCloneTarget(source, preset, cloneMap);
      CloneUtil._deepCloneObject(source, dst, cloneMap, true);
      return dst;
    }

    const ctor = (<any>source).constructor;
    if (ctor && ctor !== Object && typeof (<ICustomClone>source).copyFrom === "function") {
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const dst = CloneUtil._createCloneTarget(source, preset, cloneMap);
      (<ICustomClone>dst).copyFrom(<ICustomClone>source);
      (<ICustomClone>source)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }

    if (source instanceof DataObject || ctor === Object || ctor === undefined || forceDeepClone) {
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const dst = CloneUtil._createCloneTarget(source, preset, cloneMap);
      CloneUtil._deepCloneObject(source, dst, cloneMap, forceDeepClone);
      (<ICustomClone>source)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }
    return source;
  }

  /**
   * @internal
   * Throws when a `@deepClone`-decorated value cannot be deep cloned.
   */
  static _assertDeepClonable(source: any): void {
    if (source instanceof Entity || source instanceof Component) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — Entity / Component ` +
          `references are engine-bound. Remove @deepClone to remap the reference by default.`
      );
    }
    if (source instanceof ReferResource) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — assets are engine-bound ` +
          `and shared by reference. Remove @deepClone to share it, or copy it via the asset's own clone() API.`
      );
    }
    if (source instanceof UpdateFlagManager || source instanceof UpdateFlag) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — a flag and its manager hold ` +
          `each other, and a field copy resolves neither side, leaving the pair inconsistent. Remove ` +
          `@deepClone to keep the clone's own.`
      );
    }
  }

  /**
   * @internal
   * Registers the new instance before the caller descends, so a cycle resolves to it.
   */
  static _createCloneTarget(source: any, preset: any, cloneMap: Map<object, object>): any {
    const ctor = (<any>source).constructor;
    const reusable = preset && preset !== source && preset.constructor === ctor ? preset : null;
    let dst: any;
    if (reusable) {
      dst = reusable;
    } else {
      if (ctor) {
        try {
          dst = new ctor();
        } catch (e) {
          throw new Error(
            `CloneUtil: failed to bare-construct "${ctor.name}" — a type cloned deep must support ` +
              `argument-less construction (the gate creates preset-less instances bare, then populates fields). ` +
              `Cause: ${e}`
          );
        }
      } else {
        dst = Object.create(null);
      }
    }
    cloneMap.set(source, dst);
    return dst;
  }

  /**
   * @internal
   */
  static _transferSlotOwnership(cloned: any, source: any, preset: any): void {
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
    if (cloned === source && cloned instanceof ReferResource) {
      (<IReferable>cloned)._addReferCount(1);
    }
  }

  /**
   * @internal
   */
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

  /**
   * @internal
   */
  static _deepCloneArray(source: any[], preset: any, cloneMap: Map<object, object>, forceDeepClone = false): any[] {
    const existing = cloneMap.get(source);
    if (existing) return <any[]>existing;

    const dst =
      preset !== source &&
      Array.isArray(preset) &&
      preset.constructor === source.constructor &&
      preset.length === source.length
        ? preset
        : new Array(source.length);
    cloneMap.set(source, dst);
    for (let i = 0, n = source.length; i < n; i++) {
      dst[i] = CloneUtil._cloneByDefault(source[i], undefined, cloneMap, forceDeepClone);
    }
    return dst;
  }

  /**
   * @internal
   */
  static _deepCloneMap(
    source: Map<any, any>,
    preset: any,
    cloneMap: Map<object, object>,
    forceDeepClone = false
  ): Map<any, any> {
    const existing = cloneMap.get(source);
    if (existing) return <Map<any, any>>existing;

    let dst: Map<any, any>;
    if (preset instanceof Map && preset !== source && preset.constructor === source.constructor) {
      preset.clear();
      dst = preset;
    } else {
      dst = new Map<any, any>();
    }
    cloneMap.set(source, dst);
    for (const entry of source) {
      dst.set(
        CloneUtil._cloneByDefault(entry[0], undefined, cloneMap, forceDeepClone),
        CloneUtil._cloneByDefault(entry[1], undefined, cloneMap, forceDeepClone)
      );
    }
    return dst;
  }

  /**
   * @internal
   */
  static _deepCloneSet(source: Set<any>, preset: any, cloneMap: Map<object, object>, forceDeepClone = false): Set<any> {
    const existing = cloneMap.get(source);
    if (existing) return <Set<any>>existing;

    let dst: Set<any>;
    if (preset instanceof Set && preset !== source && preset.constructor === source.constructor) {
      preset.clear();
      dst = preset;
    } else {
      dst = new Set<any>();
    }
    cloneMap.set(source, dst);
    for (const v of source) dst.add(CloneUtil._cloneByDefault(v, undefined, cloneMap, forceDeepClone));
    return dst;
  }
}
