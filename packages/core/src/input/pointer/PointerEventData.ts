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
}
