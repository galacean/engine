import { BoundingBox, Matrix, Vector2 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { ISpriteAssembler } from "./ISpriteAssembler";
import { ISpriteRenderer } from "./ISpriteRenderer";

/**
 * Assemble vertex data for the sprite renderer in simple mode.
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class SimpleSpriteAssembler {
  private static _rectangleTriangles = [0, 1, 2, 2, 1, 3];
  private static _matrix = new Matrix();

  static resetData(renderer: ISpriteRenderer): void {
    const manager = renderer._getChunkManager();
    const lastSubChunk = renderer._subChunk;
    lastSubChunk && manager.freeSubChunk(lastSubChunk);
    const subChunk = manager.allocateSubChunk(4);
    subChunk.indices = SimpleSpriteAssembler._rectangleTriangles;
    renderer._subChunk = subChunk;
  }

  static updatePositions(
    renderer: ISpriteRenderer,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): void {
    const { sprite } = renderer;
    const { x: pivotX, y: pivotY } = pivot;
    // Position to World
    const modelMatrix = SimpleSpriteAssembler._matrix;
    const { elements: wE } = modelMatrix;
    // Renderer's worldMatrix
    const { elements: pWE } = worldMatrix;
    const sx = flipX ? -width : width;
    const sy = flipY ? -height : height;
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
    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    for (let i = 0, o = subChunk.vertexArea.start; i < 4; ++i, o += 9) {
      const { x, y } = spritePositions[i];
      vertices[o] = wE[0] * x + wE[4] * y + wE[12];
      vertices[o + 1] = wE[1] * x + wE[5] * y + wE[13];
      vertices[o + 2] = wE[2] * x + wE[6] * y + wE[14];
    }

    // @ts-ignore
    BoundingBox.transform(sprite._getBounds(), modelMatrix, renderer._bounds);
  }

  static updateUVs(renderer: ISpriteRenderer): void {
    const spriteUVs = renderer.sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];
    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    const offset = subChunk.vertexArea.start + 3;
    vertices[offset] = left;
    vertices[offset + 1] = bottom;
    vertices[offset + 9] = right;
    vertices[offset + 10] = bottom;
    vertices[offset + 18] = left;
    vertices[offset + 19] = top;
    vertices[offset + 27] = right;
    vertices[offset + 28] = top;
  }

  static updateColor(renderer: ISpriteRenderer, alpha: number): void {
    const subChunk = renderer._subChunk;
    const { r, g, b, a } = renderer.color;
    const finalAlpha = a * alpha;
    const vertices = subChunk.chunk.vertices;
    for (let i = 0, o = subChunk.vertexArea.start + 5; i < 4; ++i, o += 9) {
      vertices[o] = r;
      vertices[o + 1] = g;
      vertices[o + 2] = b;
      vertices[o + 3] = finalAlpha;
    }
  }
}
