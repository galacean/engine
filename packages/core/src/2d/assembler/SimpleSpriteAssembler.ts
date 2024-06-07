import { BoundingBox, Matrix } from "@galacean/engine-math";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { SpriteMask } from "../sprite";
import { SpriteRenderer } from "../sprite/SpriteRenderer";
import { IAssembler } from "./IAssembler";

/**
 * @internal
 */
@StaticInterfaceImplement<IAssembler>()
export class SimpleSpriteAssembler {
  static _rectangleTriangles: number[] = [0, 1, 2, 2, 1, 3];
  static _worldMatrix: Matrix = new Matrix();

  static resetData(renderer: SpriteRenderer | SpriteMask): void {
    const manager =
      renderer instanceof SpriteRenderer
        ? renderer.engine._batcherManager._dynamicGeometryDataManager2D
        : renderer.engine._spriteMaskManager._batcher._dynamicGeometryDataManager;

    const lastChunk = renderer._chunk;
    lastChunk && manager.freeChunk(lastChunk);
    const chunk = manager.allocateChunk(4);
    chunk._indices = this._rectangleTriangles;
    renderer._chunk = chunk;
  }

  static updatePositions(renderer: SpriteRenderer | SpriteMask): void {
    const { width, height, sprite } = renderer;
    const { x: pivotX, y: pivotY } = sprite.pivot;
    // Renderer's worldMatrix
    const { _worldMatrix: worldMatrix } = this;
    const { elements: wE } = worldMatrix;
    // Parent's worldMatrix
    const { elements: pWE } = renderer.entity.transform.worldMatrix;
    const sx = renderer.flipX ? -width : width;
    const sy = renderer.flipY ? -height : height;
    (wE[0] = pWE[0] * sx), (wE[1] = pWE[1] * sx), (wE[2] = pWE[2] * sx);
    (wE[4] = pWE[4] * sy), (wE[5] = pWE[5] * sy), (wE[6] = pWE[6] * sy);
    (wE[8] = pWE[8]), (wE[9] = pWE[9]), (wE[10] = pWE[10]);
    wE[12] = pWE[12] - pivotX * wE[0] - pivotY * wE[4];
    wE[13] = pWE[13] - pivotX * wE[1] - pivotY * wE[5];
    wE[14] = pWE[14] - pivotX * wE[2] - pivotY * wE[6];

    // ---------------
    //  2 - 3
    //  |   |
    //  0 - 1
    // ---------------
    // Update positions
    const spritePositions = sprite._getPositions();
    const { _chunk: chunk } = renderer;
    const vertices = chunk._data._vertices;
    let index = chunk._primitive.vertexBufferBindings[0].offset / 4;
    for (let i = 0; i < 4; ++i) {
      const { x, y } = spritePositions[i];
      vertices[index] = wE[0] * x + wE[4] * y + wE[12];
      vertices[index + 1] = wE[1] * x + wE[5] * y + wE[13];
      vertices[index + 2] = wE[2] * x + wE[6] * y + wE[14];
      index += 9;
    }

    BoundingBox.transform(sprite._getBounds(), worldMatrix, renderer._bounds);
  }

  static updateUVs(renderer: SpriteRenderer | SpriteMask): void {
    const spriteUVs = renderer.sprite._getUVs();
    const { x: left, y: bottom } = spriteUVs[0];
    const { x: right, y: top } = spriteUVs[3];
    const { _chunk: chunk } = renderer;
    const vertices = chunk._data._vertices;
    let index = chunk._primitive.vertexBufferBindings[0].offset / 4 + 3;
    vertices[index] = left;
    vertices[index + 1] = bottom;
    vertices[index + 9] = right;
    vertices[index + 10] = bottom;
    vertices[index + 18] = left;
    vertices[index + 19] = top;
    vertices[index + 27] = right;
    vertices[index + 28] = top;
  }

  static updateColor(renderer: SpriteRenderer): void {
    const { _chunk: chunk } = renderer;
    const { r, g, b, a } = renderer.color;
    const vertices = chunk._data._vertices;
    let index = chunk._primitive.vertexBufferBindings[0].offset / 4 + 5;
    for (let i = 0; i < 4; ++i) {
      vertices[index] = r;
      vertices[index + 1] = g;
      vertices[index + 2] = b;
      vertices[index + 3] = a;
      index += 9;
    }
  }
}
