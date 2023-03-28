import { MathUtil, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { DisorderedArray } from "../../DisorderedArray";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Basic2DBatcher } from "../../RenderPipeline/Basic2DBatcher";
import { Sprite } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";

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
    // Calculate row and column.
    const { _posRow: posRow, _posColumn: posColumn, _uvRow: uvRow, _uvColumn: uvColumn } = this;
    posRow.length = posColumn.length = uvRow.length = uvColumn.length = 0;
    tileMode === SpriteTileMode.Adaptive
      ? this._calculateAdaptive(sprite, width, height, stretch, posRow, posColumn, uvRow, uvColumn)
      : this._calculateContinuous(sprite, width, height, posRow, posColumn, uvRow, uvColumn);
    // Update renderer's worldMatrix.
    const { x: pivotX, y: pivotY } = renderer.sprite.pivot;
    const localTransX = renderer.width * pivotX;
    const localTransY = renderer.height * pivotY;
    // Renderer's worldMatrix.
    const { _worldMatrix: worldMatrix } = TiledSpriteAssembler;
    const { elements: wE } = worldMatrix;
    // Parent's worldMatrix.
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

    // Assemble position and uv.
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
    const fixedLeft = expectWidth * border.x;
    const fixedRight = expectWidth * border.z;
    const fixedLeftAndRight = fixedLeft + fixedRight;
    let widthScale: number = 1;
    let count: number = 0;
    if (fixedLeftAndRight >= width) {
      widthScale = width / fixedLeftAndRight;
      posRow.add(expectWidth * left * widthScale), posRow.add(fixedLeft * widthScale);
      posRow.add(width - expectWidth * (1 - right) * widthScale);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
    } else {
      const fixedCenterW = expectWidth - fixedLeftAndRight;
      count = fixedCenterW > MathUtil.zeroTolerance ? (width - fixedLeftAndRight) / fixedCenterW : 0;
      count = count % 1 >= stretch ? Math.ceil(count) : Math.floor(count);
      if (count === 0) {
        posRow.add(expectWidth * left), posRow.add(fixedLeft), posRow.add(width - fixedRight);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / 16 - 3) {
        widthScale = width / (fixedLeftAndRight + count * fixedCenterW);
        posRow.add(expectWidth * left * widthScale), posRow.add(fixedLeft * widthScale);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        for (let i = 0, l = count - 1; i < l; i++) {
          posRow.add(fixedLeft + (i + 1) * fixedCenterW * widthScale);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedRight * widthScale), posRow.add(width - expectWidth * (1 - right) * widthScale);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
      } else {
        posRow.add(width * left), posRow.add(width * right);
        posColumn.add(height * bottom), posColumn.add(height * top);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
        return;
      }
    }

    const fixedTop = expectHeight * border.w;
    const fixedBottom = expectHeight * border.y;
    const fixedTopAndBottom = fixedTop + fixedBottom;
    let heightScale: number = 1;
    if (fixedTopAndBottom > height) {
      heightScale = height / fixedTopAndBottom;
      posColumn.add(expectHeight * bottom * heightScale), posColumn.add(fixedBottom * heightScale);
      posColumn.add(height - expectHeight * (1 - top) * heightScale);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
    } else {
      const fixedCenterH = expectHeight - fixedTopAndBottom;
      count = fixedCenterH > MathUtil.zeroTolerance ? (height - fixedTopAndBottom) / fixedCenterH : 0;
      count = count % 1 >= stretch ? Math.ceil(count) : Math.floor(count);
      if (count === 0) {
        posColumn.add(expectHeight * bottom), posColumn.add(fixedBottom), posColumn.add(height - fixedTop);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / posRow.length / 4 - 3) {
        heightScale = height / (fixedTopAndBottom + count * fixedCenterH);
        posColumn.add(expectHeight * bottom * heightScale), posColumn.add(fixedBottom * heightScale);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        for (let i = 0, l = count - 1; i < l; i++) {
          posColumn.add(fixedBottom + (i + 1) * fixedCenterH * heightScale);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
        }
        posColumn.add(height - fixedTop * heightScale), posColumn.add(height - expectHeight * (1 - top) * heightScale);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
      } else {
        posRow.length = uvRow.length = 0;
        posRow.add(width * left), posRow.add(width * right);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
        posColumn.add(height * bottom), posColumn.add(height * top);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      }
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
    const { zeroTolerance } = MathUtil;
    const { border } = sprite;
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    const [spriteUV0, spriteUV1, spriteUV2, spriteUV3] = sprite._getUVs();
    const { width: expectWidth, height: expectHeight } = sprite;
    const fixedLeft = expectWidth * border.x;
    const fixedRight = expectWidth * border.z;
    const fixedLeftAndRight = fixedLeft + fixedRight;
    if (fixedLeftAndRight >= width) {
      const widthScale = width / fixedLeftAndRight;
      posRow.add(expectWidth * left * widthScale), posRow.add(fixedLeft * widthScale);
      posRow.add(width - expectWidth * (1 - right) * widthScale);
      uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
    } else {
      const fixedCenterW = expectWidth - fixedLeftAndRight;
      const count = fixedCenterW > zeroTolerance ? (width - fixedLeftAndRight) / fixedCenterW : 0;
      if (count === 0) {
        posRow.add(expectWidth * left), posRow.add(fixedLeft), posRow.add(width - fixedRight);
        posRow.add(width - expectWidth * (1 - right));
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(NaN), uvRow.add(NaN);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / 16 - 4) {
        posRow.add(expectWidth * left), posRow.add(fixedLeft);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV1.x), uvRow.add(spriteUV1.x);
        const countInteger = count | 0;
        for (let i = 0; i < countInteger; i++) {
          posRow.add(fixedLeft + (i + 1) * fixedCenterW);
          uvRow.add(spriteUV2.x), uvRow.add(spriteUV1.x);
        }
        posRow.add(width - fixedRight), posRow.add(width - expectWidth * (1 - right));
        uvRow.add((spriteUV2.x - spriteUV1.x) * (count - countInteger) + spriteUV1.x);
        uvRow.add(spriteUV2.x), uvRow.add(spriteUV3.x);
      } else {
        posRow.add(width * left), posRow.add(width * right);
        posColumn.add(height * bottom), posColumn.add(height * top);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
        return;
      }
    }

    const fixedTop = expectHeight * border.w;
    const fixedBottom = expectHeight * border.y;
    const fixedTopAndBottom = fixedTop + fixedBottom;
    if (fixedTopAndBottom >= height) {
      const heightScale = height / fixedTopAndBottom;
      posColumn.add(expectHeight * bottom * heightScale), posColumn.add(fixedBottom * heightScale);
      posColumn.add(height - expectHeight * (1 - top) * heightScale);
      uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
    } else {
      const fixedCenterH = expectHeight - fixedTopAndBottom;
      const count = fixedCenterH > zeroTolerance ? (height - fixedTopAndBottom) / fixedCenterH : 0;
      if (count === 0) {
        posColumn.add(expectHeight * bottom), posColumn.add(fixedBottom), posColumn.add(height - fixedTop);
        posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(NaN), uvColumn.add(NaN);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / posRow.length / 4 - 4) {
        posColumn.add(expectHeight * bottom), posColumn.add(fixedBottom);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV1.y), uvColumn.add(spriteUV1.y);
        const countInteger = count | 0;
        for (let i = 0; i < countInteger; i++) {
          posColumn.add(fixedBottom + (i + 1) * fixedCenterH);
          uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV1.y);
        }
        posColumn.add(height - fixedTop), posColumn.add(height - expectHeight * (1 - top));
        uvColumn.add((spriteUV2.y - spriteUV1.y) * (count - countInteger) + spriteUV1.y);
        uvColumn.add(spriteUV2.y), uvColumn.add(spriteUV3.y);
      } else {
        posRow.length = uvRow.length = 0;
        posRow.add(width * left), posRow.add(width * right);
        uvRow.add(spriteUV0.x), uvRow.add(spriteUV3.x);
        posColumn.add(height * bottom), posColumn.add(height * top);
        uvColumn.add(spriteUV0.y), uvColumn.add(spriteUV3.y);
      }
    }
  }
}
