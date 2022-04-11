import { Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { VertexElement, VertexElementFormat } from "../graphic";
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
  _blendShapeCount: number = 0;
  /** @internal */
  _blendShapeUpdateFlags: UpdateFlag[] = [];

  /** @internal */
  _usingTextureStoreData: boolean = true;
  /** @internal */
  _blendShapeDataTexture: Texture2DArray;
  /** @internal */
  _blendShapeDataTextureInfo: Vector3 = new Vector3();

  private _engine: Engine;
  private _vertexCount: number = 0;

  constructor(engine: Engine) {
    this._engine = engine;
    this._usingTextureStoreData = this._engine._hardwareRenderer.capability.canUseFloatTextureBlendShape;
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
    this._blendShapeCount++;
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
    this._blendShapeCount = 0;
  }

  /**
   * @internal
   */
  _update(): void {
    this._vertexCount = 0;
    for (let i = 0, n = this._blendShapes.length; i < n; i++) {
      const blendShape = this._blendShapes[i];
      if (i === 0) {
        this._vertexCount = blendShape.frames[0].deltaPositions.length;
      } else if (this._vertexCount !== blendShape.frames[0].deltaPositions.length) {
        throw "Each BlendShape must all have the same vertices count.";
      }
    }
  }

  /**
   * @internal
   */
  _supplementalVertexElement(vertexElements: VertexElement[], offset: number): number {
    let supplementalElementCount = 0;
    for (let i = 0, n = this._blendShapes.length; i < n; i++) {
      vertexElements.push(new VertexElement(`POSITION_BS${i}`, offset, VertexElementFormat.Vector3, 0));
      offset += 12;
      supplementalElementCount += 3;
      if (this._useBlendShapeNormal) {
        vertexElements.push(new VertexElement(`NORMAL_BS${i}`, offset, VertexElementFormat.Vector3, 0));
        offset += 12;
        supplementalElementCount += 3;
      }
      if (this._useBlendShapeTangent) {
        vertexElements.push(new VertexElement(`TANGENT_BS${i}`, offset, VertexElementFormat.Vector3, 0));
        supplementalElementCount += 3;
      }
    }
    return supplementalElementCount;
  }

  /**
   * @internal
   */
  _updateDataToVertices(vertices: Float32Array, offset: number, vertexCount: number, elementCount: number): void {
    const blendShapes = this._blendShapes;
    const blendShapeUpdateFlags = this._blendShapeUpdateFlags;
    const blendShapeCount = Math.min(blendShapes.length, 4);

    if (!this._usingTextureStoreData) {
      for (let i = 0; i < blendShapeCount; i++) {
        const blendShapeUpdateFlag = blendShapeUpdateFlags[i];
        if (blendShapeUpdateFlag.flag) {
          const blendShape = blendShapes[i];
          const { frames } = blendShape;
          const frameCount = frames.length;
          const endFrame = frames[frameCount - 1];
          if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
            throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
          }

          const { deltaPositions } = endFrame;
          for (let j = 0; j < vertexCount; j++) {
            const start = elementCount * j + offset;
            const deltaPosition = deltaPositions[j];
            if (deltaPosition) {
              vertices[start] = deltaPosition.x;
              vertices[start + 1] = deltaPosition.y;
              vertices[start + 2] = deltaPosition.z;
            }
          }
          offset += 3;

          if (this._useBlendShapeNormal) {
            const { deltaNormals } = endFrame;
            if (deltaNormals) {
              for (let j = 0; j < vertexCount; j++) {
                const start = elementCount * j + offset;
                const deltaNormal = deltaNormals[j];
                if (deltaNormal) {
                  vertices[start] = deltaNormal.x;
                  vertices[start + 1] = deltaNormal.y;
                  vertices[start + 2] = deltaNormal.z;
                }
              }
            }
            offset += 3;
          }

          if (this._useBlendShapeTangent) {
            const { deltaTangents } = endFrame;
            if (deltaTangents) {
              for (let j = 0; j < vertexCount; j++) {
                const start = elementCount * j + offset;
                const deltaTangent = deltaTangents[j];
                if (deltaTangent) {
                  vertices[start] = deltaTangent.x;
                  vertices[start + 1] = deltaTangent.y;
                  vertices[start + 2] = deltaTangent.z;
                }
              }
            }
            offset += 3;
          }
          blendShapeUpdateFlag.flag = false;
        }
      }
    }
  }

  /**
   * @internal
   */
  _updateDataToTexture(): void {
    const maxTextureSize = this._engine._hardwareRenderer.capability.maxTextureSize;
    const { _vertexCount: vertexCount } = this;

    let vertexPixelStride = 1;
    this._useBlendShapeNormal && vertexPixelStride++;
    this._useBlendShapeTangent && vertexPixelStride++;

    let textureWidth = vertexPixelStride * vertexCount;
    let textureHeight = 1;
    if (textureWidth > maxTextureSize) {
      textureHeight = Math.ceil(textureWidth / maxTextureSize);
      textureWidth = maxTextureSize;
    }

    const blendShapes = this._blendShapes;
    let shapeCount = blendShapes.length;
    let blendShapeDataTexture = this._blendShapeDataTexture;
    const blendShapeCount = this._blendShapes.length;
    if (
      !blendShapeDataTexture ||
      blendShapeDataTexture.width !== textureWidth ||
      blendShapeDataTexture.height !== textureHeight ||
      blendShapeDataTexture.length !== shapeCount
    ) {
      blendShapeDataTexture && blendShapeDataTexture.destroy();

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

      blendShapeDataTexture = new Texture2DArray(
        this._engine,
        textureWidth,
        textureHeight,
        blendShapeCount,
        TextureFormat.R32G32B32A32,
        false
      );
      blendShapeDataTexture.filterMode = TextureFilterMode.Point;
      blendShapeDataTexture.setPixelBuffer(0, bufferData);
      this._blendShapeDataTexture = blendShapeDataTexture;
      this._blendShapeDataTextureInfo.setValue(vertexPixelStride, textureWidth, textureHeight);
    }
  }

  /**
   * @internal
   */
  _releaseMemoryCache(): void {
    const blendShapeUpdateFlags = this._blendShapeUpdateFlags;
    for (let i = 0, n = blendShapeUpdateFlags.length; i < n; i++) {
      blendShapeUpdateFlags[i].destroy();
    }
    this._blendShapes = null;
    this._blendShapeUpdateFlags = null;
  }
}
