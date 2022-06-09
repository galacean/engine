import { Vector3 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";
import { RenderData2D } from "../data/RenderData2D";

export interface CharRenderData {
  /** @internal */
  texture: Texture2D;
  /** @internal */
  renderData: RenderData2D;
  /** @intarnal */
  localPositions: Vector3[];
}
