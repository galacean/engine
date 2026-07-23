import { DataObject } from "./base/DataObject";
import { ignoreClone } from "./clone/CloneManager";
import type { ICloneHook } from "./clone/ICloneHook";
import { Component } from "./Component";
import { Entity } from "./Entity";
import { SafeLoopArray } from "./utils/SafeLoopArray";

/**
 * Signal is a typed event mechanism for Galacean Engine.
 * @typeParam T - Tuple type of the signal arguments
 */
export class Signal<T extends any[] = []> extends DataObject implements ICloneHook<Signal<T>> {
  // Rebuilt by `_onClone`; must survive even a propagated @deepClone.
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
   * The target method will be invoked as `method(...signalArgs, ...args)` —
   * runtime signal arguments come first, bound arguments are appended.
   * @param target - The target component
   * @param methodName - The method name to invoke on the target
   * @param args - Pre-resolved arguments appended after the runtime signal arguments
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
   * The target method will be invoked as `method(...signalArgs, ...args)` —
   * runtime signal arguments come first, bound arguments are appended.
   * @param target - The target component
   * @param methodName - The method name to invoke on the target
   * @param args - Pre-resolved arguments appended after the runtime signal arguments
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
   * @inheritdoc
   */
  _onClone(target: Signal<T>, cloneMap: ReadonlyMap<object, object>): void {
    const listeners = this._listeners.getLoopArray();
    for (let i = 0, n = listeners.length; i < n; i++) {
      const listener = listeners[i];
      if (listener.destroyed || !listener.methodName) continue;
      const clonedTarget = <Component>(cloneMap.get(listener.target) ?? listener.target);
      const clonedArgs = this._cloneArguments(listener.arguments, cloneMap);
      if (listener.once) {
        target.once(clonedTarget, listener.methodName, ...clonedArgs);
      } else {
        target.on(clonedTarget, listener.methodName, ...clonedArgs);
      }
    }
  }

  private _cloneArguments(args: any[], cloneMap: ReadonlyMap<object, object>): any[] {
    if (!args || args.length === 0) return [];
    const len = args.length;
    const clonedArgs = new Array(len);
    for (let i = 0; i < len; i++) {
      const arg = args[i];
      if (arg instanceof Entity || arg instanceof Component) {
        clonedArgs[i] = cloneMap.get(arg) ?? arg;
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
          ? (...signalArgs: any[]) => (target as any)[methodName](...signalArgs, ...args)
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
