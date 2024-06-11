import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { Texture2D } from "../texture";
import { IPoolElement } from "../utils/ReturnableObjectPool";
import { Chunk } from "./Chunk";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { RenderData } from "./RenderData";

export class RenderData2D extends RenderData implements IPoolElement {
  texture: Texture2D;
  chunk: Chunk;

  constructor() {
    super();
    this.usage = RenderDataUsage.Sprite;
  }

  override set(
    component: Renderer,
    material: Material,
    primitive: Primitive,
    subPrimitive: SubMesh,
    texture?: Texture2D,
    chunk?: Chunk
  ): void {
    super.set(component, material, primitive, subPrimitive);
    this.texture = texture;
    this.chunk = chunk;
  }

  override dispose(): void {
    this.component = this.material = this.texture = this.chunk = null;
  }
}
