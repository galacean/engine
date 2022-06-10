import { Color, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSliced {
  static _worldMatrix: Matrix = new Matrix();
  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    const vertexCount = 16;
    if (!renderer._renderData) {
      renderer._renderData = {
        vertexCount: vertexCount,
        positions: [],
        uvs: [],
        triangles: [],
        color: new Color()
      };
    }
    const { positions, uvs } = renderer._renderData;
    if (positions.length < vertexCount) {
      for (let i = positions.length; i < vertexCount; i++) {
        positions.push(new Vector3());
        uvs.push(new Vector2());
      }
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
    // Update local positions.
    const [top, left, right, bottom] = sprite.edges;
    const expectWidth = sprite.width / SpriteRenderer._pixelPerUnit;
    const expectHeight = sprite.height / SpriteRenderer._pixelPerUnit;
    const fixedTop = expectWidth * border.x;
    const fixedLeft = expectWidth * border.y;
    const fixedRight = expectHeight * border.z;
    const fixedBottom = expectHeight * border.w;
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
        height - expectHeight * (1 - top) * heightScale,
        fixedBottom * heightScale,
        fixedBottom * heightScale,
        expectHeight * bottom * heightScale
      ];
    } else {
      column = [height - expectHeight * (1 - top), height - fixedTop, fixedBottom, expectHeight * bottom];
    }

    // Update renderer's worldMatrix.
    const { x: pivotX, y: pivotY } = renderer.sprite.pivot;
    const localTransX = renderer.width * pivotX;
    const localTransY = renderer.height * pivotY;
    const { _worldMatrix: worldMatrix } = SpriteSliced;
    // Parent's worldMatrix.
    const { elements: pE } = renderer.entity.transform.worldMatrix;
    // Renderer's worldMatrix.
    const { elements: wE } = worldMatrix;
    const sx = renderer.flipX ? -1 : 1;
    const sy = renderer.flipY ? -1 : 1;
    (wE[0] = pE[0] * sx), (wE[1] = pE[1] * sx), (wE[2] = pE[2] * sx);
    (wE[4] = pE[4] * sy), (wE[5] = pE[5] * sy), (wE[6] = pE[6] * sy);
    (wE[8] = pE[8]), (wE[9] = pE[9]), (wE[10] = pE[10]);
    wE[12] = pE[12] - localTransX * wE[0] - localTransY * wE[4];
    wE[13] = pE[13] - localTransX * wE[1] - localTransY * wE[5];
    wE[14] = pE[14];

    // Assemble position and uv
    let vertexCount = 0;
    let realICount = 0;
    for (let i = 0; i < 4; i++) {
      const rowValue = row[i];
      const rowU = uvsSliced[i].x;
      for (let j = 0; j < 4; j++) {
        const columnValue = column[j];
        positions[vertexCount].setValue(
          wE[0] * rowValue + wE[4] * columnValue + wE[12],
          wE[1] * rowValue + wE[5] * columnValue + wE[13],
          wE[2] * rowValue + wE[6] * columnValue + wE[14]
        );
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
    min.setValue(row[0], column[3], 0);
    max.setValue(row[3], column[0], 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {}

  static updateColor(renderer: SpriteRenderer): void {
    renderer.color.cloneTo(renderer._renderData.color);
  }
}
