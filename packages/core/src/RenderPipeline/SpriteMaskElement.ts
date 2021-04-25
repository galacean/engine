import { Vector2, Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Material } from "../material";

export class SpriteMaskElement {
  private static _elementPoolIndex: number = 0;
  private static _elementPool: SpriteMaskElement[] = [];

  /**
   * Get sprite element from pool.
   * @remark The return value is only valid for the current frame, and the next frame will be automatically recycled for reuse.
   */
  static getFromPool(): SpriteMaskElement {
    const { _elementPoolIndex: index, _elementPool: pool } = SpriteMaskElement;
    SpriteMaskElement._elementPoolIndex++;
    if (pool.length === index) {
      const element = new SpriteMaskElement();
      pool.push(element);
      return element;
    } else {
      return pool[index];
    }
  }

  /**
   * @internal
   */
  static _restPool() {
    SpriteMaskElement._elementPoolIndex = 0;
  }

  component: Component;
  positions: Vector3[];
  uv: Vector2[];
  triangles: number[];
  material: Material;
  isAdd: boolean = true;

  setValue(
    component: Component,
    positions: Vector3[],
    uv: Vector2[],
    triangles: number[],
    material: Material,
  ): void {
    this.component = component;
    this.positions = positions;
    this.uv = uv;
    this.triangles = triangles;
    this.material = material;
  }
}
