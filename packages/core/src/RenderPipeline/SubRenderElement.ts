import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderPass, ShaderProperty, StencilOperation } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { Chunk } from "./Chunk";
import { RenderData } from "./RenderData";

interface ShaderDataInfo {
  applyFunc: (property: ShaderProperty, value: any) => void;
  property: ShaderProperty;
  value: any;
}

export class SubRenderElement implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;
  shaderDataInfos = Array<ShaderDataInfo>();

  data: RenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;
  stencilOperation: StencilOperation;

  texture: Texture2D;
  chunk: Chunk;

  set(
    data: RenderData,
    component: Renderer,
    material: Material,
    primitive: Primitive,
    subPrimitive: SubMesh,
    texture?: Texture2D,
    chunk?: Chunk
  ): void {
    this.data = data;
    this.component = component;
    this.material = material;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
    this.shaderDataInfos.length = 0;
    this.texture = texture;
    this.chunk = chunk;
  }

  setShaderPasses(shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.shaderPasses = shaderPasses;
  }

  addShaderDataInfo(shaderDataInfo: ShaderDataInfo): void {
    this.shaderDataInfos.push(shaderDataInfo);
  }

  dispose(): void {
    this.data = null;
    this.shaderPasses = null;
  }

  updateShaderData(): void {
    const shaderDataInfos = this.shaderDataInfos;
    for (let i = 0, n = shaderDataInfos.length; i < n; ++i) {
      const shaderDataInfo = shaderDataInfos[i];
      shaderDataInfo.applyFunc(shaderDataInfo.property, shaderDataInfo.value);
    }
  }
}
