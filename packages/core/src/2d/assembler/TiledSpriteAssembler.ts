import { MathUtil, Matrix } from "@galacean/engine-math";
import { DisorderedArray } from "../../DisorderedArray";
import { Logger } from "../../base";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { ISpriteAssembler } from "./ISpriteAssembler";

/**
 * @internal
 */
@StaticInterfaceImplement<ISpriteAssembler>()
export class TiledSpriteAssembler {
  static _worldMatrix = new Matrix();
  static _posRow = new DisorderedArray<number>();
  static _posColumn = new DisorderedArray<number>();
  static _uvRow = new DisorderedArray<number>();
  static _uvColumn = new DisorderedArray<number>();

  static resetData(renderer: SpriteRenderer, vertexCount: number): void {
    if (vertexCount) {
      const manager = renderer._getChunkManager();
      const lastSubChunk = renderer._subChunk;
      const sizeChanged = lastSubChunk && lastSubChunk.vertexArea.size !== vertexCount * 9;
      sizeChanged && manager.freeSubChunk(lastSubChunk);

      if (!lastSubChunk || sizeChanged) {
        const newSubChunk = manager.allocateSubChunk(vertexCount);
        newSubChunk.indices = [];
        renderer._subChunk = newSubChunk;
      }
    }
  }

