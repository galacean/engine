import { Vector3 } from "@oasis-engine/math";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Engine } from "../Engine";
import { VertexElement, VertexElementFormat } from "../graphic";
import { ListenerUpdateFlag } from "../ListenerUpdateFlag";
import { Texture2DArray, TextureFilterMode, TextureFormat } from "../texture";
import { BlendShape } from "./BlendShape";

/**
 * @internal
 */
export class BlendShapeManager {
  /** @internal */
  _useBlendNormal: boolean = false;
  /** @internal */
  _useBlendTangent: boolean = false;
  /** @internal */
  _blendShapes: BlendShape[] = [];
  /** @internal */
  _blendShapeCount: number = 0;
  /** @internal */
  _layoutDirtyFlag: ListenerUpdateFlag = new ListenerUpdateFlag();
  /** @internal */
  _updateAllDataToVertices: boolean = false;
  /** @internal */
  _subDataDirtyFlags: BoolUpdateFlag[] = [];

  /** @internal */
  _dataTextureBuffer: Float32Array;
  /** @internal */
  _dataTexture: Texture2DArray;
  /** @internal */
  _dataTextureInfo: Vector3 = new Vector3();

  private _engine: Engine;
  /* x:vertexElementCount, y:useNormal, z:useTangent */
  private _lastUpdateVertexElementInfo: Vector3 = new Vector3(0, 0, 0);
  private _canUseTextureStoreData: boolean = true;

  constructor(engine: Engine) {
    this._engine = engine;
    this._canUseTextureStoreData = this._engine._hardwareRenderer.capability.canUseFloatTextureBlendShape;
    this._layoutDirtyFlag.listener = this._updateUsePropertyFlag.bind(this);
  }

  /**
   * @internal
   */
  _addBlendShape(blendShape: BlendShape): void {
    this._blendShapes.push(blendShape);
    this._blendShapeCount++;

    blendShape._addLayoutChangeFlag(this._layoutDirtyFlag);
    this._updateUsePropertyFlag(blendShape);

    this._subDataDirtyFlags.push(blendShape._createSubDataDirtyFlag());
  }

  /**
   * @internal
   */
  _clearBlendShapes(): void {
    this._useBlendNormal = true;
    this._useBlendTangent = true;
    this._blendShapes.length = 0;
    this._blendShapeCount = 0;

    this._layoutDirtyFlag.clearFromManagers();
    const subDataDirtyFlags = this._subDataDirtyFlags;
    for (let i = 0, n = subDataDirtyFlags.length; i < n; i++) {
      subDataDirtyFlags[i].destroy();
    }
    subDataDirtyFlags.length = 0;
  }

  /**
   * @internal
   */
  _getUseTextureStore(): boolean {
    return this._blendShapeCount > 4 && this._canUseTextureStoreData;
  }

  /**
   * @internal
   */
  _layoutOrCountChange(): boolean {
    if (this._dataTexture) {
      return false;
    }

    const lastInfo = this._lastUpdateVertexElementInfo;
    if (
      lastInfo.x !== this._blendShapeCount ||
      !!lastInfo.y !== this._useBlendNormal ||
      !!lastInfo.z !== this._useBlendTangent
    ) {
      return true;
    }
  }

  /**
   * @internal
   */
  _updateVertexElements(vertexElements: VertexElement[], offset: number): number {
    let elementCount = 0;
    for (let i = 0, n = this._blendShapeCount; i < n; i++) {
      vertexElements.push(new VertexElement(`POSITION_BS${i}`, offset, VertexElementFormat.Vector3, 0));
      offset += 12;
      elementCount += 3;
      if (this._useBlendNormal) {
        vertexElements.push(new VertexElement(`NORMAL_BS${i}`, offset, VertexElementFormat.Vector3, 0));
        offset += 12;
        elementCount += 3;
      }
      if (this._useBlendTangent) {
        vertexElements.push(new VertexElement(`TANGENT_BS${i}`, offset, VertexElementFormat.Vector3, 0));
        elementCount += 3;
      }
    }

    this._lastUpdateVertexElementInfo.setValue(this._blendShapeCount, +this._useBlendNormal, +this._useBlendTangent);
    return elementCount;
  }

  /**
   * @internal
   */
  _needUpdateData(): boolean {
    for (let i = 0, n = this._subDataDirtyFlags.length; i < n; i++) {
      if (this._subDataDirtyFlags[i].flag) {
        return true;
      }
    }
  }

