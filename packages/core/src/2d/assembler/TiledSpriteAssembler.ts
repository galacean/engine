import { MathUtil, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { DisorderedArray } from "../../DisorderedArray";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Basic2DBatcher } from "../../RenderPipeline/Basic2DBatcher";
import { Sprite } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { Logger } from "../../base";

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

  static resetData(renderer: SpriteRenderer): void {
    renderer._verticesData.triangles ||= [];
  }

  static updatePositions(renderer: SpriteRenderer): void {
    const { width, height, sprite, tileMode, tileStretchValue: stretch } = renderer;
    const { positions, uvs, triangles } = renderer._verticesData;
    // Calculate row and column
    const { _posRow: posRow, _posColumn: posColumn, _uvRow: uvRow, _uvColumn: uvColumn } = this;
    posRow.length = posColumn.length = uvRow.length = uvColumn.length = 0;
    tileMode === SpriteTileMode.Adaptive
      ? this._calculateAdaptive(sprite, width, height, stretch, posRow, posColumn, uvRow, uvColumn)
      : this._calculateContinuous(sprite, width, height, posRow, posColumn, uvRow, uvColumn);
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

    const fillDataFunc = (i: number, x: number, y: number, u: number, v: number) => {
      uvs[i] ? uvs[i].set(u, v) : (uvs[i] = new Vector2(u, v));
      positions[i]
        ? positions[i].set(wE0 * x + wE4 * y + wE12, wE1 * x + wE5 * y + wE13, wE2 * x + wE6 * y + wE14)
        : (positions[i] = new Vector3(wE0 * x + wE4 * y + wE12, wE1 * x + wE5 * y + wE13, wE2 * x + wE6 * y + wE14));
    };

    // Assemble position and uv
    const rowLength = posRow.length - 1;
    const columnLength = posColumn.length - 1;
    let positionOffset = 0;
    let trianglesOffset = 0;
    for (let j = 0; j < columnLength; j++) {
      for (let i = 0; i < rowLength; i++) {
        const uvLeft = uvRow.get(2 * i);
        const uvBottom = uvColumn.get(2 * j);
        const uvRight = uvRow.get(2 * i + 1);
        const uvTop = uvColumn.get(2 * j + 1);
        if (isNaN(uvLeft) || isNaN(uvLeft) || isNaN(uvRight) || isNaN(uvTop)) {
          continue;
        }
        triangles[trianglesOffset++] = positionOffset;
        triangles[trianglesOffset++] = positionOffset + 1;
        triangles[trianglesOffset++] = positionOffset + 2;
        triangles[trianglesOffset++] = positionOffset + 2;
        triangles[trianglesOffset++] = positionOffset + 1;
        triangles[trianglesOffset++] = positionOffset + 3;

        const left = posRow.get(i);
        const bottom = posColumn.get(j);
        const right = posRow.get(i + 1);
        const top = posColumn.get(j + 1);
        fillDataFunc(positionOffset++, left, bottom, uvLeft, uvBottom);
        fillDataFunc(positionOffset++, right, bottom, uvRight, uvBottom);
        fillDataFunc(positionOffset++, left, top, uvLeft, uvTop);
        fillDataFunc(positionOffset++, right, top, uvRight, uvTop);
      }
    }

    renderer._verticesData.vertexCount = positionOffset;
    triangles.length = trianglesOffset;

    const { min, max } = renderer._bounds;
    min.set(posRow.get(0), posColumn.get(0), 0);
    max.set(posRow.get(rowLength), posColumn.get(columnLength), 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer): void {}

  private static _calculateAdaptive(
    sprite: Sprite,
    width: number,
    height: number,
    stretch: number,
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
    let uType: TiledType, vType: TiledType;
    let uVertCount: number, vVertCount: number;
    let uRepeatCount: number, vRepeatCount: number;
    if (fixedLR >= width) {
      uVertCount = 3;
      uType = TiledType.Compressed;
    } else {
      if (fixedCW > MathUtil.zeroTolerance) {
        uRepeatCount = (width - fixedLR) / fixedCW;
        uRepeatCount = uRepeatCount % 1 >= stretch ? Math.ceil(uRepeatCount) : Math.floor(uRepeatCount);
        uVertCount = 4 + uRepeatCount - 1;
        uType = TiledType.WithTiled;
      } else {
        uVertCount = 4;
        uType = TiledType.WithoutTiled;
      }
    }

    if (fixedTB >= height) {
      vVertCount = 3;
      vType = TiledType.Compressed;
    } else {
      if (fixedCH > MathUtil.zeroTolerance) {
        vRepeatCount = (height - fixedTB) / fixedCH;
        vRepeatCount = vRepeatCount % 1 >= stretch ? Math.ceil(vRepeatCount) : Math.floor(vRepeatCount);
        vVertCount = 4 + vRepeatCount - 1;
        vType = TiledType.WithTiled;
      } else {
        vVertCount = 4;
        vType = TiledType.WithoutTiled;
      }
    }

    if ((uVertCount - 1) * (vVertCount - 1) * 4 > Basic2DBatcher.MAX_VERTEX_COUNT) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      Logger.warn(`The number of vertices exceeds the upper limit(${Basic2DBatcher.MAX_VERTEX_COUNT}).`);
      return;
    }

    switch (uType) {
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
        scale = width / (fixedLR + uRepeatCount * fixedCW);
        posRow.add(expectWidth * left * scale), posRow.add(fixedL * scale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        for (let i = 0, l = uRepeatCount - 1; i < l; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW * scale);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedR * scale), posRow.add(width - expectWidth * (1 - right) * scale);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      default:
        break;
    }

    switch (vType) {
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
        scale = height / (fixedTB + vRepeatCount * fixedCH);
        posColumn.add(expectHeight * bottom * scale), posColumn.add(fixedB * scale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        for (let i = 0, l = vRepeatCount - 1; i < l; i++) {
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

  private static _calculateContinuous(
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
    let uType: TiledType, vType: TiledType;
    let uVertCount: number, vVertCount: number;
    let uRepeatCount: number, vRepeatCount: number;
    if (fixedLR >= width) {
      uVertCount = 3;
      uType = TiledType.Compressed;
    } else {
      if (fixedCW > MathUtil.zeroTolerance) {
        uRepeatCount = (width - fixedLR) / fixedCW;
        uVertCount = 4 + (uRepeatCount | 0);
        uType = TiledType.WithTiled;
      } else {
        uVertCount = 4;
        uType = TiledType.WithoutTiled;
      }
    }

    if (fixedTB >= height) {
      vVertCount = 3;
      vType = TiledType.Compressed;
    } else {
      if (fixedCH > MathUtil.zeroTolerance) {
        vRepeatCount = (height - fixedTB) / fixedCH;
        vVertCount = 4 + (vRepeatCount | 0);
        vType = TiledType.WithTiled;
      } else {
        vVertCount = 4;
        vType = TiledType.WithoutTiled;
      }
    }

    if ((uVertCount - 1) * (vVertCount - 1) * 4 > Basic2DBatcher.MAX_VERTEX_COUNT) {
      posRow.add(width * left), posRow.add(width * right);
      posColumn.add(height * bottom), posColumn.add(height * top);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      Logger.warn(`The number of vertices exceeds the upper limit(${Basic2DBatcher.MAX_VERTEX_COUNT}).`);
      return;
    }

    switch (uType) {
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
        const countInteger = uRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posRow.add(fixedL + (i + 1) * fixedCW);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedR), posRow.add(width - expectWidth * (1 - right));
        uvRow.add((spriteUV2.x - spriteUV1.x) * (uRepeatCount - countInteger) + spriteUV1.x);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
        break;
      default:
        break;
    }

    switch (vType) {
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
        const countInteger = vRepeatCount | 0;
        for (let i = 0; i < countInteger; i++) {
          posColumn.add(fixedB + (i + 1) * fixedCH);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
        }
        posColumn.add(height - fixedT), posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add((spriteUV2.y - spriteUV1.y) * (vRepeatCount - countInteger) + spriteUV1.y);
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
