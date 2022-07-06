import { Vector3 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";
import { RenderData2D } from "../data/RenderData2D";

/**
 * @internal
 */
export interface CharRenderData {
  texture: Texture2D;
  renderData: RenderData2D;
  localPositions: Vector3[];
}