  static updatePositions(renderer: SpriteRenderer): void {
    const { width, height, sprite, tileMode, tiledAdaptiveThreshold: threshold } = renderer;
    // Calculate row and column
    const { _posRow: posRow, _posColumn: posColumn, _uvRow: uvRow, _uvColumn: uvColumn } = TiledSpriteAssembler;
    const maxVertexCount = renderer._getChunkManager().maxVertexCount;
    posRow.length = posColumn.length = uvRow.length = uvColumn.length = 0;
    const vertexCount =
      tileMode === SpriteTileMode.Adaptive
        ? TiledSpriteAssembler._calculateAdaptiveDividing(
            sprite,
            width,
            height,
            threshold,
            posRow,
            posColumn,
            uvRow,
            uvColumn,
            maxVertexCount
          )
        : TiledSpriteAssembler._calculateContinuousDividing(
            sprite,
            width,
            height,
            posRow,
            posColumn,
            uvRow,
            uvColumn,
            maxVertexCount
          );
    TiledSpriteAssembler.resetData(renderer, vertexCount);
    // Update renderer's worldMatrix
    const { x: pivotX, y: pivotY } = renderer.sprite.pivot;
    const localTransX = renderer.width * pivotX;
    const localTransY = renderer.height * pivotY;
    // Renderer's worldMatrix
    const { _worldMatrix: worldMatrix } = TiledSpriteAssembler;
    const { elements: wE } = worldMatrix;
    // Parent's worldMatrix
    const { elements: pWE } = renderer.entity.transform.worldMatrix;
    const sx = renderer.flipX ? -1 : 1;
    const sy = renderer.flipY ? -1 : 1;
    let wE0: number, wE1: number, wE2: number;
    let wE4: number, wE5: number, wE6: number;
    (wE0 = wE[0] = pWE[0] * sx), (wE1 = wE[1] = pWE[1] * sx), (wE2 = wE[2] = pWE[2] * sx);
    (wE4 = wE[4] = pWE[4] * sy), (wE5 = wE[5] = pWE[5] * sy), (wE6 = wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    const wE12 = (wE[12] = pWE[12] - localTransX * wE[0] - localTransY * wE[4]);
    const wE13 = (wE[13] = pWE[13] - localTransX * wE[1] - localTransY * wE[5]);
    const wE14 = (wE[14] = pWE[14] - localTransX * wE[2] - localTransY * wE[6]);
    // Assemble position and uv
    const rowLength = posRow.length - 1;
    const columnLength = posColumn.length - 1;

    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    const indices = subChunk.indices;
    let count = 0;
    let trianglesOffset = 0;
    for (let j = 0, o = subChunk.vertexArea.start; j < columnLength; j++) {
      const doubleJ = 2 * j;
      for (let i = 0; i < rowLength; i++) {
        const uvL = uvRow.get(2 * i);
        const uvR = uvRow.get(2 * i + 1);
        const uvT = uvColumn.get(doubleJ + 1);
        if (isNaN(uvL) || isNaN(uvR) || isNaN(uvT)) {
          continue;
        }

        indices[trianglesOffset++] = count;
        indices[trianglesOffset++] = count + 1;
        indices[trianglesOffset++] = count + 2;
        indices[trianglesOffset++] = count + 2;
        indices[trianglesOffset++] = count + 1;
        indices[trianglesOffset++] = count + 3;
        count += 4;
        const l = posRow.get(i);
        const b = posColumn.get(j);
        const r = posRow.get(i + 1);
        const t = posColumn.get(j + 1);

        // left and bottom
        vertices[o] = wE0 * l + wE4 * b + wE12;
        vertices[o + 1] = wE1 * l + wE5 * b + wE13;
        vertices[o + 2] = wE2 * l + wE6 * b + wE14;
        // right and bottom
        vertices[o + 9] = wE0 * r + wE4 * b + wE12;
        vertices[o + 10] = wE1 * r + wE5 * b + wE13;
        vertices[o + 11] = wE2 * r + wE6 * b + wE14;
        // left and top
        vertices[o + 18] = wE0 * l + wE4 * t + wE12;
        vertices[o + 19] = wE1 * l + wE5 * t + wE13;
        vertices[o + 20] = wE2 * l + wE6 * t + wE14;
        // right and top
        vertices[o + 27] = wE0 * r + wE4 * t + wE12;
        vertices[o + 28] = wE1 * r + wE5 * t + wE13;
        vertices[o + 29] = wE2 * r + wE6 * t + wE14;
        o += 36;
      }
    }

    const { min, max } = renderer._bounds;
    min.set(posRow.get(0), posColumn.get(0), 0);
    max.set(posRow.get(rowLength), posColumn.get(columnLength), 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer): void {
    const { _posRow: posRow, _posColumn: posColumn, _uvRow: uvRow, _uvColumn: uvColumn } = TiledSpriteAssembler;
    const rowLength = posRow.length - 1;
    const columnLength = posColumn.length - 1;
    const subChunk = renderer._subChunk;
    const vertices = subChunk.chunk.vertices;
    for (let j = 0, o = subChunk.vertexArea.start + 3; j < columnLength; j++) {
      const doubleJ = 2 * j;
      for (let i = 0; i < rowLength; i++) {
        const uvL = uvRow.get(2 * i);
        const uvB = uvColumn.get(doubleJ);
        const uvR = uvRow.get(2 * i + 1);
        const uvT = uvColumn.get(doubleJ + 1);
        if (isNaN(uvL) || isNaN(uvB) || isNaN(uvR) || isNaN(uvT)) {
          continue;
        }

        // left and bottom
        vertices[o] = uvL;
        vertices[o + 1] = uvB;
        // right and bottom
        vertices[o + 9] = uvR;
        vertices[o + 10] = uvB;
        // left and top
        vertices[o + 18] = uvL;
        vertices[o + 19] = uvT;
        // right and top
        vertices[o + 27] = uvR;
        vertices[o + 28] = uvT;
        o += 36;
      }
    }
  }

  static updateColor(renderer: SpriteRenderer): void {
    const subChunk = renderer._subChunk;
    const { r, g, b, a } = renderer.color;
    const vertices = subChunk.chunk.vertices;
    const vertexArea = subChunk.vertexArea;
    for (let i = 0, o = vertexArea.start + 5, n = vertexArea.size / 9; i < n; ++i, o += 9) {
      vertices[o] = r;
      vertices[o + 1] = g;
      vertices[o + 2] = b;
      vertices[o + 3] = a;
    }
  }

  private static _calculateAdaptiveDividing(
    sprite: Sprite,
    width: number,
    height: number,
    threshold: number,
    posRow: DisorderedArray<number>,
    posColumn: DisorderedArray<number>,
    uvRow: DisorderedArray<number>,
    uvColumn: DisorderedArray<number>,
    maxVertexCount: number
  ): number {
    const { border } = sprite;
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    const [spriteUV0, spriteUV1, spriteUV2, spriteUV3] = sprite._getUVs();
    const { width: expectWidth, height: expectHeight } = sprite;
    const fixedL = expectWidth * border.x;
    const fixedR = expectWidth * border.z;
    const fixedLR = fixedL + fixedR;
    const fixedCW = expectWidth - fixedLR;
    const fixedT = expectHeight * border.w;
    const fixedB = expectHeight * border.y;
    const fixedTB = fixedT + fixedB;
    const fixedCH = expectHeight - fixedTB;
    let scale: number;
    let rType: TiledType, cType: TiledType;
    let rVertCount: number, cVertCount: number;
    let rRepeatCount: number, cRepeatCount: number;
    if (fixedLR >= width) {
      rVertCount = 3;
      rType = TiledType.Compressed;
    } else {
      if (fixedCW > MathUtil.zeroTolerance) {
        rRepeatCount = (width - fixedLR) / fixedCW;
        rRepeatCount = rRepeatCount % 1 >= threshold ? Math.ceil(rRepeatCount) : Math.floor(rRepeatCount);
        rVertCount = 4 + rRepeatCount - 1;
        rType = TiledType.WithTiled;
      } else {
        rVertCount = 4;
        rType = TiledType.WithoutTiled;
      }
    }

    if (fixedTB >= height) {
      cVertCount = 3;
      cType = TiledType.Compressed;
    } else {
      if (fixedCH > MathUtil.zeroTolerance) {
        cRepeatCount = (height - fixedTB) / fixedCH;
        cRepeatCount = cRepeatCount % 1 >= threshold ? Math.ceil(cRepeatCount) : Math.floor(cRepeatCount);
        cVertCount = 4 + cRepeatCount - 1;
        cType = TiledType.WithTiled;
      } else {
        cVertCount = 4;
        cType = TiledType.WithoutTiled;
      }
    }

    let rowCount = 0;
    let columnCount = 0;

    if ((rVertCount - 1) * (cVertCount - 1) * 4 > maxVertexCount) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      rowCount += 2;
      columnCount += 2;
      Logger.warn(`The number of vertices exceeds the upper limit(${maxVertexCount}).`);
      return rowCount * columnCount;
    }

    switch (rType) {
      case TiledType.Compressed:
        scale = width / fixedLR;
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 4;
        break;
      case TiledType.WithoutTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL), posRow.add(width - fixedR);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 4;
        break;
      case TiledType.WithTiled:
        scale = width / (fixedLR + rRepeatCount * fixedCW);
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        rowCount += 3;
        for (let i = 0, l = rRepeatCount - 1; i < l; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW * scale);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
          rowCount += 2;
        }
        posRow.add(width - fixedR * scale), posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 3;
        break;
      default:
        break;
    }

