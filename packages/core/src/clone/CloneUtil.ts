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
  static _deepCloneObject(source: any, target: object, cloneMap: Map<object, object>): void {
    const fieldModes = source._fieldModes;
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneUtil._cloneValue(source[k], target[k], cloneMap, fieldMode);
    }
  }

  /**
   * @internal
   */
  static _cloneValue(source: any, preset: any, cloneMap: Map<object, object>, fieldMode?: CloneMode): any {
    if (fieldMode === CloneMode.Assignment) return source;
    return CloneUtil._cloneByDefault(source, preset, cloneMap, fieldMode === CloneMode.Deep);
  }

  /**
   * @internal
   * `forceDeepClone` (a `@deepClone`'d field) field-walks a class that has no deep default, and
   * throws on an engine-bound value instead of falling back to it.
   */
  static _cloneByDefault(source: any, preset: any, cloneMap: Map<object, object>, forceDeepClone = false): any {
    if (typeof source === "function") return forceDeepClone ? source : typeof preset === "function" ? preset : source;
    if (source === null || typeof source !== "object") return source;
    if (source instanceof Entity || source instanceof Component) {
      if (forceDeepClone) {
        throw new Error(
          `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — Entity / Component ` +
            `references are engine-bound. Remove @deepClone to remap the reference by default.`
        );
      }
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
    if (source instanceof UpdateFlagManager || source instanceof UpdateFlag) {
      if (forceDeepClone) {
        throw new Error(
          `CloneUtil: @deepClone cannot deep clone "${source.constructor.name}" — a flag and its manager hold ` +
            `each other, and a field copy resolves neither side, leaving the pair inconsistent. Remove ` +
            `@deepClone to keep the clone's own.`
        );
      }
      return preset;
    }
    // Containers whose contents `@deepClone` can copy; the default still keeps the clone's own.
    if (!forceDeepClone && (source instanceof DisorderedArray || source instanceof SafeLoopArray)) return preset;
    if (ArrayBuffer.isView(source)) return CloneUtil._deepCloneArrayBuffer(<ArrayBufferView>source, preset, cloneMap);
    if (Array.isArray(source)) return CloneUtil._deepCloneArray(source, preset, cloneMap);
    if (source instanceof Map) return CloneUtil._deepCloneMap(source, preset, cloneMap);
    if (source instanceof Set) return CloneUtil._deepCloneSet(source, preset, cloneMap);

    const ctor = (<any>source).constructor;
    // Math value types can't extend DataObject (math must not depend on core), so they are
    // duck-typed. `ctor !== Object` keeps a plain payload carrying a `copyFrom` field out.
    const useCopyFrom = ctor && ctor !== Object && typeof (<ICustomClone>source).copyFrom === "function";

    if (useCopyFrom || source instanceof DataObject || ctor === Object || ctor === undefined || forceDeepClone) {
      const existing = cloneMap.get(source);
      if (existing) return existing;
      const reusable = preset && preset !== source && preset.constructor === ctor ? preset : null;
      const dst = reusable ?? (ctor ? CloneUtil._bareConstruct(ctor) : Object.create(null));
      cloneMap.set(source, dst);
      useCopyFrom
        ? (<ICustomClone>dst).copyFrom(<ICustomClone>source)
        : CloneUtil._deepCloneObject(source, dst, cloneMap);
      (<ICustomClone>source)._cloneTo?.(<ICustomClone>dst, cloneMap);
      return dst;
    }

    return source;
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
  static _deepCloneArray(source: any[], preset: any, cloneMap: Map<object, object>): any[] {
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
    for (let i = 0, n = source.length; i < n; i++) dst[i] = CloneUtil._cloneValue(source[i], undefined, cloneMap);
    return dst;
  }

  /**
   * @internal
   */
  static _deepCloneMap(source: Map<any, any>, preset: any, cloneMap: Map<object, object>): Map<any, any> {
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
        CloneUtil._cloneValue(entry[0], undefined, cloneMap),
        CloneUtil._cloneValue(entry[1], undefined, cloneMap)
      );
    }
    return dst;
  }

  /**
   * @internal
   */
  static _deepCloneSet(source: Set<any>, preset: any, cloneMap: Map<object, object>): Set<any> {
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
    for (const v of source) dst.add(CloneUtil._cloneValue(v, undefined, cloneMap));
    return dst;
  }

  /**
   * @internal
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
