import { Listener, Event } from "./Event";
import { EngineObject } from "./EngineObject";
import { Engine } from "../Engine";

/**
 * 事件派发管理，可作为基类继承
 * @class
 */
export class EventDispatcher extends EngineObject {
  private _listeners: { [k: string]: Listener[] };

  constructor(engine: Engine) {
    super(engine);
    this._listeners = {};
  }

  /**
   * 添加对指定事件的监听
   * @param {string} type
   * @param {function} listener
   */
  public addEventListener(type: string, listener: Listener): EventDispatcher {
    const listeners = this._listeners;

    if (listeners[type] === undefined) {
      listeners[type] = [];
    }

    if (listeners[type].indexOf(listener) === -1) {
      listeners[type].push(listener);
    }

    return this;
  }

  /**
   * 指定事件发生时，只回调一次
   * @param {string} type
   * @param {function} listener
   */
  public once(type: string, listener: Listener): EventDispatcher {
    listener.once = true;
    this.addEventListener(type, listener);

    return this;
  }

  /**
   * 移除对指定事件的监听
   * @param {string | number} type
   * @param {function} listener
   */
  public removeEventListener(type: string | number, listener: Listener): EventDispatcher {
    const listeners = this._listeners;

    if (arguments.length === 0) {
      this._listeners = {};
      return this;
    }

    if (arguments.length === 1) {
      listeners[type] = [];
      return this;
    }

    if (arguments.length === 2) {
      if (listeners[type]) {
        const index = listeners[type].indexOf(listener);
        listeners[type].splice(index, 1);
      }
      return this;
    }

    return this;
  }

  /**
   * 移除所有事件的监听
   * @param {string} type
   * @param {function} listener
   */
  public removeAllEventListeners(): void {
    this._listeners = {};
  }

  public hasEvent(type: string | number, listener?: Listener): boolean {
    const listeners = this._listeners;

    if (arguments.length === 1 && listeners[type] && listeners[type].length !== 0) {
      return true;
    }

    if (listeners[type] && listeners[type].indexOf(listener) !== -1) {
      return true;
    }

    return false;
  }

  /**
   * 触发事件
   * @param {Event} event
   */
  public trigger(event: Event): EventDispatcher {
    const listeners = this._listeners;
    const listenersArray = listeners[event.type];
    event.target = this;
    if (listenersArray) {
      // copy listeners into copied array
      const copiedListeners = listenersArray.slice();

      // then loop copied array instead of original listeners
      for (let i = 0, l = copiedListeners.length; i !== l; ++i) {
        const listener: Listener = copiedListeners[i];
        listener.call(this, event);

        if (listener.once) {
          // remove this listener once called
          this.removeEventListener(event.type, listener);
        }
      }
    }

    if (event.bubbles) {
      const parent = (this as any).parent;
      if (parent && !event.propagationStopped) {
        parent.trigger(event);
      }
    }

    return this;
  }
}

(EventDispatcher.prototype as any).on = EventDispatcher.prototype.addEventListener;
(EventDispatcher.prototype as any).off = EventDispatcher.prototype.removeEventListener;
