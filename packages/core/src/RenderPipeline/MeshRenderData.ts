import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderData } from "./RenderData";

/**
 * Render element.
 */
export class MeshRenderData extends RenderData {
  /** Mesh. */
  mesh: Mesh;
  /** Sub mesh. */
  subMesh: SubMesh;

  set(component: Renderer, material: Material, mesh: Mesh, subMesh: SubMesh): void {
    this.component = component;
    this.material = material;

    this.mesh = mesh;
    this.subMesh = subMesh;
  }
}
