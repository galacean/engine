import { MathUtil, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
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
  static resetData(renderer: SpriteRenderer): void {
    renderer._verticesData.triangles ||= [];
  }

  static updatePositions(renderer: SpriteRenderer): void {
    const { width, height, sprite, tileMode, tileStretchValue: stretch } = renderer;
    const { positions, uvs, triangles } = renderer._verticesData;
    // Calculate row and column.
    let posRow: number[] = [];
    let posColumn: number[] = [];
    let uvRow: number[] = [];
    let uvColumn: number[] = [];
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
        const uvLeft = uvRow[2 * i];
        const uvBottom = uvColumn[2 * j];
        const uvRight = uvRow[2 * i + 1];
        const uvTop = uvColumn[2 * j + 1];
        if (isNaN(uvLeft) || isNaN(uvLeft) || isNaN(uvRight) || isNaN(uvTop)) {
          continue;
        }
        triangles[trianglesOffset++] = positionOffset;
        triangles[trianglesOffset++] = positionOffset + 1;
        triangles[trianglesOffset++] = positionOffset + 2;
        triangles[trianglesOffset++] = positionOffset + 2;
        triangles[trianglesOffset++] = positionOffset + 1;
        triangles[trianglesOffset++] = positionOffset + 3;

        const left = posRow[i];
        const bottom = posColumn[j];
        const right = posRow[i + 1];
        const top = posColumn[j + 1];
        fillDataFunc(positionOffset++, left, bottom, uvLeft, uvBottom);
        fillDataFunc(positionOffset++, right, bottom, uvRight, uvBottom);
        fillDataFunc(positionOffset++, left, top, uvLeft, uvTop);
        fillDataFunc(positionOffset++, right, top, uvRight, uvTop);
      }
    }

    renderer._verticesData.vertexCount = positionOffset;
    triangles.length = trianglesOffset;

    const { min, max } = renderer._bounds;
    min.set(posRow[0], posColumn[0], 0);
    max.set(posRow[rowLength], posColumn[columnLength], 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer): void {}

  private static _calculateAdaptive(
    sprite: Sprite,
    width: number,
    height: number,
    stretch: number,
    posRow: number[],
    posColumn: number[],
    uvRow: number[],
    uvColumn: number[]
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
      posRow.push(
        expectWidth * left * widthScale,
        fixedLeft * widthScale,
        width - expectWidth * (1 - right) * widthScale
      );
      uvRow.push(spriteUV0.x, spriteUV1.x, spriteUV2.x, spriteUV3.x);
    } else {
      const fixedCenterW = expectWidth - fixedLeftAndRight;
      count = fixedCenterW > MathUtil.zeroTolerance ? (width - fixedLeftAndRight) / fixedCenterW : 0;
      count = count % 1 >= stretch ? Math.ceil(count) : Math.floor(count);
      if (count === 0) {
        posRow.push(expectWidth * left, fixedLeft, width - fixedRight, width - expectWidth * (1 - right));
        uvRow.push(spriteUV0.x, spriteUV1.x, NaN, NaN, spriteUV2.x, spriteUV3.x);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / 16 - 3) {
        widthScale = width / (fixedLeftAndRight + count * fixedCenterW);
        posRow.push(expectWidth * left * widthScale, fixedLeft * widthScale);
        uvRow.push(spriteUV0.x, spriteUV1.x, spriteUV1.x);
        for (let i = 0, l = count - 1; i < l; i++) {
          posRow.push(fixedLeft + (i + 1) * fixedCenterW * widthScale);
          uvRow.push(spriteUV2.x, spriteUV1.x);
        }
        posRow.push(width - fixedRight * widthScale, width - expectWidth * (1 - right) * widthScale);
        uvRow.push(spriteUV2.x, spriteUV2.x, spriteUV3.x);
      } else {
        posRow.push(width * left, width * right);
        posColumn.push(height * bottom, height * top);
        uvRow.push(spriteUV0.x, spriteUV3.x);
        uvColumn.push(spriteUV0.y, spriteUV3.y);
        return;
      }
    }

    const fixedTop = expectHeight * border.w;
    const fixedBottom = expectHeight * border.y;
    const fixedTopAndBottom = fixedTop + fixedBottom;
    let heightScale: number = 1;
    if (fixedTopAndBottom > height) {
      heightScale = height / fixedTopAndBottom;
      posColumn.push(
        expectHeight * bottom * heightScale,
        fixedBottom * heightScale,
        height - expectHeight * (1 - top) * heightScale
      );
      uvColumn.push(spriteUV0.y, spriteUV1.y, spriteUV2.y, spriteUV3.y);
    } else {
      const fixedCenterH = expectHeight - fixedTopAndBottom;
      count = fixedCenterH > MathUtil.zeroTolerance ? (height - fixedTopAndBottom) / fixedCenterH : 0;
      count = count % 1 >= stretch ? Math.ceil(count) : Math.floor(count);
      if (count === 0) {
        posColumn.push(expectHeight * bottom, fixedBottom, height - fixedTop, height - expectHeight * (1 - top));
        uvColumn.push(spriteUV0.y, spriteUV1.y, NaN, NaN, spriteUV2.y, spriteUV3.y);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / posRow.length / 4 - 3) {
        heightScale = height / (fixedTopAndBottom + count * fixedCenterH);
        posColumn.push(expectHeight * bottom * heightScale, fixedBottom * heightScale);
        uvColumn.push(spriteUV0.y, spriteUV1.y, spriteUV1.y);
        for (let i = 0, l = count - 1; i < l; i++) {
          posColumn.push(fixedBottom + (i + 1) * fixedCenterH * heightScale);
          uvColumn.push(spriteUV2.y, spriteUV1.y);
        }
        posColumn.push(height - fixedTop * heightScale, height - expectHeight * (1 - top) * heightScale);
        uvColumn.push(spriteUV2.y, spriteUV2.y, spriteUV3.y);
      } else {
        posRow.length = uvRow.length = 0;
        posRow.push(width * left, width * right);
        uvRow.push(spriteUV0.x, spriteUV3.x);
        posColumn.push(height * bottom, height * top);
        uvColumn.push(spriteUV0.y, spriteUV3.y);
      }
    }
  }

  private static _calculateContinuous(
    sprite: Sprite,
    width: number,
    height: number,
    posRow: number[],
    posColumn: number[],
    uvRow: number[],
    uvColumn: number[]
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
      posRow.push(
        expectWidth * left * widthScale,
        fixedLeft * widthScale,
        width - expectWidth * (1 - right) * widthScale
      );
      uvRow.push(spriteUV0.x, spriteUV1.x, spriteUV2.x, spriteUV3.x);
    } else {
      const fixedCenterW = expectWidth - fixedLeftAndRight;
      const count = fixedCenterW > zeroTolerance ? (width - fixedLeftAndRight) / fixedCenterW : 0;
      if (count === 0) {
        posRow.push(expectWidth * left, fixedLeft, width - fixedRight, width - expectWidth * (1 - right));
        uvRow.push(spriteUV0.x, spriteUV1.x, NaN, NaN, spriteUV2.x, spriteUV3.x);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / 16 - 4) {
        posRow.push(expectWidth * left, fixedLeft);
        uvRow.push(spriteUV0.x, spriteUV1.x, spriteUV1.x);
        const countInteger = count | 0;
        for (let i = 0; i < countInteger; i++) {
          posRow.push(fixedLeft + (i + 1) * fixedCenterW);
          uvRow.push(spriteUV2.x, spriteUV1.x);
        }
        posRow.push(width - fixedRight, width - expectWidth * (1 - right));
        uvRow.push((spriteUV2.x - spriteUV1.x) * (count - countInteger) + spriteUV1.x, spriteUV2.x, spriteUV3.x);
      } else {
        posRow.push(width * left, width * right);
        posColumn.push(height * bottom, height * top);
        uvRow.push(spriteUV0.x, spriteUV3.x);
        uvColumn.push(spriteUV0.y, spriteUV3.y);
        return;
      }
    }

    const fixedTop = expectHeight * border.w;
    const fixedBottom = expectHeight * border.y;
    const fixedTopAndBottom = fixedTop + fixedBottom;
    if (fixedTopAndBottom >= height) {
      const heightScale = height / fixedTopAndBottom;
      posColumn.push(
        expectHeight * bottom * heightScale,
        fixedBottom * heightScale,
        height - expectHeight * (1 - top) * heightScale
      );
      uvColumn.push(spriteUV0.y, spriteUV1.y, spriteUV2.y, spriteUV3.y);
    } else {
      const fixedCenterH = expectHeight - fixedTopAndBottom;
      const count = fixedCenterH > zeroTolerance ? (height - fixedTopAndBottom) / fixedCenterH : 0;
      if (count === 0) {
        posColumn.push(expectHeight * bottom, fixedBottom, height - fixedTop, height - expectHeight * (1 - top));
        uvColumn.push(spriteUV0.y, spriteUV1.y, NaN, NaN, spriteUV2.y, spriteUV3.y);
      } else if (count <= Basic2DBatcher.MAX_VERTEX_COUNT / posRow.length / 4 - 4) {
        posColumn.push(expectHeight * bottom, fixedBottom);
        uvColumn.push(spriteUV0.y, spriteUV1.y, spriteUV1.y);
        const countInteger = count | 0;
        for (let i = 0; i < countInteger; i++) {
          posColumn.push(fixedBottom + (i + 1) * fixedCenterH);
          uvColumn.push(spriteUV2.y, spriteUV1.y);
        }
        posColumn.push(height - fixedTop, height - expectHeight * (1 - top));
        uvColumn.push((spriteUV2.y - spriteUV1.y) * (count - countInteger) + spriteUV1.y, spriteUV2.y, spriteUV3.y);
      } else {
        posRow.length = uvRow.length = 0;
        posRow.push(width * left, width * right);
        uvRow.push(spriteUV0.x, spriteUV3.x);
        posColumn.push(height * bottom, height * top);
        uvColumn.push(spriteUV0.y, spriteUV3.y);
      }
    }
  }
}
