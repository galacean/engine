import { MathUtil, Matrix } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { DisorderedArray } from "../../DisorderedArray";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { Logger } from "../../base";
import { Batcher2D } from "../../RenderPipeline/batcher/Batcher2D";

/**
 * @internal
 */
@StaticInterfaceImplement<IAssembler>()
export class TiledSpriteAssembler {
  static _worldMatrix: Matrix = new Matrix();
  static _posRow: DisorderedArray<number> = new DisorderedArray<number>();
  static _posColumn: DisorderedArray<number> = new DisorderedArray<number>();
  static _uvRow: DisorderedArray<number> = new DisorderedArray<number>();
  static _uvColumn: DisorderedArray<number> = new DisorderedArray<number>();

  static resetData(renderer: SpriteRenderer, vCount: number, iCount: number): void {
    if (vCount && iCount) {
      const batcher = renderer.engine._batcherManager._batcher2D;
      const { _chunk: chunk } = renderer;
      if (chunk) {
        if (chunk._vEntry.len !== vCount * 9) {
          batcher.freeChunk(chunk);
          renderer._chunk = batcher.allocateChunk(vCount, iCount);
          renderer._chunk._indices = [];
        }
      } else {
        renderer._chunk = batcher.allocateChunk(vCount, iCount);
        renderer._chunk._indices = [];
      }
    }
  }

  static updatePositions(renderer: SpriteRenderer): void {
    const { width, height, sprite, tileMode, tiledAdaptiveThreshold: threshold } = renderer;
    // Calculate row and column
    const { _posRow: posRow, _posColumn: posColumn, _uvRow: uvRow, _uvColumn: uvColumn } = this;
    posRow.length = posColumn.length = uvRow.length = uvColumn.length = 0;
    tileMode === SpriteTileMode.Adaptive
      ? this._calculateAdaptiveDividing(sprite, width, height, threshold, posRow, posColumn, uvRow, uvColumn)
      : this._calculateContinuousDividing(sprite, width, height, posRow, posColumn, uvRow, uvColumn);
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

    // Calculate total vertex count and indices count, to be optimized.
    let vertexCount = 0;
    let indicesCount = 0;
    for (let j = 0; j < columnLength; j++) {
      const doubleJ = 2 * j;
      for (let i = 0; i < rowLength; i++) {
        const uvL = uvRow.get(2 * i);
        const uvR = uvRow.get(2 * i + 1);
        const uvT = uvColumn.get(doubleJ + 1);
        if (isNaN(uvL) || isNaN(uvL) || isNaN(uvR) || isNaN(uvT)) {
          continue;
        }
        vertexCount += 4;
        indicesCount += 6;
      }
    }
    this.resetData(renderer, vertexCount, indicesCount);

    const { r: colorR, g: colorG, b: colorB, a: colorA } = renderer.color;
    const { _chunk: chunk } = renderer;
    const vertices = chunk._meshBuffer._vertices;
    const indices = chunk._indices;
    let index = chunk._vEntry.start;
    let count = 0;
    let trianglesOffset = 0;
    for (let j = 0; j < columnLength; j++) {
      const doubleJ = 2 * j;
      for (let i = 0; i < rowLength; i++) {
        const uvL = uvRow.get(2 * i);
        const uvB = uvColumn.get(doubleJ);
        const uvR = uvRow.get(2 * i + 1);
        const uvT = uvColumn.get(doubleJ + 1);
        if (isNaN(uvL) || isNaN(uvL) || isNaN(uvR) || isNaN(uvT)) {
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
        vertices[index++] = wE0 * l + wE4 * b + wE12;
        vertices[index++] = wE1 * l + wE5 * b + wE13;
        vertices[index++] = wE2 * l + wE6 * b + wE14;
        vertices[index++] = uvL;
        vertices[index++] = uvB;
        vertices[index++] = colorR;
        vertices[index++] = colorG;
        vertices[index++] = colorB;
        vertices[index++] = colorA;

        // right and bottom
        vertices[index++] = wE0 * r + wE4 * b + wE12;
        vertices[index++] = wE1 * r + wE5 * b + wE13;
        vertices[index++] = wE2 * r + wE6 * b + wE14;
        vertices[index++] = uvR;
        vertices[index++] = uvB;
        vertices[index++] = colorR;
        vertices[index++] = colorG;
        vertices[index++] = colorB;
        vertices[index++] = colorA;

        // left and top
        vertices[index++] = wE0 * l + wE4 * t + wE12;
        vertices[index++] = wE1 * l + wE5 * t + wE13;
        vertices[index++] = wE2 * l + wE6 * t + wE14;
        vertices[index++] = uvL;
        vertices[index++] = uvT;
        vertices[index++] = colorR;
        vertices[index++] = colorG;
        vertices[index++] = colorB;
        vertices[index++] = colorA;

        // right and top
        vertices[index++] = wE0 * r + wE4 * t + wE12;
        vertices[index++] = wE1 * r + wE5 * t + wE13;
        vertices[index++] = wE2 * r + wE6 * t + wE14;
        vertices[index++] = uvR;
        vertices[index++] = uvT;
        vertices[index++] = colorR;
        vertices[index++] = colorG;
        vertices[index++] = colorB;
        vertices[index++] = colorA;
      }
    }

    const { min, max } = renderer._bounds;
    min.set(posRow.get(0), posColumn.get(0), 0);
    max.set(posRow.get(rowLength), posColumn.get(columnLength), 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer): void {}

  static updateColor(renderer: SpriteRenderer): void {
    const { _chunk: chunk } = renderer;
    const { color } = renderer;
    const vertices = chunk._meshBuffer._vertices;
    let index = chunk._vEntry.start + 5;
    for (let i = 0, l = chunk._vEntry.len / 9; i < l; ++i) {
      vertices[index] = color.r;
      vertices[index + 1] = color.g;
      vertices[index + 2] = color.b;
      vertices[index + 3] = color.a;
      index += 9;
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
    uvColumn: DisorderedArray<number>
  ) {
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

    if ((rVertCount - 1) * (cVertCount - 1) * 4 > Batcher2D.MAX_VERTEX_COUNT) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      Logger.warn(`The number of vertices exceeds the upper limit(${Batcher2D.MAX_VERTEX_COUNT}).`);
      return;
    }

    switch (rType) {
      case TiledType.Compressed:
        scale = width / fixedLR;
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      case TiledType.WithoutTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL), posRow.add(width - fixedR);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      case TiledType.WithTiled:
        scale = width / (fixedLR + rRepeatCount * fixedCW);
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        for (let i = 0, l = rRepeatCount - 1; i < l; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW * scale);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedR * scale), posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
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
        break;
      case TiledType.WithoutTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB), posColumn.add(height - fixedT);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        break;
      case TiledType.WithTiled:
        scale = height / (fixedTB + cRepeatCount * fixedCH);
        posColumn.add(expectHeight * bottom * scale), posColumn.add(fixedB * scale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        for (let i = 0, l = cRepeatCount - 1; i < l; i++) {
          posColumn.add(fixedB + (i + 1) * fixedCH * scale);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
        }
        posColumn.add(height - fixedT * scale), posColumn.add(height - expectHeight * (1 - top) * scale);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        break;
      default:
        break;
    }
  }

