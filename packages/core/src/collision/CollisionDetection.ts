import { Vector3 } from "@oasis-engine/math";
import { Event } from "../base/Event";
import { EventDispatcher } from "../base/EventDispatcher";
import { ignoreClone } from "../clone/CloneManager";
import { ACollider } from "../collider";
import { ABoxCollider } from "../collider/ABoxCollider";
import { ASphereCollider } from "../collider/ASphereCollider";
import { ColliderFeature } from "../collider/ColliderFeature";
import { Script } from "../Script";
import { intersectBox2Box, intersectSphere2Box, intersectSphere2Sphere } from "./intersect";

/**
 * 检测当前 Entity 上的 Collider 与场景中其他 Collider 的碰撞
 * 发出事件：collision
 */
export class CollisionDetection extends Script {
  private static _tempVec3: Vector3 = new Vector3();

  private _colliderManager;
  private _myCollider;
  private _overlopCollider;
  private _sphere;
  private _box;

  /**
   * 构造函数
   * @param {Entity} entity 对象所在节点
   */
  constructor(entity) {
    super(entity);

    this._colliderManager = null;
    this._myCollider = null;
    this._overlopCollider = null;

    // this.addEventListener("start", this._onStart);
  }

  /**
   * 和当前 Entity 上的 Collider 相交的 Collider 对象
   */
  get overlopCollider() {
    return this._overlopCollider;
  }

  /**
   * 每帧更新时，计算与其他 collider 的碰撞
   */
  onUpdate(deltaTime) {
    super.onUpdate(deltaTime);

    let overlopCollider = null;

    if (this._colliderManager && this._myCollider) {
      const colliders = this._colliderManager.colliders;

      if (this._myCollider instanceof ABoxCollider) {
        this._box = this._getWorldBox(this._myCollider);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._boxCollision(collider)) {
            overlopCollider = collider;
            this.dispatch("collision", { collider });
          }
        } // end of for
      } else if (this._myCollider instanceof ASphereCollider) {
        this._sphere = this._getWorldSphere(this._myCollider);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._sphereCollision(collider)) {
            overlopCollider = collider;
            this.dispatch("collision", { collider });
          }
        } // end of for
      }
    } // end of if

    //-- overlop events
    if (overlopCollider != null && this._overlopCollider != overlopCollider) {
      this.dispatch("begin_overlop", { collider: overlopCollider });
    }

    if (this._overlopCollider != null && this._overlopCollider != overlopCollider) {
      const e = this._overlopCollider;
      this.dispatch("end_overlop", { collider: e });
    }

    this._overlopCollider = overlopCollider;
  }

  /**
   * 获得世界空间中的 Box 坐标
   * @param boxCollider
   */
  _getWorldBox(boxCollider) {
    const mat = boxCollider.entity.transform.worldMatrix;
    const max: Vector3 = new Vector3();
    const min: Vector3 = new Vector3();
    Vector3.transformCoordinate(boxCollider.boxMax, mat, max);
    Vector3.transformCoordinate(boxCollider.boxMin, mat, min);

    //--
    const temp: Vector3 = CollisionDetection._tempVec3;
    const corners = boxCollider.getCorners();
    for (let i = 0; i < 8; i++) {
      Vector3.transformCoordinate(corners[i], mat, temp);
      if (temp.x > max.x) max.x = temp.x;
      if (temp.y > max.y) max.y = temp.y;
      if (temp.z > max.z) max.z = temp.z;
      if (temp.x < min.x) min.x = temp.x;
      if (temp.y < min.y) min.y = temp.y;
      if (temp.z < min.z) min.z = temp.z;
    }

    return {
      min,
      max
    };
  }

  /**
   * 获得世界空间中的 Sphere 坐标
   * @param {SphereCollider} sphereCollider
   */
  _getWorldSphere(sphereCollider) {
    const center: Vector3 = new Vector3();
    Vector3.transformCoordinate(sphereCollider.center, sphereCollider.entity.transform.worldMatrix, center);
    return {
      radius: sphereCollider.radius,
      center
    };
  }

  /**
   * 自身的 Collider 与另一个 Collider 做碰撞检测
   * @param {ABoxCollider|ASphereCollider} other
   */
  _boxCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = this._getWorldBox(other);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Box(sphere, this._box);
    }
    return false;
  }

  /**
   * 自身的 Collider 与另一个 Collider 做碰撞检测
   * @param {ABoxCollider|ASphereCollider} other
   */
  _sphereCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = this._getWorldBox(other);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }

  /**
   * 在 start 事件时，查找其他组件并记录下来
   */
  onAwake() {
    this._colliderManager = this.scene.findFeature(ColliderFeature);
    this._myCollider = this.entity.getComponent(ACollider);
  }

  //----------------------------
  @ignoreClone
  private _evts = Object.create(null);
  private _evtCount = 0;

  /**
   * 判断是否有事件监听。
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
   * 添加监听函数。
   * @param event 事件名
   * @param fn 函数
   * @returns this
   */
  on(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn);
  }

  /**
   * 添加一次性的监听函数。
   * @param event 事件名
   * @param fn 函数
   * @returns this
   */
  once(event: string, fn: Function): EventDispatcher {
    return this.addEventListener(event, fn, true);
  }

  /**
   * @deprecated 使用 on/once 替换
   * 添加指定事件名的监听函数。
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
    return <any>this;
  }

  off(event: string, fn?: Function): EventDispatcher {
    if (!this._evts[event]) return <any>this;
    if (!fn) {
      this._clearEvent(event);
      return <any>this;
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
    return <any>this;
  }

  /**
   * @deprecated 使用
   * 移除指定事件名的事件监听。
   * @param event - 事件名
   * @param fn - 函数，若不传则删除所有对应的事件监听
   */
  removeEventListener(event: string, fn?: Function): EventDispatcher {
    return this.off(event, fn);
  }

  /**
   * 移除所有的事件监听。
   * @param event - 事件名，若不传则删除所有事件
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
   * @deprecated 使用 dispatch 替换
   * @param - 事件
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
