import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { ShaderData, SubShader } from "../shader";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ObjectPool";
import { SubPrimitiveChunk } from "./SubPrimitiveChunk";

export class RenderElement implements IPoolElement {
  priority: number;
  distanceForSort: number;
  component: Renderer;
  primitive: Primitive;
  material: Material;
  subPrimitive: SubMesh;
  subShader: SubShader;
  shaderData?: ShaderData;
  instancedRenderers: Renderer[] = [];

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
    this.instancedRenderers.length = 0;
  }

  dispose(): void {
    this.component = null;
    this.material = null;
    this.primitive = null;
    this.subPrimitive = null;
    this.subShader = null;
    this.shaderData && (this.shaderData = null);
    this.instancedRenderers = null;

    this.texture && (this.texture = null);
    this.subChunk && (this.subChunk = null);
  }
}
