import { Matrix, Vector2 } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { UIImage } from "../../ui";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { ISpriteAssembler } from "./ISpriteAssembler";

/**
 * @internal
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class SlicedSpriteAssembler {
  static _rectangleTriangles = [
    0, 1, 4, 1, 5, 4, 1, 2, 5, 2, 6, 5, 2, 3, 6, 3, 7, 6, 4, 5, 8, 5, 9, 8, 5, 6, 9, 6, 10, 9, 6, 7, 10, 7, 11, 10, 8,
    9, 12, 9, 13, 12, 9, 10, 13, 10, 14, 13, 10, 11, 14, 11, 15, 14
  ];
  static _worldMatrix = new Matrix();

  static resetData(renderer: SpriteRenderer | UIImage): void {
    const manager = renderer._getChunkManager();
    const lastSubChunk = renderer._subChunk;
    lastSubChunk && manager.freeSubChunk(lastSubChunk);
    const subChunk = manager.allocateSubChunk(16);
    subChunk.indices = SlicedSpriteAssembler._rectangleTriangles;
    renderer._subChunk = subChunk;
  }

  static updatePositions(
    renderer: SpriteRenderer | SpriteMask | UIImage,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean = false,
    flipY: boolean = false
  ): void {
    const { sprite } = renderer;
    const { border } = sprite;
    // Update local positions.
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    const { width: expectWidth, height: expectHeight } = sprite;
    const fixedLeft = expectWidth * border.x;
    const fixedBottom = expectHeight * border.y;
    const fixedRight = expectWidth * border.z;
    const fixedTop = expectHeight * border.w;

    // ------------------------
    //     [3]
    //      |
    //     [2]
    //      |
    //     [1]
    //      |
    // row [0] - [1] - [2] - [3]
    //    column
    // ------------------------
    // Calculate row and column.
    let row: number[], column: number[];
    if (fixedLeft + fixedRight > width) {
      const widthScale = width / (fixedLeft + fixedRight);
      row = [
        expectWidth * left * widthScale,
        fixedLeft * widthScale,
        fixedLeft * widthScale,
        width - expectWidth * (1 - right) * widthScale
      ];
    } else {
      row = [expectWidth * left, fixedLeft, width - fixedRight, width - expectWidth * (1 - right)];
    }

    if (fixedTop + fixedBottom > height) {
      const heightScale = height / (fixedTop + fixedBottom);
      column = [
        expectHeight * bottom * heightScale,
        fixedBottom * heightScale,
        fixedBottom * heightScale,
        height - expectHeight * (1 - top) * heightScale
      ];
    } else {
      column = [expectHeight * bottom, fixedBottom, height - fixedTop, height - expectHeight * (1 - top)];
    }

    // Update renderer's worldMatrix.
    const { x: pivotX, y: pivotY } = pivot;
    const localTransX = width * pivotX;
    const localTransY = height * pivotY;
    // Renderer's worldMatrix.
    const worldMatrix = SlicedSpriteAssembler._worldMatrix;
    const { elements: wE } = worldMatrix;
    // Parent's worldMatrix.
    const { elements: pWE } = renderer.entity.transform.worldMatrix;
    const sx = flipX ? -1 : 1;
    const sy = flipY ? -1 : 1;
    (wE[0] = pWE[0] * sx), (wE[1] = pWE[1] * sx), (wE[2] = pWE[2] * sx);
    (wE[4] = pWE[4] * sy), (wE[5] = pWE[5] * sy), (wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    wE[12] = pWE[12] - localTransX * wE[0] - localTransY * wE[4];
    wE[13] = pWE[13] - localTransX * wE[1] - localTransY * wE[5];
    wE[14] = pWE[14] - localTransX * wE[2] - localTransY * wE[6];

    // ------------------------
    //  3 - 7 - 11 - 15
    //  |   |   |    |
    //  2 - 6 - 10 - 14
    //  |   |   |    |
    //  1 - 5 - 9  - 13
    //  |   |   |    |
    //  0 - 4 - 8  - 12
    // ------------------------
    // Assemble position and uv.
    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    for (let i = 0, o = subChunk.vertexArea.start; i < 4; i++) {
      const rowValue = row[i];
      for (let j = 0; j < 4; j++, o += 9) {
        const columnValue = column[j];
        vertices[o] = wE[0] * rowValue + wE[4] * columnValue + wE[12];
        vertices[o + 1] = wE[1] * rowValue + wE[5] * columnValue + wE[13];
        vertices[o + 2] = wE[2] * rowValue + wE[6] * columnValue + wE[14];
      }
    }

    const { min, max } = renderer._bounds;
    min.set(row[0], column[0], 0);
    max.set(row[3], column[3], 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer | UIImage): void {
    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    const spriteUVs = renderer.sprite._getUVs();
    for (let i = 0, o = subChunk.vertexArea.start + 3; i < 4; i++) {
      const rowU = spriteUVs[i].x;
      for (let j = 0; j < 4; j++, o += 9) {
        vertices[o] = rowU;
        vertices[o + 1] = spriteUVs[j].y;
      }
    }
  }

  static updateColor(renderer: SpriteRenderer | UIImage, groupAlpha: number = 1): void {
    const subChunk = renderer._subChunk;
    const { r, g, b, a } = renderer.color;
    const finalAlpha = a * groupAlpha;
    const vertices = subChunk.chunk.vertices;
    for (let i = 0, o = subChunk.vertexArea.start + 5; i < 16; ++i, o += 9) {
      vertices[o] = r;
      vertices[o + 1] = g;
      vertices[o + 2] = b;
      vertices[o + 3] = finalAlpha;
    }
  }
}
