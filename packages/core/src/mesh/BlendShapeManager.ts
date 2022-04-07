import { Engine } from "../Engine";
import { Texture2DArray, TextureFilterMode, TextureFormat } from "../texture";
import { UpdateFlag } from "../UpdateFlag";
import { BlendShape } from "./BlendShape";

/**
 * @internal
 */
export class BlendShapeManager {
  /** @internal */
  _hasBlendShape: boolean = false;
  /** @internal */
  _useBlendShapeNormal: boolean = false;
  /** @internal */
  _useBlendShapeTangent: boolean = false;
  /** @internal */
  _blendShapes: BlendShape[] = [];
  /** @internal */
  _blendShapeUpdateFlags: UpdateFlag[] = [];
  /** @internal */
  _blendShapeDataTexture: Texture2DArray;

  private _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  /**
   * @internal
   */
  _addBlendShape(blendShape: BlendShape): void {
    this._useBlendShapeNormal = this._useBlendShapeNormal || blendShape._useBlendShapeNormal;
    this._useBlendShapeTangent = this._useBlendShapeTangent || blendShape._useBlendShapeTangent;
    this._blendShapes.push(blendShape);
    this._blendShapeUpdateFlags.push(blendShape._registerChangeFlag());
    this._hasBlendShape = true;
  }

  /**
   * @internal
   */
  _clearBlendShapes(): void {
    this._useBlendShapeNormal = false;
    this._useBlendShapeTangent = false;
    this._blendShapes.length = 0;
    const blendShapeUpdateFlags = this._blendShapeUpdateFlags;
    for (let i = 0, n = blendShapeUpdateFlags.length; i < n; i++) {
      blendShapeUpdateFlags[i].destroy();
    }
    blendShapeUpdateFlags.length = 0;
    this._hasBlendShape = false;
  }

  /**
   * @internal
   */
  _updateBlendShapeDataTexture(): void {
    const vertexCount = 0;
    const maxTextureSize = 0;

    let pixelStride = 1;
    this._useBlendShapeNormal && pixelStride++;
    this._useBlendShapeTangent && pixelStride++;

    let textureWidth = pixelStride * vertexCount;
    let textureHeight = 1;
    if (textureWidth > maxTextureSize) {
      textureWidth = maxTextureSize;
      textureHeight = Math.ceil(textureWidth / maxTextureSize);
    }

    let blendShapeDataTexture = this._blendShapeDataTexture;
    if (
      !blendShapeDataTexture ||
      blendShapeDataTexture.width !== textureWidth ||
      blendShapeDataTexture.height !== textureHeight ||
      blendShapeDataTexture.length !== this._blendShapes.length
    ) {
      blendShapeDataTexture && blendShapeDataTexture.destroy();

      const blendShapes = this._blendShapes;
      let shapeCount = blendShapes.length;
      let bufferData = new Float32Array(shapeCount * textureWidth * textureHeight * 4);

      let offset = 0;
      for (let i = 0; i < shapeCount; i++) {
        const blendShapeFrame = blendShapes[i].frames[0];

        const positions = blendShapeFrame.deltaPositions;
        const normals = blendShapeFrame.deltaNormals;
        const tangents = blendShapeFrame.deltaTangents;

        offset = i * textureWidth * textureHeight * 4;
        for (let j = 0; j < vertexCount; j++) {
          const position = positions[j];
          bufferData[offset] = position.x;
          bufferData[offset + 1] = position.y;
          bufferData[offset + 2] = position.z;
          offset += 4;

          if (normals) {
            const normal = normals[j];
            bufferData[offset] = normal.x;
            bufferData[offset + 1] = normal.y;
            bufferData[offset + 2] = normal.z;
            offset += 4;
          }

          if (tangents) {
            const tangent = tangents[j];
            bufferData[offset] = tangent.x;
            bufferData[offset + 1] = tangent.y;
            bufferData[offset + 2] = tangent.z;
            offset += 4;
          }
        }
      }

      blendShapeDataTexture = new Texture2DArray(this._engine, textureWidth, textureHeight, TextureFormat.R32G32B32A32);
      blendShapeDataTexture.filterMode = TextureFilterMode.Point;
      blendShapeDataTexture.setPixelBuffer(0, bufferData);
      this._blendShapeDataTexture = blendShapeDataTexture;
    }

    const blendShapes = this._blendShapes;
    for (let i = 0, n = blendShapes.length; i < n; i++) {}
  }

  _releaseCache(): void {
    const blendShapeUpdateFlags = this._blendShapeUpdateFlags;
    for (let i = 0, n = blendShapeUpdateFlags.length; i < n; i++) {
      blendShapeUpdateFlags[i].destroy();
    }
    this._blendShapes = null;
    this._blendShapeUpdateFlags = null;
  }
}
