import { Component } from "../Component";
import { CloneUtil } from "./CloneUtil";
import { fieldCloneModesKey } from "./CloneManager";
import type { ICloneHook } from "./ICloneHook";
import { CloneMode } from "./enums/CloneMode";

export class ComponentCloner {
  /**
   * Clone component (opt-out: all fields cloned except @ignoreClone), then run its `_onClone` hook.
   * @param source - Clone source
   * @param target - Clone target
   * @param cloneMap - Identity map of the cloned subtree (source object → clone)
   */
  static cloneComponent(source: Component, target: Component, cloneMap: Map<object, object>): void {
    const fieldModes = (<any>source)[fieldCloneModesKey];
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === CloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      const cloned = (target[k] = CloneUtil._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      CloneUtil._transferSlotOwnership(cloned, sourceValue, preset);
    }
    (<Partial<ICloneHook<Component>>>(source as unknown))._onClone?.(target, cloneMap);
  }
}