    switch (cType) {
      case TiledType.Compressed:
        scale = height / fixedTB;
        posColumn.add(expectHeight * bottom * scale), posColumn.add(fixedB * scale);
        posColumn.add(height - expectHeight * (1 - top) * scale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 4;
        break;
      case TiledType.WithoutTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB), posColumn.add(height - fixedT);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 4;
        break;
      case TiledType.WithTiled:
        scale = height / (fixedTB + cRepeatCount * fixedCH);
        posColumn.add(expectHeight * bottom * scale), posColumn.add(fixedB * scale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        columnCount += 3;
        for (let i = 0, l = cRepeatCount - 1; i < l; i++) {
          posColumn.add(fixedB + (i + 1) * fixedCH * scale);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
          columnCount += 2;
        }
        posColumn.add(height - fixedT * scale), posColumn.add(height - expectHeight * (1 - top) * scale);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 3;
        break;
      default:
        break;
    }

    return rowCount * columnCount;
  }

  private static _calculateContinuousDividing(
    sprite: Sprite,
    width: number,
    height: number,
    posRow: DisorderedArray<number>,
    posColumn: DisorderedArray<number>,
    uvRow: DisorderedArray<number>,
    uvColumn: DisorderedArray<number>,
    maxVertexCount: number
  ): number {
    const { border } = sprite;
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    const [spriteUV0, spriteUV1, spriteUV2, spriteUV3] = sprite._getUVs();
    const { width: expectWidth, height: expectHeight } = sprite;
    const fixedL = expectWidth * border.x;
    const fixedR = expectWidth * border.z;
    const fixedLR = fixedL + fixedR;
    const fixedCW = expectWidth - fixedLR;
    const fixedT = expectHeight * border.w;
    const fixedB = expectHeight * border.y;
    const fixedTB = fixedT + fixedB;
    const fixedCH = expectHeight - fixedTB;
    let rType: TiledType, cType: TiledType;
    let rVertCount: number, cVertCount: number;
    let rRepeatCount: number, cRepeatCount: number;
    if (fixedLR >= width) {
      rVertCount = 3;
      rType = TiledType.Compressed;
    } else {
      if (fixedCW > MathUtil.zeroTolerance) {
        rRepeatCount = (width - fixedLR) / fixedCW;
        rVertCount = 4 + (rRepeatCount | 0);
        rType = TiledType.WithTiled;
      } else {
        rVertCount = 4;
        rType = TiledType.WithoutTiled;
      }
    }

    if (fixedTB >= height) {
      cVertCount = 3;
      cType = TiledType.Compressed;
    } else {
      if (fixedCH > MathUtil.zeroTolerance) {
        cRepeatCount = (height - fixedTB) / fixedCH;
        cVertCount = 4 + (cRepeatCount | 0);
        cType = TiledType.WithTiled;
      } else {
        cVertCount = 4;
        cType = TiledType.WithoutTiled;
      }
    }

    let rowCount = 0;
    let columnCount = 0;

    if ((rVertCount - 1) * (cVertCount - 1) * 4 > maxVertexCount) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      rowCount += 2;
      columnCount += 2;
      Logger.warn(`The number of vertices exceeds the upper limit(${maxVertexCount}).`);
      return rowCount * columnCount;
    }