  private static _calculateContinuousDividing(
    sprite: Sprite,
    width: number,
    height: number,
    posRow: DisorderedArray<number>,
    posColumn: DisorderedArray<number>,
    uvRow: DisorderedArray<number>,
    uvColumn: DisorderedArray<number>
  ) {
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

    if ((rVertCount - 1) * (cVertCount - 1) * 4 > Batcher2D.MAX_VERTEX_COUNT) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      Logger.warn(`The number of vertices exceeds the upper limit(${Batcher2D.MAX_VERTEX_COUNT}).`);
      return;
    }

    switch (rType) {
      case TiledType.Compressed:
        const scale = width / fixedLR;
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      case TiledType.WithoutTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL), posRow.add(width - fixedR);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      case TiledType.WithTiled:
        posRow.add(expectWidth * left), posRow.add(fixedL);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        const countInteger = rRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedR), posRow.add(width - expectWidth * (1 - right));
        uvRow.add((spriteUV2.x - spriteUV1.x) * (rRepeatCount - countInteger) + spriteUV1.x);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
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
        break;
      case TiledType.WithoutTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB), posColumn.add(height - fixedT);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        break;
      case TiledType.WithTiled:
        posColumn.add(expectHeight * bottom), posColumn.add(fixedB);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        const countInteger = cRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posColumn.add(fixedB + (i + 1) * fixedCH);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
        }
        posColumn.add(height - fixedT), posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add((spriteUV2.y - spriteUV1.y) * (cRepeatCount - countInteger) + spriteUV1.y);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
        break;
      default:
        break;
    }
  }
}

enum TiledType {
  Compressed,
  WithoutTiled,
  WithTiled
}
