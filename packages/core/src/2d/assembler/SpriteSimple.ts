import { Color, Matrix, Vector2, Vector3 } from "@oasis-engine/math";
import { RenderData2D } from "../data/RenderData2D";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSimple {
  static _rectangleTriangles: number[] = [0, 2, 1, 2, 0, 3];
  static _modelMatrix: Matrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    const renderData = (renderer._renderData = new RenderData2D());
    renderData.positions = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    renderData.uvs = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];
    renderData.triangles = SpriteSimple._rectangleTriangles;
    renderData.color = new Color();
  }

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    // Update ModelMatrix.
    const { width, height, pivot } = renderer;
    const { _modelMatrix: modelMatrix } = SpriteSimple;
    const { elements: worldE } = renderer.entity.transform.worldMatrix;
    const { elements: modelE } = modelMatrix;
    const sx = renderer.flipX ? -width : width;
    const sy = renderer.flipY ? -height : height;
    (modelE[0] = worldE[0] * sx), (modelE[1] = worldE[1] * sx), (modelE[2] = worldE[2] * sx);
    (modelE[4] = worldE[4] * sy), (modelE[5] = worldE[5] * sy), (modelE[6] = worldE[6] * sy);
    (modelE[8] = worldE[8]), (modelE[9] = worldE[9]), (modelE[10] = worldE[10]);
    modelE[12] = worldE[12] - pivot.x * modelE[0] - pivot.y * modelE[4];
    modelE[13] = worldE[13] - pivot.x * modelE[1] - pivot.y * modelE[5];
    modelE[14] = worldE[14];

    // Update positions.
    const [top, left, right, bottom] = renderer.sprite.edges;
    const { positions: position } = renderer._renderData;
    // Left-top.
    position[0].setValue(left, top, 0).transformToVec3(modelMatrix);
    // Right-top.
    position[1].setValue(right, top, 0).transformToVec3(modelMatrix);
    // Right-bottom.
    position[2].setValue(right, bottom, 0).transformToVec3(modelMatrix);
    // Left-bottom.
    position[3].setValue(left, bottom, 0).transformToVec3(modelMatrix);

    // Update bounds.
    const { min, max } = renderer._bounds;
    min.setValue(left, bottom, 0);
    max.setValue(right, top, 0);
    renderer._bounds.transform(modelMatrix);
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
