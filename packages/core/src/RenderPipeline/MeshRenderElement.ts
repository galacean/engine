import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderElement } from "./RenderElement";

/**
 * Render element.
 */
export class MeshRenderElement extends RenderElement {
  /** Mesh. */
  mesh: Mesh;
  /** Sub mesh. */
  subMesh: SubMesh;

  setValue(component: Renderer, mesh: Mesh, subMesh: SubMesh, material: Material): void {
    this.component = component;
    this.mesh = mesh;
    this.subMesh = subMesh;
    this.material = material;
  }
}
