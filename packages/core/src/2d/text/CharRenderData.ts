import { Vector4 } from "@galacean/engine-math";
import { Texture2D } from "../../texture";
import { MBChunk } from "../../RenderPipeline/batcher/MeshBuffer";
import { Engine } from "../../Engine";
import { IPoolElement } from "../../utils/Pool";

/**
 * @internal
 */
export class CharRenderData implements IPoolElement {
  static triangles: number[] = [0, 2, 1, 2, 0, 3];

  texture: Texture2D;
  /** x:Top y:Left z:Bottom w:Right */
  localPositions: Vector4 = new Vector4();
  chunk: MBChunk;

  init(engine: Engine) {
    if (!this.chunk) {
      this.chunk = engine._batcherManager._batcher2D.allocateChunk(4, 6);
      this.chunk._indices = CharRenderData.triangles;
    }
  }

  dispose(): void {
    this.texture = this.chunk = null;
  }
}
