import { Vector2, Vector3 } from "@galacean/engine-math";
import { IPoolElement } from "../../utils/ObjectPool";
import { PointerButton } from "../enums/PointerButton";
import { IEventHandler } from "./IEventHander";
import { Pointer } from "./Pointer";

export class PointerEventData implements IPoolElement {
  // isPropagationStopped
  pointer: Pointer;
  // 屏幕坐标
  position: Vector2 = new Vector2();
  // 命中的目标
  target: IEventHandler;
  // 当前的目标
  currentTarget: IEventHandler;
  // 触发此案件的按钮
  button: PointerButton;

  // 屏幕空间下的坐标
  screenPosition: Vector2 = new Vector2();
  // 世界空间下的坐标
  worldPosition: Vector3 = new Vector3();
  // 局部空间下的坐标
  localPosition: Vector3 = new Vector3();

  dispose() {}

  // 派发之后的逻辑
  protected _postDispatch() {}
  // 派发之前的逻辑
  protected _preDispatch() {}
  // 派发
  private _dispatch() {}
}
