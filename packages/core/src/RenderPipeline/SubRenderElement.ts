import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, SubShader } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { RenderQueueFlags } from "./BasicRenderPipeline";
import { InstanceDataPacker } from "./InstanceDataPacker";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

export class SubRenderElement implements IPoolElement {
  component: Renderer;
  primitive: Primitive;
  material: Material;
  subPrimitive: SubMesh;
  subShader: SubShader;
  shaderData?: ShaderData;
  batched: boolean;
  renderQueueFlags: RenderQueueFlags;
  instanceDataPacker: InstanceDataPacker;

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
    this.subShader = null;
    this.shaderData && (this.shaderData = null);
    this.instanceDataPacker = null;

    this.texture && (this.texture = null);
    this.subChunk && (this.subChunk = null);
  }
}
