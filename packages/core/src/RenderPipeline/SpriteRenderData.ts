import { VertexData2D } from "../2d/data/VertexData2D";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { Texture2D } from "../texture";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { IPoolElement } from "./IPoolElement";
import { RenderData } from "./RenderData";

export class SpriteRenderData extends RenderData implements IPoolElement {
  verticesData: VertexData2D;
  texture: Texture2D;

  constructor() {
    super();
    this.usage = RenderDataUsage.Sprite;
  }

  setX(component: Renderer, material: Material, verticesData: VertexData2D, texture: Texture2D): void {
    this.component = component;
    this.material = material;
    this.verticesData = verticesData;
    this.texture = texture;
  }

  override dispose(): void {
    this.component = this.material = this.verticesData = this.texture = null;
  }
}
