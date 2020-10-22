import { EngineObject } from "./EngineObject";
import { Event } from "./Event";
import { ignoreClone } from "../clone/CloneManager";

/**
 * 事件派发管理，可作为基类继承
 * @class
 */
export class EventDispatcher extends EngineObject {
  @ignoreClone
  private _evts = Object.create(null);
  private _evtCount = 0;

  /**
   * 判断是否有事件监听
   * @param event 事件名
   * @returns 返回是否有对应事件
   */
  hasEvent(event: string): boolean {
    return this._evts[event] != null;
  }

  /**
   * 返回注册的所有事件名。
   * @returns 所有的事件名
   */
  eventNames(): string[] {
    if (this._evtCount === 0) return [];

    return Object.keys(this._evts);
  }

  /**
   * 返回指定事件名的监听函数的数量。
   * @param event 事件名
   * @returns 监听函数的数量
   */
  listenerCount(event: string): number {
    const listeners = this._evts[event];

    if (!listeners) return 0;
    if (listeners.fn) return 1;
    return listeners.length;
  }

  /**
   * 派发指定事件名的事件。
   * @param event 事件名
   * @param data 数据
   * @returns 派发事件是否成功
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
   * 添加监听函数
   * @param event 事件名
   * @param fn 函数
   * @returns this
   */
  on(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn);
  }

  /**
   * 添加一次性的监听函数
   * @param event 事件名
   * @param fn 函数
   * @returns this
   */
  once(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn, true);
  }

  /**
   * 添加指定事件名的监听函数。
   * @deprecated 使用 on/once 替换
   * @param event 事件名
   * @param fn 函数
   * @param once 是否是一次性监听
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
   * 移除指定事件名的事件监听。
   * @param event 事件名
   * @param fn 函数，若不传则删除所有对应的事件监听
   */
  removeEventListener(event: string, fn?: Function): EventDispatcher {
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
   * 移除所有的事件监听。
   * @param event 事件名，若不传则删除所有事件
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
   * @deprecated
   * @param 事件
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
