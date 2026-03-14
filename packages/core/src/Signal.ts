import { SafeLoopArray } from "./utils/SafeLoopArray";
import { ignoreClone } from "./clone/CloneManager";

/**
 * Signal is a typed event mechanism for Galacean Engine.
 * @typeParam T - Tuple type of the signal arguments
 */
export class Signal<T extends any[] = []> {
  @ignoreClone
  private _listeners: SafeLoopArray<ISignalListener<T>> = new SafeLoopArray<ISignalListener<T>>();

  /**
   * Add a listener for this signal.
   * @param fn - The callback function
   * @param context - The `this` context for the callback
   */
  on(fn: (...args: T) => void, context?: any): void {
    this._listeners.push({ fn, context: context ?? null, once: false });
  }

  /**
   * Add a one-time listener that is automatically removed after first invocation.
   * @param fn - The callback function
   * @param context - The `this` context for the callback
   */
  once(fn: (...args: T) => void, context?: any): void {
    this._listeners.push({ fn, context: context ?? null, once: true });
  }

  /**
   * Remove a listener. Both `fn` and `context` must match the values passed to `on`/`once`.
   * @param fn - The callback function to remove
   * @param context - The `this` context that was used when adding the listener
   */
  off(fn: (...args: T) => void, context?: any): void {
    const ctx = context ?? null;
    this._listeners.findAndRemove((listener) => listener.fn === fn && listener.context === ctx);
  }

  /**
   * Remove all listeners.
   */
  removeAll(): void {
    this._listeners.findAndRemove(() => true);
  }

  /**
   * Invoke the signal, calling all listeners in order.
   * @param args - Arguments to pass to each listener
   */
  invoke(...args: T): void {
    const listeners = this._listeners.getLoopArray();
    for (let i = 0, n = listeners.length; i < n; i++) {
      const listener = listeners[i];
      if (!listener.destroyed) {
        listener.fn.apply(listener.context, args);
        if (listener.once) {
          listener.destroyed = true;
          this._listeners.findAndRemove((l) => l === listener);
        }
      }
    }
  }

  /**
   * Whether this signal has any listeners.
   */
  get hasListeners(): boolean {
    return this._listeners.length > 0;
  }
}

interface ISignalListener<T extends any[]> {
  fn: (...args: T) => void;
  context: any;
  once: boolean;
  destroyed?: boolean;
}
