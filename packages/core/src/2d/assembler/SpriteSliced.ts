import { Color, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { DisorderedArray } from "../../DisorderedArray";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSliced {
  static _worldMatrix: Matrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    if (!renderer._renderData) {
      renderer._renderData = {
        vertexCount: 16,
        positions: [
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3(),
          new Vector3()
        ],
        uvs: [
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2(),
          new Vector2()
        ],
        triangles: new Array<number>(),
        color: new Color()
      };
    }
  }

  static updateData(renderer: SpriteRenderer | SpriteMask): void {}

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    const { _renderData: renderData } = renderer;
    if (!renderData) {
      SpriteSliced.resetData(renderer);
    }
    // Update ModelMatrix.
    const { width, height, sprite } = renderer;
    const { positions, uvs, triangles } = renderer._renderData;
    const { border, uvsSliced } = sprite;
    // Update positions.
    const [top, left, right, bottom] = sprite.edges;
    const expectWidth = sprite.width / SpriteRenderer._pixelPerUnit;
    const expectHeight = sprite.height / SpriteRenderer._pixelPerUnit;
    const fixedTop = expectWidth * border.x;
    const fixedLeft = expectWidth * border.y;
    const fixedRight = expectHeight * border.z;
    const fixedBottom = expectHeight * border.w;
    let row: number[], column: number[], iCount: number, jCount: number;
    if (fixedLeft + fixedRight > width) {
      iCount = 3;
      const widthScale = width / (fixedLeft + fixedRight);
      row = [expectWidth * left * widthScale, fixedLeft * widthScale, width - expectWidth * (1 - right) * widthScale];
    } else {
      iCount = 4;
      row = [expectWidth * left, fixedLeft, width - fixedRight, width - expectWidth * (1 - right)];
    }

    if (fixedTop + fixedBottom > height) {
      const heightScale = height / (fixedTop + fixedBottom);
      column = [
        height - expectHeight * (1 - top) * heightScale,
        fixedBottom * heightScale,
        expectHeight * bottom * heightScale
      ];
      jCount = 3;
    } else {
      column = [height - expectHeight * (1 - top), height - fixedTop, fixedBottom, expectHeight * bottom];
      jCount = 4;
    }

    SpriteSliced.updateWorldMatrix(renderer);
    const { _worldMatrix: worldMatrix } = SpriteSliced;
    let vertexCount = 0;
    let realICount: number = 0;
    for (let i = 0; i < iCount; i++) {
      const rowValue = row[i];
      if (i > 0 && rowValue === row[i - 1]) {
        continue;
      }
      const rowU = uvsSliced[i].x;
      for (let j = 0; j < jCount; j++) {
        if (j >= 0 && column[j] === column[j - 1]) {
          continue;
        }
        positions[vertexCount].setValue(rowValue, column[j], 0).transformToVec3(worldMatrix);
        uvs[vertexCount].setValue(rowU, uvsSliced[j].y);
        ++vertexCount;
      }
      ++realICount;
    }

    const realJCount = vertexCount / realICount;
    let indexOffset = 0;
    for (let i = 0; i < realICount - 1; ++i) {
      for (let j = 0; j < realJCount - 1; ++j) {
        const start = i * realJCount + j;
        triangles[indexOffset++] = start;
        triangles[indexOffset++] = start + 1;
        triangles[indexOffset++] = start + realJCount;
        triangles[indexOffset++] = start + 1;
        triangles[indexOffset++] = start + realJCount + 1;
        triangles[indexOffset++] = start + realJCount;
      }
    }
    renderer._renderData.vertexCount = realICount * realJCount;
    triangles.length = (realICount - 1) * (realJCount - 1) * 6;

    // Update bounds.
    const { min, max } = renderer._bounds;
    min.setValue(row[0], column[jCount - 1], 0);
    max.setValue(row[iCount - 1], column[0], 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {}

  static updateColor(renderer: SpriteRenderer): void {
    renderer.color.cloneTo(renderer._renderData.color);
  }

  private static updateWorldMatrix(renderer: SpriteRenderer | SpriteMask): void {
    const { x: pivotX, y: pivotY } = renderer.sprite.pivot;
    const localTransX = renderer.width * pivotX;
    const localTransY = renderer.height * pivotY;
    const { _worldMatrix: worldMatrix } = SpriteSliced;
    // Parent transform.
    const { elements: parentE } = renderer.entity.transform.worldMatrix;
    const { elements: modelE } = worldMatrix;
    const sx = renderer.flipX ? -1 : 1;
    const sy = renderer.flipY ? -1 : 1;
    (modelE[0] = parentE[0] * sx), (modelE[1] = parentE[1] * sx), (modelE[2] = parentE[2] * sx);
    (modelE[4] = parentE[4] * sy), (modelE[5] = parentE[5] * sy), (modelE[6] = parentE[6] * sy);
    (modelE[8] = parentE[8]), (modelE[9] = parentE[9]), (modelE[10] = parentE[10]);
    modelE[12] = parentE[12] - localTransX * modelE[0] - localTransY * modelE[4];
    modelE[13] = parentE[13] - localTransX * modelE[1] - localTransY * modelE[5];
    modelE[14] = parentE[14];
  }
}
