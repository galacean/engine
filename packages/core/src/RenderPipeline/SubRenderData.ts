import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { IPoolElement } from "../utils/ObjectPool";

export class SubRenderData implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;

  set(component: Renderer, material: Material, primitive: Primitive, subPrimitive: SubMesh): void {
    this.component = component;
    this.material = material;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
  }

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;
  }
}
