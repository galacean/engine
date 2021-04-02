import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";

/**
 * Render element.
 */
export class RenderElement {
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
