import { Component } from "./Component";
import { Entity } from "./Entity";
import { CloneUtils } from "./clone/CloneUtils";
import { defaultCloneMode, ignoreClone } from "./clone/CloneManager";
import { CloneMode } from "./clone/enums/CloneMode";
import { SafeLoopArray } from "./utils/SafeLoopArray";

/**
 * Signal is a typed event mechanism for Galacean Engine.
 * @typeParam T - Tuple type of the signal arguments
 */
@defaultCloneMode(CloneMode.Deep)
export class Signal<T extends any[] = []> {
  @ignoreClone
  private _listeners: SafeLoopArray<ISignalListener<T>> = new SafeLoopArray<ISignalListener<T>>();

  /**
   * Add a listener for this signal.
   * @param fn - The callback function
   * @param target - The `this` context for the callback
   */
  on(fn: (...args: T) => void, target?: any): void;
  /**
   * Add a structured binding listener. Structured bindings support clone remapping.
   * @param target - The target component
   * @param methodName - The method name to invoke on the target
   * @param args - Pre-resolved arguments
   */
  on(target: Component, methodName: string, ...args: any[]): void;
  on(fnOrTarget: ((...args: T) => void) | Component, targetOrMethodName?: any, ...args: any[]): void {
    this._addListener(fnOrTarget, targetOrMethodName, false, ...args);
  }

  /**
   * Add a one-time listener that is automatically removed after first invocation.
   * @param fn - The callback function
   * @param target - The `this` context for the callback
   */
  once(fn: (...args: T) => void, target?: any): void;
  /**
   * Add a one-time structured binding listener.
   * @param target - The target component
   * @param methodName - The method name to invoke on the target
   * @param args - Pre-resolved arguments
   */
  once(target: Component, methodName: string, ...args: any[]): void;
  once(fnOrTarget: ((...args: T) => void) | Component, targetOrMethodName?: any, ...args: any[]): void {
    this._addListener(fnOrTarget, targetOrMethodName, true, ...args);
  }

  /**
   * Remove a listener. Both `fn` and `target` must match the values passed to `on`/`once`.
   * @param fn - The callback function to remove
   * @param target - The `this` context that was used when adding the listener
   */
  off(fn: (...args: T) => void, target?: any): void;
  /**
   * Remove a structured binding listener by target and method name.
   * @param target - The target component
   * @param methodName - The method name
   */
  off(target: Component, methodName: string): void;
  off(fnOrTarget: ((...args: T) => void) | Component, targetOrMethodName?: any): void {
    if (typeof fnOrTarget === "function") {
      const target = targetOrMethodName ?? null;
      this._listeners.findAndRemove((listener) => {
        if (listener.fn === fnOrTarget && listener.target === target) {
          listener.destroyed = true;
          return true;
        }
        return false;
      });
    } else {
      const target = fnOrTarget;
      const methodName = targetOrMethodName as string;
      this._listeners.findAndRemove((listener) => {
        if (listener.target === target && listener.methodName === methodName) {
          listener.destroyed = true;
          return true;
        }
        return false;
      });
    }
  }

  /**
   * Remove all listeners, or all listeners for a specific target.
   * @param target - If provided, only remove listeners bound to this target
   */
  removeAll(target?: any): void {
    if (target !== undefined) {
      this._listeners.findAndRemove((listener) => {
        if (listener.target === target) {
          return (listener.destroyed = true);
        }
        return false;
      });
    } else {
      this._listeners.findAndRemove((listener) => (listener.destroyed = true));
    }
  }

  /**
   * Invoke the signal, calling all listeners in order.
   * @param args - Arguments to pass to each listener
   */
  invoke(...args: T): void {
    const listeners = this._listeners.getLoopArray();
    for (let i = 0, n = listeners.length; i < n; i++) {
      const listener = listeners[i];
      if (listener.destroyed) continue;
      if (listener.methodName && listener.target.destroyed) {
        listener.destroyed = true;
        this._listeners.findAndRemove((l) => l === listener);
        continue;
      }
      listener.fn.apply(listener.target, args);
      if (listener.once) {
        listener.destroyed = true;
        this._listeners.findAndRemove((l) => l === listener);
      }
    }
  }

  /**
   * @internal
   * Clone listeners to target signal, remapping entity/component references.
   */
  _cloneTo(target: Signal<T>, srcRoot: Entity, targetRoot: Entity): void {
    const listeners = this._listeners.getLoopArray();
    for (let i = 0, n = listeners.length; i < n; i++) {
      const listener = listeners[i];
      if (listener.destroyed || !listener.methodName) continue;
      const clonedTarget = CloneUtils.remapComponent(srcRoot, targetRoot, listener.target);
      if (clonedTarget) {
        const clonedArgs = this._cloneArguments(listener.arguments, srcRoot, targetRoot);
        if (listener.once) {
          target.once(clonedTarget, listener.methodName, ...clonedArgs);
        } else {
          target.on(clonedTarget, listener.methodName, ...clonedArgs);
        }
      }
    }
  }

  private _cloneArguments(args: any[], srcRoot: Entity, targetRoot: Entity): any[] {
    if (!args || args.length === 0) return [];
    const len = args.length;
    const clonedArgs = new Array(len);
    for (let i = 0; i < len; i++) {
      const arg = args[i];
      if (arg instanceof Entity) {
        clonedArgs[i] = CloneUtils.remapEntity(srcRoot, targetRoot, arg);
      } else if (arg instanceof Component) {
        clonedArgs[i] = CloneUtils.remapComponent(srcRoot, targetRoot, arg);
      } else {
        clonedArgs[i] = arg;
      }
    }
    return clonedArgs;
  }

  private _addListener(
    fnOrTarget: ((...args: T) => void) | Component,
    targetOrMethodName: any,
    once: boolean,
    ...args: any[]
  ): void {
    if (typeof fnOrTarget === "function") {
      this._listeners.push({ fn: fnOrTarget, target: targetOrMethodName ?? null, once });
    } else {
      const target = fnOrTarget;
      const methodName = targetOrMethodName as string;
      const fn =
        args.length > 0
          ? (...signalArgs: any[]) => (target as any)[methodName](...args, ...signalArgs)
          : (...signalArgs: any[]) => (target as any)[methodName](...signalArgs);
      this._listeners.push({
        fn: fn as (...args: T) => void,
        target,
        once,
        methodName,
        arguments: args
      });
    }
  }
}

interface ISignalListener<T extends any[]> {
  fn: (...args: T) => void;
  target: any;
  once: boolean;
  destroyed?: boolean;
  methodName?: string;
  arguments?: any[];
}