  /**
   * @internal
   */
  _updateDataToVertices(vertices: Float32Array, offset: number, vertexCount: number, elementCount: number): void {
    if (this._canUseTextureStoreData) {
      return;
    }
    const blendShapes = this._blendShapes;
    const subDataDirtyFlags = this._subDataDirtyFlags;
    const updateAllDataToVertices = this._updateAllDataToVertices;
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      const dataChangedFlag = subDataDirtyFlags[i];
      if (updateAllDataToVertices || dataChangedFlag.flag) {
        const { frames } = blendShapes[i];
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

        if (this._useBlendNormal) {
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

        if (this._useBlendTangent) {
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
        dataChangedFlag.flag = false;
      }
    }
    this._updateAllDataToVertices = false;
  }

  _needCreateDataTexture(): boolean {
    if (!this._dataTexture) {
      return false;
    }
  }

  /**
   * @internal
   */
  _updateTexture(
    layoutOrCountChange: boolean,
    vertexCountChange: boolean,
    needUpdateBlendShape: boolean,
    vertexCount: number
  ): void {
    if (!this._dataTexture || layoutOrCountChange || vertexCountChange) {
      this._createDataTexture(vertexCount);
    }
    if (needUpdateBlendShape) {
      this._updateDataToTexture(vertexCount);
    }
  }

  private _createDataTexture(vertexCount: number): void {
    const maxTextureSize = this._engine._hardwareRenderer.capability.maxTextureSize;

    let vertexPixelStride = 1;
    this._useBlendNormal && vertexPixelStride++;
    this._useBlendTangent && vertexPixelStride++;

    let textureWidth = vertexPixelStride * vertexCount;
    let textureHeight = 1;
    if (textureWidth > maxTextureSize) {
      textureHeight = Math.ceil(textureWidth / maxTextureSize);
      textureWidth = maxTextureSize;
    }

    const shapeCount = this._blendShapes.length;
    let blendShapeDataTexture = this._dataTexture;
    const blendShapeCount = this._blendShapes.length;

    blendShapeDataTexture && blendShapeDataTexture.destroy();

    blendShapeDataTexture = new Texture2DArray(
      this._engine,
      textureWidth,
      textureHeight,
      blendShapeCount,
      TextureFormat.R32G32B32A32,
      false
    );
    blendShapeDataTexture.filterMode = TextureFilterMode.Point;

    this._dataTextureBuffer = new Float32Array(shapeCount * textureWidth * textureHeight * 4);
    this._dataTexture = blendShapeDataTexture;
    this._dataTextureInfo.setValue(vertexPixelStride, textureWidth, textureHeight);
  }

  private _updateDataToTexture(vertexCount: number): void {
    const {
      _blendShapes: blendShapes,
      _dataTexture: dataTexture,
      _dataTextureBuffer: buffer,
      _subDataDirtyFlags: subDataDirtyFlags
    } = this;

    const updateAllDataToVertices = this._updateAllDataToVertices;
    let offset = 0;
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      const subDirtyFlag = subDataDirtyFlags[i];
      if (updateAllDataToVertices || subDirtyFlag.flag) {
        const { frames } = blendShapes[i];
        const frameCount = frames.length;
        const endFrame = frames[frameCount - 1];
        if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
          throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
        }
        const { deltaPositions, deltaNormals, deltaTangents } = endFrame;
        offset = i * dataTexture.width * dataTexture.height * 4;
        for (let j = 0; j < vertexCount; j++) {
          const position = deltaPositions[j];
          buffer[offset] = position.x;
          buffer[offset + 1] = position.y;
          buffer[offset + 2] = position.z;
          offset += 4;

          if (deltaNormals) {
            const normal = deltaNormals[j];
            buffer[offset] = normal.x;
            buffer[offset + 1] = normal.y;
            buffer[offset + 2] = normal.z;
            offset += 4;
          }

          if (deltaTangents) {
            const tangent = deltaTangents[j];
            buffer[offset] = tangent.x;
            buffer[offset + 1] = tangent.y;
            buffer[offset + 2] = tangent.z;
            offset += 4;
          }
        }
        subDirtyFlag.flag = false;
      }
    }
    dataTexture.setPixelBuffer(0, buffer);
    this._updateAllDataToVertices = false;
  }

  /**
   * @internal
   */
  _releaseMemoryCache(): void {
    this._layoutDirtyFlag.destroy();
    const dataChangedFlags = this._subDataDirtyFlags;
    for (let i = 0, n = dataChangedFlags.length; i < n; i++) {
      dataChangedFlags[i].destroy();
    }

    this._layoutDirtyFlag = null;
    this._subDataDirtyFlags = null;
    this._blendShapes = null;
  }

  private _updateUsePropertyFlag(blendShape: BlendShape): void {
    this._useBlendNormal &&= blendShape._useBlendShapeNormal;
    this._useBlendTangent &&= blendShape._useBlendShapeTangent;
  }
}
