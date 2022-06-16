import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { Texture2D } from "../texture";

export class SpriteElement {
  component: Renderer;
  positions: Vector3[];
  uv: Vector2[];
  triangles: number[];
  color: Color;
  texture: Texture2D;
  material: Material;
  camera: Camera;

  setValue(
    component: Renderer,
    positions: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    texture: Texture2D,
    material: Material,
    camera: Camera
  ): void {
    this.component = component;
    this.positions = positions;
    this.uv = uv;
    this.triangles = triangles;
    this.color = color;
    this.texture = texture;
    this.material = material;
    this.camera = camera;
  }
}
