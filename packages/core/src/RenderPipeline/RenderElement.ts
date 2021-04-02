import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
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
  /** Mesh. */
  mesh: Mesh;
  /** Sub mesh. */
  subMesh: SubMesh;
  /** Material. */
  material: Material;

  setValue(component: Renderer, mesh: Mesh, subMesh: SubMesh, material: Material): void {
    this.component = component;
    this.mesh = mesh;
    this.subMesh = subMesh;
    this.material = material;
  }
}
