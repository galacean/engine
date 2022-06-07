import { Matrix } from "@oasis-engine/math";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";

@StaticInterfaceImplement<IAssembler>()
export class SpriteSimple {
  static modelMatrix: Matrix = new Matrix();

  static updateData(renderer: SpriteRenderer): void {
    // const { sprite, width, height, _renderData } = renderer;
    // const { positions } = sprite;
    // const { modelMatrix } = SpriteSimple;
    // const worldMatrix = renderer.entity.transform.worldMatrix;
    // const pivot = renderer.pivot;
    // worldMatrix.cloneTo(modelMatrix);
    // const { elements: e } = modelMatrix;
    // const sx = renderer.flipX ? -width : width;
    // const sy = renderer.flipY ? -height : height;
    // (e[0] *= sx), (e[1] *= sx), (e[2] *= sx);
    // (e[4] *= sy), (e[5] *= sy), (e[6] *= sy);
    // e[12] -= pivot.x * e[0] + pivot.y * e[4];
    // e[13] -= pivot.x * e[1] + pivot.y * e[5];
    // for (let i = positions.length - 1; i >= 0; i--) {
    //   const spritePosition = positions[i];
    //   _renderData._positions[i].setValue(spritePosition.x, spritePosition.y, 0).transformToVec3(modelMatrix);
    // }
  }

  static resetData(renderer: SpriteRenderer): void {
    const { sprite, _renderData } = renderer;
    
  }
}
