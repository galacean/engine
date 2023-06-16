import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { ShaderPass } from "../shader/ShaderPass";
import { RenderState } from "../shader/state/RenderState";
import { IPoolElement } from "./IPoolElement";
import { RenderElement } from "./RenderElement";

/**
 * Render element.
 */
export class MeshRenderElement extends RenderElement implements IPoolElement {
  /** Mesh. */
  mesh: Mesh;
  /** Sub mesh. */
  subMesh: SubMesh;

  setValue(
    component: Renderer,
    mesh: Mesh,
    subMesh: SubMesh,
    material: Material,
    renderState: RenderState,
    shaderPass: ShaderPass
  ): void {
    this.component = component;
    this.mesh = mesh;
    this.subMesh = subMesh;
    this.material = material;
    this.renderState = renderState;
    this.shaderPass = shaderPass;
  }

  dispose() {
    this.component = this.mesh = this.subMesh = this.material = this.renderState = this.shaderPass = null;
  }
}
