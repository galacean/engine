import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { IPoolElement } from "../../utils/ObjectPool";
import { Pointer } from "./Pointer";

export class PointerEventData implements IPoolElement {
  target: Entity;
  currentTarget: Entity;
  pointer: Pointer;
  position: Vector3 = new Vector3();

  dispose() {
    this.pointer = this.target = this.currentTarget = null;
  }

  // 派发之后的逻辑
  protected _postDispatch() {}
  // 派发之前的逻辑
  protected _preDispatch() {}
  // 派发
  private _dispatch() {}
}
