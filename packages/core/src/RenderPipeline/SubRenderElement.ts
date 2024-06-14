import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, ShaderPass, StencilOperation } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";
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
  chunk?: SubPrimitiveChunk;
  shaderData?: ShaderData;

  set(
    data: RenderData,
    component: Renderer,
    material: Material,
    primitive: Primitive,
    subPrimitive: SubMesh,
    texture?: Texture2D,
    chunk?: SubPrimitiveChunk
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
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;

    this.data = null;
    this.shaderPasses = null;

    this.texture && (this.texture = null);
    this.chunk && (this.chunk = null);
    this.shaderData && (this.shaderData = null);
  }
}
