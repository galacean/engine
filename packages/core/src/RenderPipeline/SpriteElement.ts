import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Material } from "../material";
import { Renderer } from "../Renderer";

export class SpriteElement {
  private static _elementPoolIndex: number = 0;
  private static _elementPool: SpriteElement[] = [];

  /**
   * Get sprite element from pool.
   * @remark The return value is only valid for the current frame, and the next frame will be automatically recycled for reuse.
   */
  static getFromPool(): SpriteElement {
    const { _elementPoolIndex: index, _elementPool: pool } = SpriteElement;
    SpriteElement._elementPoolIndex++;
    if (pool.length === index) {
      const element = new SpriteElement();
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
    SpriteElement._elementPoolIndex = 0;
  }

  component: Renderer;
  positions: Vector3[];
  uv: Vector2[];
  triangles: number[];
  color: Color;
  material: Material;
  camera: Camera;

  setValue(
    component: Renderer,
    positions: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    material: Material,
    camera: Camera
  ): void {
    this.component = component;
    this.positions = positions;
    this.uv = uv;
    this.triangles = triangles;
    this.color = color;
    this.material = material;
    this.camera = camera;
  }
}
