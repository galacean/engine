import { BoundingBox, Color, Matrix } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { ISpriteLayout } from "../sprite/ISpriteLayout";
import { SpritePrimitive } from "../sprite/SpritePrimitive";
import { ISpriteAssembler } from "./ISpriteAssembler";

/**
 * Assemble vertex data for the sprite renderer in simple mode.
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class SimpleSpriteAssembler {
  private static _rectangleTriangles = [0, 1, 2, 2, 1, 3];
  private static _matrix = new Matrix();

  static resetData(primitive: SpritePrimitive, chunkManager: PrimitiveChunkManager): void {
    const lastSubChunk = primitive.subChunk;
    lastSubChunk && chunkManager.freeSubChunk(lastSubChunk);
    const subChunk = chunkManager.allocateSubChunk(4);
    subChunk.indices = SimpleSpriteAssembler._rectangleTriangles;
    primitive.subChunk = subChunk;
  }

  static updatePositions(
    primitive: SpritePrimitive,
    chunkManager: PrimitiveChunkManager,
    layout: ISpriteLayout,
    worldMatrix: Matrix,
    outBounds: BoundingBox
  ): void {
    const { sprite } = primitive;
    const { width, height, pivot, flipX, flipY } = layout;
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
    const subChunk = primitive.subChunk;
    const vertices = subChunk.chunk.vertices;
    for (let i = 0, o = subChunk.vertexArea.start; i < 4; ++i, o += 9) {
      const { x, y } = spritePositions[i];
      vertices[o] = wE[0] * x + wE[4] * y + wE[12];
      vertices[o + 1] = wE[1] * x + wE[5] * y + wE[13];
      vertices[o + 2] = wE[2] * x + wE[6] * y + wE[14];
    }

    // @ts-ignore
    BoundingBox.transform(sprite._getBounds(), modelMatrix, outBounds);
  }

  static updateUVs(primitive: SpritePrimitive): void {
    const spriteUVs = primitive.sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];
    const subChunk = primitive.subChunk;
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

  static updateColor(primitive: SpritePrimitive, color: Color, alpha: number): void {
    const subChunk = primitive.subChunk;
    const { r, g, b, a } = color;
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
