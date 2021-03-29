import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";

/**
 * Render element.
 */
export class RenderElement {
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
