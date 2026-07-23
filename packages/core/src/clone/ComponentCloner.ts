import { Component } from "../Component";
import { CloneUtil } from "./CloneUtil";
import { FieldCloneMode, fieldCloneModesKey } from "./CloneDecorators";
import type { ICloneHook } from "./ICloneHook";

/**
 * @internal
 * Clones component fields and runs the component's post-clone hook.
 */
export class ComponentCloner {
  /**
   * @internal
   */
  static cloneComponent(source: Component, target: Component, cloneMap: Map<object, object>): void {
    const fieldModes = (<any>source)[fieldCloneModesKey];
    const keys = Object.keys(source);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const fieldMode = fieldModes?.[k];
      if (fieldMode === FieldCloneMode.Ignore) continue;
      const sourceValue = source[k];
      const preset = target[k];
      const cloned = (target[k] = CloneUtil._cloneValue(sourceValue, preset, cloneMap, fieldMode));
      CloneUtil._transferSlotOwnership(cloned, sourceValue, preset);
    }
    (<Partial<ICloneHook<Component>>>(source as unknown))._onClone?.(target, cloneMap);
  }
}
