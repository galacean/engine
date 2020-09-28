import { Primitive } from "../graphic";
import { PrimitiveGroup } from "../graphic/PrimitiveGroup";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";

/**
 * 渲染元素。
 */
export class RenderElement {
  private static _elementPoolIndex: number = 0;
  private static _elementPool: RenderElement[] = [];

  /**
   * 从池中获取渲染元素。
   * @remark 返回值当帧有效，下一帧会自动回收再利用。
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

  /** 可渲染组件。 */
  component: RenderableComponent;
  /** 图元。 */
  primitive: Primitive;
  /** 图元组。 */
  group: PrimitiveGroup;
  /** 材质。 */
  material: Material;

  setValue(component: RenderableComponent, primitive: Primitive, group: PrimitiveGroup, material: Material): void {
    this.component = component;
    this.primitive = primitive;
    this.group = group;
    this.material = material;
  }
}
