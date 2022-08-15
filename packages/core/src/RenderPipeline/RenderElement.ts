import { Mesh } from "../graphic/Mesh";
import { SubMesh } from "../graphic/SubMesh";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { ShaderPass } from "../shader";
import { RenderState } from "../shader/state/RenderState";

/**
 * @internal
 */
export class RenderElement {
  component: Renderer;
  mesh: Mesh;
  subMesh: SubMesh;
  material: Material;
  renderState: RenderState;
  shaderPass: ShaderPass;

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
}
