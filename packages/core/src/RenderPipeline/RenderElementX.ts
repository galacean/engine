import { Renderer } from "../Renderer";
import { Primitive } from "../graphic/Primitive";
import { Material } from "../material/Material";
import { ShaderPass } from "../shader/ShaderPass";
import { IPoolElement } from "./IPoolElement";

export class RenderElementX implements IPoolElement {
  shaderPasses: ReadonlyArray<ShaderPass>;

  component: Renderer;
  material: Material;
  primitive: Primitive;

  dispose(): void {
    this.component = null;
    this.material = null;
    this.shaderPasses = null;
    this.primitive = null;
  }
}
