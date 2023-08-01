/**
 * EventDispatcher, which can be inherited as a base class.
 */
export class EventDispatcher {
  private static _dispatchingListenersPool: EventData[][] = [];

  private _events: Record<string, EventData | EventData[]> = Object.create(null);
  private _eventCount: number = 0;

  /**
   * Determine whether there is event listening.
   * @param event - Event name
   * @returns Returns whether there is a corresponding event
   */
  hasEvent(event: string): boolean {
    return this._events[event] != null;
  }

  /**
   * Returns the names of all registered events.
   * @returns All event names
   */
  eventNames(): string[] {
    if (this._eventCount === 0) return [];
    return Object.keys(this._events);
  }

  /**
   * Returns the number of listeners with the specified event name.
   * @param event - Event name
   * @returns The count of listeners
   */
  listenerCount(event: string): number {
    const listeners = this._events[event];

    if (!listeners) return 0;
    if (Array.isArray(listeners)) return listeners.length;
    return 1;
  }

  /**
   * Dispatch the event with the specified event name.
   * @param event - Event name
   * @param data - Data
   * @returns - Whether the dispatching is successful
   */
  dispatch(event: string, data?: any): boolean {
    if (!this._events[event]) {
      return false;
    }

    const listeners = this._events[event];

    if (Array.isArray(listeners)) {
      const count = listeners.length;

      // cloning list to avoid structure breaking
      const { _dispatchingListenersPool: pool } = EventDispatcher;
      const dispatchingListeners = pool.length > 0 ? pool.pop() : [];
      dispatchingListeners.length = count;
      for (let i = 0; i < count; i++) {
        dispatchingListeners[i] = listeners[i];
      }

      for (let i = 0; i < count; i++) {
        const listener = dispatchingListeners[i];
        if (!listener.destroyed) {
          if (listener.once) this.off(event, listener.fn);
          listener.fn(data);
        }
      }

      // remove hooked function to avoid gc problem
      dispatchingListeners.length = 0;
      pool.push(dispatchingListeners);
    } else {
      if (listeners.once) this.off(event, listeners.fn);
      listeners.fn(data);
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
    return this._addEventListener(event, fn);
  }

  /**
   * Add a one-time listener.
   * @param event - Event name
   * @param fn - Function
   * @returns This
   */
  once(event: string, fn: Function): EventDispatcher {
    return this._addEventListener(event, fn, true);
  }

  /**
   * Remove the event listener(s) of the specified event name.
   * @param event - Event name
   * @param fn - Function, If is undefined, delete all corresponding event listeners.
   */
  off(event: string, fn?: Function): EventDispatcher {
    if (!this._events[event]) return this;
    if (!fn) {
      this._clearEvent(event);
      return this;
    }

    const listeners = this._events[event];
    const isArray = Array.isArray(listeners);
    if (!isArray && listeners.fn === fn) {
      this._clearEvent(event);
    } else if (isArray) {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i].fn === fn) {
          // mark as destroyed
          listeners[i].destroyed = true;
          listeners.splice(i, 1);
        }
      }
      if (listeners.length === 0) {
        this._clearEvent(event);
      } else if (listeners.length === 1) {
        this._events[event] = listeners[0];
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
      if (this._events[event]) this._clearEvent(event);
    } else {
      this._events = Object.create(null);
      this._eventCount = 0;
    }
  }

  private _addEventListener(event: string, fn: Function, once?: boolean): EventDispatcher {
    const listener = { fn, once };
    const events = this._events;
    const element = events[event];

    if (!element) {
      events[event] = listener;
      this._eventCount++;
    } else if (Array.isArray(element)) {
      element.push(listener);
    } else {
      events[event] = [element, listener];
    }
    return this;
  }

  private _clearEvent(event: string) {
    if (--this._eventCount === 0) {
      this._events = Object.create(null);
    } else {
      delete this._events[event];
    }
  }
}

interface EventData {
  fn: Function;
  once?: boolean;
  destroyed?: boolean;
}
