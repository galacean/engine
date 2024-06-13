import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, ShaderPass, StencilOperation } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { Chunk } from "./Chunk";
import { RenderData } from "./RenderData";

export class SubRenderElement implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;

  data: RenderData;
  shaderPasses: ReadonlyArray<ShaderPass>;
  stencilOperation: StencilOperation;

  texture?: Texture2D;
  chunk?: Chunk;
  shaderData?: ShaderData;

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
    this.texture = texture;
    this.chunk = chunk;
  }

  setShaderPasses(shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.shaderPasses = shaderPasses;
  }

  dispose(): void {
    this.data = null;
    this.shaderPasses = null;
  }
}
