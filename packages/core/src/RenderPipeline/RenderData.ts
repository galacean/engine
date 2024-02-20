import { SubMesh } from "../graphic";
import { Primitive } from "../graphic/Primitive";
import { Material } from "../material";
import { Renderer } from "../Renderer";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { IPoolElement } from "./IPoolElement";

export class RenderData implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;
  usage: RenderDataUsage = RenderDataUsage.Mesh;

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
