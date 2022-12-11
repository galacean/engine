import { Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";

/**
 * @internal
 */
@StaticInterfaceImplement<IAssembler>()
export class TiledSpriteAssembler {
  static _worldMatrix: Matrix = new Matrix();
  static resetData(renderer: SpriteRenderer): void {
    const { _renderData: renderData } = renderer;
    renderData.triangles = [];
  }

  static updatePositions(renderer: SpriteRenderer): void {
    const { width, height, sprite } = renderer;
    const { positions, uvs, triangles } = renderer._renderData;
    const { border } = sprite;
    const spriteUVs = sprite._getUVs();
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
    //    [···]
    //      |
    //     [4]
    //      |
    //     [3]
    //      |
    //     [2]
    //      |
    //     [1]
    //      |
    // row [0] - [1] - [2] - [3] - [4] - [···]
    //    column
    // ------------------------
    // Calculate row and column.
    let positionRow: number[], positionColumn: number[];
    let uvRow: number[], uvColumn: number[];
    if (fixedLeft + fixedRight >= width) {
      const widthScale = width / (fixedLeft + fixedRight);
      positionRow = [
        expectWidth * left * widthScale,
        fixedLeft * widthScale,
        width - expectWidth * (1 - right) * widthScale
      ];
      uvRow = [spriteUVs[0].x, spriteUVs[1].x, spriteUVs[2].x, spriteUVs[3].x];
    } else {
      positionRow = [expectWidth * left, fixedLeft];
      uvRow = [spriteUVs[0].x, spriteUVs[1].x];
      const fixedCenterWidth = expectWidth - fixedLeft - fixedRight;
      if (fixedCenterWidth > 0) {
        uvRow.push(spriteUVs[1].x);
        const count = Math.ceil((width - fixedLeft - fixedRight) / fixedCenterWidth) - 1;
        const factor = (width - fixedLeft - fixedRight - fixedCenterWidth * count) / fixedCenterWidth;
        for (let i = 0; i < count; i++) {
          positionRow.push(fixedLeft + (i + 1) * fixedCenterWidth);
          uvRow.push(spriteUVs[2].x, spriteUVs[1].x);
        }
        uvRow.push((spriteUVs[2].x - spriteUVs[1].x) * factor + spriteUVs[1].x);
      } else {
        uvRow.push(NaN, NaN);
      }
      positionRow.push(width - fixedRight, width - expectWidth * (1 - right));
      uvRow.push(spriteUVs[2].x, spriteUVs[3].x);
    }

    if (fixedTop + fixedBottom > height) {
      const heightScale = height / (fixedTop + fixedBottom);
      positionColumn = [
        expectHeight * bottom * heightScale,
        fixedBottom * heightScale,
        height - expectHeight * (1 - top) * heightScale
      ];
      uvColumn = [spriteUVs[0].y, spriteUVs[1].y, spriteUVs[2].y, spriteUVs[3].y];
    } else {
      positionColumn = [expectHeight * bottom, fixedBottom];
      uvColumn = [spriteUVs[0].y, spriteUVs[1].y];
      const fixedCenterHeight = expectHeight - fixedTop - fixedBottom;
      if (fixedCenterHeight > 0) {
        uvColumn.push(spriteUVs[1].y);
        const count = Math.ceil((height - fixedTop - fixedBottom) / fixedCenterHeight) - 1;
        const factor = (height - fixedTop - fixedBottom - fixedCenterHeight * count) / fixedCenterHeight;
        for (let i = 0; i < count; i++) {
          positionColumn.push(fixedBottom + (i + 1) * fixedCenterHeight);
          uvColumn.push(spriteUVs[2].y, spriteUVs[1].y);
        }
        uvColumn.push((spriteUVs[2].y - spriteUVs[1].y) * factor + spriteUVs[1].y);
      } else {
        uvColumn.push(NaN, NaN);
      }
      positionColumn.push(height - fixedTop, height - expectHeight * (1 - top));
      uvColumn.push(spriteUVs[2].y, spriteUVs[3].y);
    }

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
    (wE[0] = pWE[0] * sx), (wE[1] = pWE[1] * sx), (wE[2] = pWE[2] * sx);
    (wE[4] = pWE[4] * sy), (wE[5] = pWE[5] * sy), (wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    wE[12] = pWE[12] - localTransX * wE[0] - localTransY * wE[4];
    wE[13] = pWE[13] - localTransX * wE[1] - localTransY * wE[5];
    wE[14] = pWE[14] - localTransX * wE[2] - localTransY * wE[6];

    // Assemble position and uv.
    const rowLength = positionRow.length - 1;
    const columnLength = positionColumn.length - 1;

    for (let i = positions.length; i < rowLength * columnLength * 4; i++) {
      positions.push(new Vector3());
      uvs.push(new Vector2());
    }
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

        const left = positionRow[i];
        const bottom = positionColumn[j];
        const right = positionRow[i + 1];
        const top = positionColumn[j + 1];
        uvs[positionOffset].set(uvLeft, uvBottom);
        positions[positionOffset++].set(
          wE[0] * left + wE[4] * bottom + wE[12],
          wE[1] * left + wE[5] * bottom + wE[13],
          wE[2] * left + wE[6] * bottom + wE[14]
        );

        uvs[positionOffset].set(uvRight, uvBottom);
        positions[positionOffset++].set(
          wE[0] * right + wE[4] * bottom + wE[12],
          wE[1] * right + wE[5] * bottom + wE[13],
          wE[2] * right + wE[6] * bottom + wE[14]
        );

        uvs[positionOffset].set(uvLeft, uvTop);
        positions[positionOffset++].set(
          wE[0] * left + wE[4] * top + wE[12],
          wE[1] * left + wE[5] * top + wE[13],
          wE[2] * left + wE[6] * top + wE[14]
        );

        uvs[positionOffset].set(uvRight, uvTop);
        positions[positionOffset++].set(
          wE[0] * right + wE[4] * top + wE[12],
          wE[1] * right + wE[5] * top + wE[13],
          wE[2] * right + wE[6] * top + wE[14]
        );
      }
    }

    renderer._renderData.vertexCount = positionOffset;
    triangles.length = trianglesOffset;

    const { min, max } = renderer._bounds;
    min.set(positionRow[0], positionColumn[0], 0);
    max.set(positionRow[rowLength], positionColumn[columnLength], 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer): void {}
}
