import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderProperty } from "../shader";
import { IPoolElement } from "../utils/ObjectPool";

interface ShaderDataInfo {
  applyFunc: (property: ShaderProperty, value: any) => void;
  property: ShaderProperty;
  value: any;
}
export class SubRenderData implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;
  shaderDataInfos = Array<ShaderDataInfo>();

  set(component: Renderer, material: Material, primitive: Primitive, subPrimitive: SubMesh): void {
    this.component = component;
    this.material = material;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
    this.shaderDataInfos.length = 0;
  }

  addShaderDataInfo(shaderDataInfo: ShaderDataInfo): void {
    this.shaderDataInfos.push(shaderDataInfo);
  }

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;
  }
}
