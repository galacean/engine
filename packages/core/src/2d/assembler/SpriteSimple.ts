import { Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSimple {
  static _rectangleTriangles: number[] = [0, 1, 2, 2, 1, 3];
  static _worldMatrix: Matrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    if (!renderer._renderData) {
      renderer._renderData = {
        vertexCount: 4,
        positions: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
        uvs: [new Vector2(), new Vector2(), new Vector2(), new Vector2()],
        triangles: SpriteSimple._rectangleTriangles,
        color: renderer instanceof SpriteRenderer ? renderer.color : null
      };
    } else {
      renderer._renderData.vertexCount = 4;
      renderer._renderData.triangles = SpriteSimple._rectangleTriangles;
    }
  }

  static updateData(renderer: SpriteRenderer | SpriteMask): void {}

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    // Update ModelMatrix.
    const { width, height } = renderer;
    if (width === 0 || height === 0) {
      return;
    }

    const { x: pivotX, y: pivotY } = renderer.sprite.pivot;
    const { _worldMatrix: worldMatrix } = SpriteSimple;
    // Parent's worldMatrix.
    const { elements: pE } = renderer.entity.transform.worldMatrix;
    // Renderer's worldMatrix;
    const { elements: wE } = worldMatrix;
    const sx = renderer.flipX ? -width : width;
    const sy = renderer.flipY ? -height : height;
    (wE[0] = pE[0] * sx), (wE[1] = pE[1] * sx), (wE[2] = pE[2] * sx);
    (wE[4] = pE[4] * sy), (wE[5] = pE[5] * sy), (wE[6] = pE[6] * sy);
    (wE[8] = pE[8]), (wE[9] = pE[9]), (wE[10] = pE[10]);
    wE[12] = pE[12] - pivotX * wE[0] - pivotY * wE[4];
    wE[13] = pE[13] - pivotX * wE[1] - pivotY * wE[5];
    wE[14] = pE[14];

    // ---------------
    //  2 - 3
    //  |   |
    //  0 - 1
    // ---------------
    // Update positions.
    const [left, bottom, right, top] = renderer.sprite.edges;
    const { positions } = renderer._renderData;
    // Left-Bottom.
    positions[0].setValue(
      wE[0] * left + wE[4] * bottom + wE[12],
      wE[1] * left + wE[5] * bottom + wE[13],
      wE[2] * left + wE[6] * bottom + wE[14]
    );

    // Right-Bottom.
    positions[1].setValue(
      wE[0] * right + wE[4] * bottom + wE[12],
      wE[1] * right + wE[5] * bottom + wE[13],
      wE[2] * right + wE[6] * bottom + wE[14]
    );

    // Left-Top.
    positions[2].setValue(
      wE[0] * left + wE[4] * top + wE[12],
      wE[1] * left + wE[5] * top + wE[13],
      wE[2] * left + wE[6] * top + wE[14]
    );

    // Right-Top.
    positions[3].setValue(
      wE[0] * right + wE[4] * top + wE[12],
      wE[1] * right + wE[5] * top + wE[13],
      wE[2] * right + wE[6] * top + wE[14]
    );

    // Update bounds.
    const { min, max } = renderer._bounds;
    min.setValue(left, bottom, 0);
    max.setValue(right, top, 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {
    const spriteUVs = renderer.sprite.uvs;
    const renderUVs = renderer._renderData.uvs;
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];
    renderUVs[0].setValue(left, bottom);
    renderUVs[1].setValue(right, bottom);
    renderUVs[2].setValue(left, top);
    renderUVs[3].setValue(right, top);
  }
}