    switch (rType) {
      case TiledType.Compressed:
        const scale = width / fixedLR;
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 4;
        break;
      case TiledType.WithoutTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL), posRow.add(width - fixedR);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 4;
        break;
      case TiledType.WithTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        rowCount += 3;
        const countInteger = rRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
          rowCount += 2;
        }
        posRow.add(width - fixedR), posRow.add(width - expectWidth * (1 - right));
        uvRow.add((spriteUV2.x - spriteUV1.x) * (rRepeatCount - countInteger) + spriteUV1.x);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        rowCount += 3;
        break;
      default:
        break;
    }

    switch (cType) {
      case TiledType.Compressed:
        const scale = height / fixedTB;
        posColumn.add(expectHeight * bottom * scale), posColumn.add(fixedB * scale);
        posColumn.add(height - expectHeight * (1 - top) * scale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 4;
        break;
      case TiledType.WithoutTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB), posColumn.add(height - fixedT);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 4;
        break;
      case TiledType.WithTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        columnCount += 3;
        const countInteger = cRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posColumn.add(fixedB + (i + 1) * fixedCH);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
          columnCount += 2;
        }
        posColumn.add(height - fixedT), posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add((spriteUV2.y - spriteUV1.y) * (cRepeatCount - countInteger) + spriteUV1.y);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        columnCount += 3;
        break;
      default:
        break;
    }
    return rowCount * columnCount;
  }
}

enum TiledType {
  Compressed,
  WithoutTiled,
  WithTiled
}
