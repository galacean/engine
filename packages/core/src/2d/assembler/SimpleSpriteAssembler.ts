import { BoundingBox, Matrix } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { ISpriteAssembler } from "./ISpriteAssembler";

/**
 * @internal
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class SimpleSpriteAssembler {
  static _rectangleTriangles = [0, 1, 2, 2, 1, 3];
  static _worldMatrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    const manager = renderer._getChunkManager();
    const lastChunk = renderer._chunk;
    lastChunk && manager.freeChunk(lastChunk);
    const chunk = manager.allocateChunk(4);
    chunk.indices = SimpleSpriteAssembler._rectangleTriangles;
    renderer._chunk = chunk;
  }

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    const { width, height, sprite } = renderer;
    const { x: pivotX, y: pivotY } = sprite.pivot;
    // Renderer's worldMatrix
    const worldMatrix = SimpleSpriteAssembler._worldMatrix;
    const { elements: wE } = worldMatrix;
    // Parent's worldMatrix
    const { elements: pWE } = renderer.entity.transform.worldMatrix;
    const sx = renderer.flipX ? -width : width;
    const sy = renderer.flipY ? -height : height;
    (wE[0] = pWE[0] * sx), (wE[1] = pWE[1] * sx), (wE[2] = pWE[2] * sx);
    (wE[4] = pWE[4] * sy), (wE[5] = pWE[5] * sy), (wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    wE[12] = pWE[12] - pivotX * wE[0] - pivotY * wE[4];
    wE[13] = pWE[13] - pivotX * wE[1] - pivotY * wE[5];
    wE[14] = pWE[14] - pivotX * wE[2] - pivotY * wE[6];

    // ---------------
    //  2 - 3
    //  |   |
    //  0 - 1
    // ---------------
    // Update positions
    const spritePositions = sprite._getPositions();
    const { _chunk: chunk } = renderer;
    const vertices = chunk.data._vertices;
    for (let i = 0, o = chunk.primitive.vertexBufferBindings[0].offset / 4; i < 4; ++i, o += 9) {
      const { x, y } = spritePositions[i];
      vertices[o] = wE[0] * x + wE[4] * y + wE[12];
      vertices[o + 1] = wE[1] * x + wE[5] * y + wE[13];
      vertices[o + 2] = wE[2] * x + wE[6] * y + wE[14];
    }

    BoundingBox.transform(sprite._getBounds(), worldMatrix, renderer._bounds);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {
    const spriteUVs = renderer.sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];
    const { _chunk: chunk } = renderer;
    const vertices = chunk.data._vertices;
    const offset = chunk.primitive.vertexBufferBindings[0].offset / 4 + 3;
    vertices[offset] = left;
    vertices[offset + 1] = bottom;
    vertices[offset + 9] = right;
    vertices[offset + 10] = bottom;
    vertices[offset + 18] = left;
    vertices[offset + 19] = top;
    vertices[offset + 27] = right;
    vertices[offset + 28] = top;
  }

  static updateColor(renderer: SpriteRenderer): void {
    const chunk = renderer._chunk;
    const { r, g, b, a } = renderer.color;
    const vertices = chunk.data._vertices;
    for (let i = 0, o = chunk.primitive.vertexBufferBindings[0].offset / 4 + 5; i < 4; ++i, o += 9) {
      vertices[o] = r;
      vertices[o + 1] = g;
      vertices[o + 2] = b;
      vertices[o + 3] = a;
    }
  }
}
