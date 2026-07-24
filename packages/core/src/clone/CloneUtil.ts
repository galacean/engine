import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  Matrix3x3,
  Plane,
  Quaternion,
  Ray,
  Rect,
  SphericalHarmonics3,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine-math";
import { IReferable } from "../asset/IReferable";
import { ReferResource } from "../asset/ReferResource";
import { TypedArray } from "../base/Constant";
import { Logger } from "../base/Logger";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { UpdateFlag } from "../UpdateFlag";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { CloneMode, defaultCloneModeKey, fieldCloneModesKey, registerDefaultCloneMode } from "./CloneDecorators";
import type { ICloneHook } from "./ICloneHook";

/**
 * @internal
 */
export class CloneUtil {
  /**
   * @internal
   */
  static _cloneObjectFields(
    source: any,
    target: object,
    cloneMap: Map<object, object>,
    deepCloneSubtree = false
  ): void {
    const fieldModes = source[fieldCloneModesKey];
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      target[k] = CloneUtil._cloneFieldValue(source[k], target[k], cloneMap, fieldMode, deepCloneSubtree);
    }
  }

  /**
   * @internal
   */
  static _cloneFieldValue(
    source: any,
    preset: any,
    cloneMap: Map<object, object>,
    fieldMode?: CloneMode,
    deepCloneSubtree = false
  ): any {
    if (fieldMode === CloneMode.Assignment) return source;
    if (fieldMode === CloneMode.Deep) return CloneUtil._cloneValueForDeepField(source, preset, cloneMap);
    return CloneUtil._cloneValueByDefault(source, preset, cloneMap, deepCloneSubtree);
  }

  /**
   * @internal
   */
  static _cloneValueForDeepField(source: any, preset: any, cloneMap: Map<object, object>): any {
    if (typeof source === "function") {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone a function — code is not a cloneable graph. ` +
          `Remove @deepClone to keep the clone's own binding.`
      );
    }
    if (source instanceof Entity || source instanceof Component) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${CloneUtil._getTypeName(source)}" — Entity / Component ` +
          `references are engine-bound. Remove @deepClone to remap the reference by default.`
      );
    }
    if (source instanceof ReferResource) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${CloneUtil._getTypeName(source)}" — assets are engine-bound ` +
          `and shared by reference. Remove @deepClone to share it, or copy it via the asset's own clone() API.`
      );
    }
    if (source instanceof UpdateFlagManager || source instanceof UpdateFlag) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${CloneUtil._getTypeName(source)}" — a flag and its manager hold ` +
          `each other, and a field copy resolves neither side, leaving the pair inconsistent. Remove ` +
          `@deepClone to keep the clone's own.`
      );
    }
    if (source === null || typeof source !== "object") return source;
    switch (source[defaultCloneModeKey]) {
      case CloneMode.Copy:
        return CloneUtil._cloneCopyFromValue(source, preset, cloneMap);
      case CloneMode.Deep:
        return CloneUtil._cloneObjectByFields(source, preset, cloneMap, true);
    }
    if (ArrayBuffer.isView(source)) {
      return CloneUtil._deepCloneArrayBufferView(<ArrayBufferView>source, preset, cloneMap);
    }
    if (Array.isArray(source)) {
      return CloneUtil._cloneArray(source, preset, cloneMap, true);
    }
    if (source instanceof Map) {
      return CloneUtil._cloneMap(source, preset, cloneMap, true);
    }
    if (source instanceof Set) {
      return CloneUtil._cloneSet(source, preset, cloneMap, true);
    }
    if (!CloneUtil._hasOrdinaryObjectTag(source)) {
      throw new Error(
        `CloneUtil: @deepClone cannot deep clone "${CloneUtil._getTypeName(source)}" — its internal state ` +
          `cannot be reproduced by cloning enumerable fields. Remove @deepClone to share it, or wrap the value ` +
          `in a field-cloneable type.`
      );
    }
    return CloneUtil._cloneObjectByFields(source, preset, cloneMap, true);
  }

  /**
   * @internal
   */
  static _cloneValueByDefault(source: any, preset: any, cloneMap: Map<object, object>, deepCloneSubtree = false): any {
    if (typeof source === "function") {
      return deepCloneSubtree ? source : typeof preset === "function" ? preset : source;
    }
    if (source === null || typeof source !== "object") return source;

    switch (source[defaultCloneModeKey]) {
      case CloneMode.Ignore:
        return preset;
      case CloneMode.Assignment:
        return source;
      case CloneMode.Remap:
        return cloneMap.get(source) ?? source;
      case CloneMode.Copy:
        return CloneUtil._cloneCopyFromValue(source, preset, cloneMap);
      case CloneMode.Deep:
        return CloneUtil._cloneObjectByFields(source, preset, cloneMap, deepCloneSubtree);
    }

    if (ArrayBuffer.isView(source)) {
      return CloneUtil._deepCloneArrayBufferView(<ArrayBufferView>source, preset, cloneMap);
    }
    if (Array.isArray(source)) {
      return CloneUtil._cloneArray(source, preset, cloneMap, deepCloneSubtree);
    }
    if (source instanceof Map) {
      return CloneUtil._cloneMap(source, preset, cloneMap, deepCloneSubtree);
    }
    if (source instanceof Set) {
      return CloneUtil._cloneSet(source, preset, cloneMap, deepCloneSubtree);
    }
    if (CloneUtil._isPlainObject(source) || (deepCloneSubtree && CloneUtil._hasOrdinaryObjectTag(source))) {
      return CloneUtil._cloneObjectByFields(source, preset, cloneMap, deepCloneSubtree);
    }
    return source;
  }

  /**
   * @internal
   */
  private static _cloneCopyFromValue(source: any, preset: any, cloneMap: Map<object, object>): any {
    const existing = cloneMap.get(source);
    if (existing) return existing;
    const dst = CloneUtil._createCloneTarget(source, preset, cloneMap);
    dst.copyFrom(source);
    (<Partial<ICloneHook>>source)._onClone?.(dst, cloneMap);
    return dst;
  }

  /**
   * @internal
   */
  private static _cloneObjectByFields(
    source: any,
    preset: any,
    cloneMap: Map<object, object>,
    deepCloneSubtree = false
  ): any {
    const existing = cloneMap.get(source);
    if (existing) return existing;
    const dst = CloneUtil._createCloneTarget(source, preset, cloneMap);
    CloneUtil._cloneObjectFields(source, dst, cloneMap, deepCloneSubtree);
    (<Partial<ICloneHook>>source)._onClone?.(dst, cloneMap);
    return dst;
  }

  /**
   * @internal
   */
  static _createCloneTarget(source: any, preset: any, cloneMap: Map<object, object>): any {
    const proto = Object.getPrototypeOf(source);
    const reusable = preset && preset !== source && Object.getPrototypeOf(preset) === proto && preset;
    let dst: any;
    if (reusable) {
      dst = reusable;
    } else {
      const ctor = proto?.constructor;
      if (typeof ctor === "function") {
        try {
          dst = new ctor();
        } catch (error) {
          throw new Error(
            `CloneUtil: failed to bare-construct "${ctor.name}" — a type cloned deep must support ` +
              `argument-less construction (the gate creates preset-less instances bare, then populates fields). ` +
              `Cause: ${error}`,
            { cause: error }
          );
        }
      } else {
        dst = Object.create(proto);
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
  static _deepCloneArrayBufferView(
    source: ArrayBufferView,
    preset: any,
    cloneMap: Map<object, object>
  ): ArrayBufferView {
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
  static _cloneArray(source: any[], preset: any, cloneMap: Map<object, object>, deepCloneSubtree = false): any[] {
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
      dst[i] = CloneUtil._cloneValueByDefault(source[i], undefined, cloneMap, deepCloneSubtree);
    }
    return dst;
  }

  /**
   * @internal
   */
  static _cloneMap(
    source: Map<any, any>,
    preset: any,
    cloneMap: Map<object, object>,
    deepCloneSubtree = false
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
        CloneUtil._cloneValueByDefault(entry[0], undefined, cloneMap, deepCloneSubtree),
        CloneUtil._cloneValueByDefault(entry[1], undefined, cloneMap, deepCloneSubtree)
      );
    }
    return dst;
  }

  /**
   * @internal
   */
  static _cloneSet(source: Set<any>, preset: any, cloneMap: Map<object, object>, deepCloneSubtree = false): Set<any> {
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
    for (const v of source) {
      dst.add(CloneUtil._cloneValueByDefault(v, undefined, cloneMap, deepCloneSubtree));
    }
    return dst;
  }

  private static _isPlainObject(value: object): boolean {
    const proto = Object.getPrototypeOf(value);
    if (proto === null || proto === Object.prototype) return true;
    const ctor = Object.getPrototypeOf(proto) === null && proto.constructor;
    return typeof ctor === "function" && ctor.name === "Object";
  }

  private static _hasOrdinaryObjectTag(value: object): boolean {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  private static _getTypeName(value: object): string {
    return Object.getPrototypeOf(value)?.constructor?.name ?? "Object";
  }
}

const copyFromCloneTypes = [
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  Matrix3x3,
  Plane,
  Quaternion,
  Ray,
  Rect,
  SphericalHarmonics3,
  Vector2,
  Vector3,
  Vector4
];
for (let i = 0, n = copyFromCloneTypes.length; i < n; i++) {
  registerDefaultCloneMode(copyFromCloneTypes[i], CloneMode.Copy);
}
