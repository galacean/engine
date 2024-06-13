import { Renderer } from "../Renderer";
import { Primitive, SubMesh } from "../graphic";
import { Material } from "../material";
import { Texture2D } from "../texture";
import { Chunk } from "./Chunk";
import { SubRenderData } from "./SubRenderData";

export class SubRenderData2D extends SubRenderData {
  texture: Texture2D;
  chunk: Chunk;

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
    super.dispose();
    this.texture = null;
    this.chunk = null;
  }
}
