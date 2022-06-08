import { Color, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { RenderData2D } from "../data/RenderData2D";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSimple {
  static _rectangleTriangles: number[] = [0, 2, 1, 2, 0, 3];
  static _worldMatrix: Matrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    const renderData = (renderer._renderData = new RenderData2D());
    renderData.positions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    renderData.uvs = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
    renderData.triangles = SpriteSimple._rectangleTriangles;
    renderData.color = new Color();
  }

  static updateData(renderer: SpriteRenderer | SpriteMask): void {}

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    // Update ModelMatrix.
    const { width, height, pivot } = renderer;
    const { _worldMatrix: worldMatrix } = SpriteSimple;
    // Parent transform.
    const { elements: parentE } = renderer.entity.transform.worldMatrix;
    const { elements: modelE } = worldMatrix;
    const sx = renderer.flipX ? -width : width;
    const sy = renderer.flipY ? -height : height;
    (modelE[0] = parentE[0] * sx), (modelE[1] = parentE[1] * sx), (modelE[2] = parentE[2] * sx);
    (modelE[4] = parentE[4] * sy), (modelE[5] = parentE[5] * sy), (modelE[6] = parentE[6] * sy);
    (modelE[8] = parentE[8]), (modelE[9] = parentE[9]), (modelE[10] = parentE[10]);
    modelE[12] = parentE[12] - pivot.x * modelE[0] - pivot.y * modelE[4];
    modelE[13] = parentE[13] - pivot.x * modelE[1] - pivot.y * modelE[5];
    modelE[14] = parentE[14];

    // Update positions.
    const [top, left, right, bottom] = renderer.sprite.edges;
    const { positions: position } = renderer._renderData;
    // Left-top.
    position[0].setValue(left, top, 0).transformToVec3(worldMatrix);
    // Right-top.
    position[1].setValue(right, top, 0).transformToVec3(worldMatrix);
    // Right-bottom.
    position[2].setValue(right, bottom, 0).transformToVec3(worldMatrix);
    // Left-bottom.
    position[3].setValue(left, bottom, 0).transformToVec3(worldMatrix);

    // Update bounds.
    const { min, max } = renderer._bounds;
    min.setValue(left, bottom, 0);
    max.setValue(right, top, 0);
    renderer._bounds.transform(worldMatrix);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {
    const spriteUVs = renderer.sprite.uvs;
    const renderUVs = renderer._renderData.uvs;
    for (let i = spriteUVs.length - 1; i >= 0; i--) {
      spriteUVs[i].cloneTo(renderUVs[i]);
    }
  }

  static updateColor(renderer: SpriteRenderer) {
    renderer.color.cloneTo(renderer._renderData.color);
  }
}
