import { Rect } from "@oasis-engine/math";
import { Sprite } from "../sprite";
import { Texture2D } from "../../texture/Texture2D";

export interface OriginInfo {
  sprite: Sprite;
  texture: Texture2D;
  atlasRegion: Rect;
}

export interface OriginInfoObj {
  /** The instance id for sprite. */
  [id: number]: OriginInfo
}

