import { EngineObject } from "./EngineObject";
import { Event } from "./Event";
import { ignoreClone } from "../clone/CloneManager";

/**
 * EventDispatcher, which can be inherited as a base class.
 */
export class EventDispatcher extends EngineObject {
  @ignoreClone
  private _evts = Object.create(null);
  private _evtCount = 0;

  /**
   * Determine whether there is event listening.
   * @param event - Event name
   * @returns Returns whether there is a corresponding event
   */
  hasEvent(event: string): boolean {
    return this._evts[event] != null;
  }

  /**
   * Returns the names of all registered events.
   * @returns All event names
   */
  eventNames(): string[] {
    if (this._evtCount === 0) return [];
    return Object.keys(this._evts);
  }

  /**
   * Returns the number of listeners with the specified event name.
   * @param event - Event name
   * @returns The count of listeners
   */
  listenerCount(event: string): number {
    const listeners = this._evts[event];

    if (!listeners) return 0;
    if (listeners.fn) return 1;
    return listeners.length;
  }

  /**
   * Dispatch the event with the specified event name.
   * @param event - Event name
   * @param data - Data
   * @returns - Whether the dispatching is successful
   */
  dispatch(event: string, data?: any): boolean {
    if (!this._evts[event]) {
      return false;
    }

    const listeners = this._evts[event];

    if (listeners.fn) {
      if (listeners.once) this.removeEventListener(event, listeners.fn);
      listeners.fn(data);
    } else {
      const l = listeners.length;
      for (let i = 0; i < l; i++) {
        if (listeners[i].once) this.removeEventListener(event, listeners[i].fn);
        listeners[i].fn(data);
      }
    }
    return true;
  }

  /**
   * Add a listener/
   * @param event - Event name
   * @param fn - Function
   * @returns This
   */
  on(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn);
  }

  /**
   * Add a one-time listener.
   * @param event - Event name
   * @param fn - Function
   * @returns This
   */
  once(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn, true);
  }

  /**
   * @deprecated Use `on/once` instead.
   * Add a listener function with the specified event name.
   * @param event - Event name
   * @param fn - Function
   * @param once - Is it a one-time listener
   * @returns this
   */
  addEventListener(event: string, fn: Function, once?: boolean): EventDispatcher {
    const listener = { fn, once };
    const events = this._evts;
    if (!events[event]) {
      events[event] = listener;
      this._evtCount++;
    } else if (!events[event].fn) {
      events[event].push(listener);
    } else {
      events[event] = [events[event], listener];
    }
    return this;
  }

  /**
   * Remove the event listener(s) of the specified event name.
   * @param event - Event name
   * @param fn - Function, If is undefined, delete all corresponding event listeners.
   */
  off(event: string, fn?: Function): EventDispatcher {
    if (!this._evts[event]) return this;
    if (!fn) {
      this._clearEvent(event);
      return this;
    }

    const listeners = this._evts[event];

    if (listeners.fn && listeners.fn === fn) {
      this._clearEvent(event);
    } else {
      const index = listeners.indexOf(fn);
      if (index > -1) {
        const temp = listeners[listeners.length - 1];
        listeners[index] = temp;
        listeners.length--;
        if (listeners.length === 1) {
          this._evts[event] = listeners[0];
        }
      }
    }
    return this;
  }

  /**
   * @deprecated Use `off` instead.
   * Remove the event listener(s) of the specified event name.
   * @param event - Event name
   * @param fn - Function, If is undefined, delete all corresponding event listeners.
   */
  removeEventListener(event: string, fn?: Function): EventDispatcher {
    return this.off(event, fn);
  }

  /**
   * Remove all event listeners.
   * @param event - Event name, delete all events if not passed
   */
  removeAllEventListeners(event?: string): void {
    if (event) {
      if (this._evts[event]) this._clearEvent(event);
    } else {
      this._evts = Object.create(null);
      this._evtCount = 0;
    }
  }

  /**
   * @deprecated Use `dispatch` instead.
   */
  trigger(e: Event) {
    this.dispatch(e.type as string, e.data);
  }

  private _clearEvent(event: string) {
    if (--this._evtCount === 0) {
      this._evts = Object.create(null);
    } else {
      delete this._evts[event];
    }
  }
}
