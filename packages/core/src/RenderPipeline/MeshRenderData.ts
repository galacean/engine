import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";

/**
 * Render element.
 */
export class MeshRenderData extends RenderData implements IPoolElement {
  /** Mesh. */
  mesh: Mesh;
  /** Sub mesh. */
  subMesh: SubMesh;

  constructor() {
    super();
    this.usage = RenderDataUsage.Mesh;
  }

  set(component: Renderer, material: Material, mesh: Mesh, subMesh: SubMesh): void {
    this.component = component;
    this.material = material;

    this.mesh = mesh;
    this.subMesh = subMesh;
  }

  dispose(): void {
    this.component = this.material = this.mesh = this.subMesh = null;
  }
}
