import { Rect } from "@oasis-engine/math";
import { Texture2D } from "../../texture/Texture2D";

export interface OriginTextureObj {
  /** The instance id for sprite. */
  [id: number]: Texture2D
}

export interface OriginTextureRectObj {
  /** The instance id for texture. */
  [id: number]: Rect
}
