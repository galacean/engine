import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, ShaderPass } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { RenderQueueFlags } from "./BasicRenderPipeline";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

export class SubRenderElement implements IPoolElement {
  component: Renderer;
  primitive: Primitive;
  material: Material;
  subPrimitive: SubMesh;
  shaderPasses: ReadonlyArray<ShaderPass>;
  shaderData?: ShaderData;
  batched: boolean;
  renderQueueFlags: RenderQueueFlags;

  /** UI stencil depth. 0 = no stencil, >0 = stencil test/write at this depth. */
  uiStencilDepth: number = 0;
  /** UI stencil operation. 0 = test (read stencil), 1 = increment (write mask), -1 = decrement (exit mask). */
  uiStencilOp: number = 0;

  // @todo: maybe should remove later
  texture?: Texture2D;
  subChunk?: SubPrimitiveChunk;

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

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;
    this.shaderPasses = null;
    this.shaderData && (this.shaderData = null);

    this.texture && (this.texture = null);
    this.subChunk && (this.subChunk = null);
  }
}
