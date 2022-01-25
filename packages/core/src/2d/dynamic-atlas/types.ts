import { Rect } from "@oasis-engine/math";
import { Sprite } from "../sprite";
import { Texture2D } from "../../texture/Texture2D";

/**
 * The origin info includes sprite texture and altasRegion before batch.
 */
export interface OriginInfo {
  sprite: Sprite;
  texture: Texture2D;
  atlasRegion: Rect;
}

/**
 * The origin info object to record all origin info.
 */
export interface OriginInfoObj {
  /** The instance id for sprite. */
  [id: number]: OriginInfo
}

