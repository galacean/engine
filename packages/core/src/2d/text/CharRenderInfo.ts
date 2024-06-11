import { Vector4 } from "@galacean/engine-math";
import { Texture2D } from "../../texture";
import { Chunk } from "../../RenderPipeline/Chunk";
import { Engine } from "../../Engine";
import { IPoolElement } from "../../utils/Pool";

/**
 * @internal
 */
export class CharRenderInfo implements IPoolElement {
  static triangles: number[] = [0, 2, 1, 2, 0, 3];

  texture: Texture2D;
  /** x:Top y:Left z:Bottom w:Right */
  localPositions: Vector4 = new Vector4();
  chunk: Chunk;

  init(engine: Engine) {
    if (!this.chunk) {
      this.chunk = engine._batcherManager._dynamicGeometryDataManager2D.allocateChunk(4);
      this.chunk.indices = CharRenderInfo.triangles;
    }
  }

  dispose(): void {
    this.texture = this.chunk = null;
  }
}
