import { Primitive } from "../graphic";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";

/**
 * Render element.
 */
export class RenderElement {
  private static _elementPoolIndex: number = 0;
  private static _elementPool: RenderElement[] = [];

  /**
   * Get render element from pool.
   * @remark The return value is only valid for the current frame, and the next frame will be automatically recycled for reuse.
   */
  static getFromPool(): RenderElement {
    const { _elementPoolIndex: index, _elementPool: pool } = RenderElement;
    RenderElement._elementPoolIndex++;
    if (pool.length === index) {
      const element = new RenderElement();
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
    RenderElement._elementPoolIndex = 0;
  }

  /** Render component. */
  component: Renderer;
  /** Primitive. */
  primitive: Primitive;
  /** Sub primitive. */
  subPrimitive: SubPrimitive;
  /** Material. */
  material: Material;

  setValue(component: Renderer, primitive: Primitive, subPrimitive: SubPrimitive, material: Material): void {
    this.component = component;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
    this.material = material;
  }
}
