import { Vector2 } from "@oasis-engine/math";
import { Texture2D } from "../../texture/Texture2D";

export interface DynamicSprite {
  _uv: Array<Vector2>,
  texture: Texture2D
}
