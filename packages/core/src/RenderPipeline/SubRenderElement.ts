import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, ShaderPass, StencilOperation } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

export class SubRenderElement implements IPoolElement {
  component: Renderer;
  material: Material;
  primitive: Primitive;
  subPrimitive: SubMesh;
  batched: boolean;

  shaderPasses: ReadonlyArray<ShaderPass>;
  stencilOperation: StencilOperation;

  texture?: Texture2D;
  subChunk?: SubPrimitiveChunk;
  shaderData?: ShaderData;

  set(
    component: Renderer,
    material: Material,
    primitive: Primitive,
    subPrimitive: SubMesh,
    texture?: Texture2D,
    subChunk?: SubPrimitiveChunk
  ): void {
    this.component = component;
    this.material = material;
    this.primitive = primitive;
    this.subPrimitive = subPrimitive;
    this.texture = texture;
    this.subChunk = subChunk;
  }

  setShaderPasses(shaderPasses: ReadonlyArray<ShaderPass>): void {
    this.shaderPasses = shaderPasses;
  }

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;

    this.shaderPasses = null;

    this.texture && (this.texture = null);
    this.subChunk && (this.subChunk = null);
    this.shaderData && (this.shaderData = null);
  }
}
