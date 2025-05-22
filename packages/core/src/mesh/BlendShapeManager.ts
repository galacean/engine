import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Texture2DArray, TextureFilterMode, TextureFormat } from "../texture";
import { BlendShape } from "./BlendShape";
import { ModelMesh } from "./ModelMesh";
import { SkinnedMeshRenderer } from "./SkinnedMeshRenderer";

/**
 * @internal
 */
export class BlendShapeManager {
  private static _blendShapeMacro = ShaderMacro.getByName("RENDERER_HAS_BLENDSHAPE");
  private static _blendShapeTextureMacro = ShaderMacro.getByName("RENDERER_BLENDSHAPE_USE_TEXTURE");
  private static _blendShapeNormalMacro = ShaderMacro.getByName("RENDERER_BLENDSHAPE_HAS_NORMAL");
  private static _blendShapeTangentMacro = ShaderMacro.getByName("RENDERER_BLENDSHAPE_HAS_TANGENT");

  private static _blendShapeWeightsProperty = ShaderProperty.getByName("renderer_BlendShapeWeights");
  private static _blendShapeTextureProperty = ShaderProperty.getByName("renderer_BlendShapeTexture");
  private static _blendShapeTextureInfoProperty = ShaderProperty.getByName("renderer_BlendShapeTextureInfo");

  /** @internal */
  _blendShapeCount: number = 0;
  /** @internal */
  _blendShapes: BlendShape[] = [];
  /** @internal */
  _subDataDirtyFlags: BoolUpdateFlag[] = [];
  /** @internal */
  _vertexTexture: Texture2DArray;
  /** @internal */
  _vertexBuffers: Buffer[] = [];
  /** @internal */
  _vertices: Float32Array;
  /** @internal */
  _uniformOccupiesCount: number = 0;
  /** @internal */
  _bufferBindingOffset: number = -1;
  /** @internal */
  _vertexElementOffset: number = 0;

  private _useBlendNormal: boolean = false;
  private _useBlendTangent: boolean = false;
  private _vertexElementCount: number = 0;
  private _storeInVertexBufferInfo: Vector2[] = [];
  private _maxCountSingleVertexBuffer: number = 0;
  private readonly _engine: Engine;
  private readonly _modelMesh: ModelMesh;
  private readonly _lastHostCreatedInfo: Vector4 = new Vector4(); // x: blendShapeCount, y: useNormal, z: useBlendTangent, w: vertexCount
  private readonly _canUseTextureStoreData: boolean = true;
  private readonly _dataTextureInfo: Vector3 = new Vector3();

  constructor(engine: Engine, modelMesh: ModelMesh) {
    this._engine = engine;
    this._modelMesh = modelMesh;
    this._canUseTextureStoreData = this._engine._hardwareRenderer.capability.canUseFloatTextureBlendShape;
    this._updateLayoutChange = this._updateLayoutChange.bind(this);
  }

  /**
   * @internal
   */
  _addBlendShape(blendShape: BlendShape): void {
    this._blendShapes.push(blendShape);
    this._blendShapeCount++;

    blendShape._layoutChangeManager.addListener(this._updateLayoutChange);
    this._updateLayoutChange(0, blendShape);

    this._subDataDirtyFlags.push(blendShape._dataChangeManager.createFlag(BoolUpdateFlag));
  }

  /**
   * @internal
   */
  _clearBlendShapes(): void {
    const blendShapes = this._blendShapes;
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      blendShapes[i]._layoutChangeManager.removeListener(this._updateLayoutChange);
    }
    this._useBlendNormal = false;
    this._useBlendTangent = false;
    this._vertexElementCount = 0;
    this._blendShapes.length = 0;
    this._blendShapeCount = 0;

    const subDataDirtyFlags = this._subDataDirtyFlags;
    for (let i = 0, n = subDataDirtyFlags.length; i < n; i++) {
      subDataDirtyFlags[i].destroy();
    }
    subDataDirtyFlags.length = 0;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData, skinnedMeshRenderer: SkinnedMeshRenderer): void {
    let blendShapeCount = this._blendShapeCount;
    if (blendShapeCount > 0) {
      shaderData.enableMacro(BlendShapeManager._blendShapeMacro);
      if (this._useTextureMode()) {
        shaderData.enableMacro(BlendShapeManager._blendShapeTextureMacro);
        shaderData.setTexture(BlendShapeManager._blendShapeTextureProperty, this._vertexTexture);
        shaderData.setVector3(BlendShapeManager._blendShapeTextureInfoProperty, this._dataTextureInfo);
        shaderData.setFloatArray(BlendShapeManager._blendShapeWeightsProperty, skinnedMeshRenderer.blendShapeWeights);
        shaderData.enableMacro("RENDERER_BLENDSHAPE_COUNT", blendShapeCount.toString());
        this._uniformOccupiesCount = blendShapeCount + 1;
      } else {
        const maxBlendCount = this._getVertexBufferModeSupportCount();
        if (blendShapeCount > maxBlendCount) {
          let condensedBlendShapeWeights = skinnedMeshRenderer._condensedBlendShapeWeights;
          if (!condensedBlendShapeWeights) {
            condensedBlendShapeWeights = new Float32Array(maxBlendCount);
            skinnedMeshRenderer._condensedBlendShapeWeights = condensedBlendShapeWeights;
          }
          this._filterCondensedBlendShapeWeights(skinnedMeshRenderer.blendShapeWeights, condensedBlendShapeWeights);
          shaderData.setFloatArray(BlendShapeManager._blendShapeWeightsProperty, condensedBlendShapeWeights);
          this._modelMesh._primitive.enableVAO = false;
          blendShapeCount = maxBlendCount;
        } else {
          shaderData.setFloatArray(BlendShapeManager._blendShapeWeightsProperty, skinnedMeshRenderer.blendShapeWeights);
          this._modelMesh._primitive.enableVAO = true;
        }
        shaderData.disableMacro(BlendShapeManager._blendShapeTextureMacro);
        shaderData.disableMacro("RENDERER_BLENDSHAPE_COUNT");
        this._uniformOccupiesCount = blendShapeCount;
      }

      if (this._useBlendNormal) {
        shaderData.enableMacro(BlendShapeManager._blendShapeNormalMacro);
      } else {
        shaderData.disableMacro(BlendShapeManager._blendShapeNormalMacro);
      }
      if (this._useBlendTangent) {
        shaderData.enableMacro(BlendShapeManager._blendShapeTangentMacro);
      } else {
        shaderData.disableMacro(BlendShapeManager._blendShapeTangentMacro);
      }
    } else {
      shaderData.disableMacro(BlendShapeManager._blendShapeMacro);
      shaderData.disableMacro("RENDERER_BLENDSHAPE_COUNT");
    }
  }

  /**
   * @internal
   */
  _useTextureMode(): boolean {
    if (!this._canUseTextureStoreData) {
      return false;
    }
    return this._blendShapeCount > this._getVertexBufferModeSupportCount();
  }

  /**
   * @internal
   */
  _isCreateHost(vertexCount: number): boolean {
    const createdInfo = this._lastHostCreatedInfo;
    return (
      createdInfo.x !== this._blendShapeCount ||
      !!createdInfo.y !== this._useBlendNormal ||
      !!createdInfo.z !== this._useBlendTangent ||
      createdInfo.w !== vertexCount
    );
  }

  /**
   * @internal
   */
  _vertexElementsNeedUpdate(): boolean {
    const maxSupportCount = this._getVertexBufferModeSupportCount();
    const info = this._lastHostCreatedInfo;
    return (
      Math.min(info.x, maxSupportCount) !== Math.min(this._blendShapeCount, maxSupportCount) ||
      !!info.y !== this._useBlendNormal ||
      !!info.z !== this._useBlendTangent
    );
  }

  /**
   * @internal
   */
  _needUpdateData(): boolean {
    const subDataDirtyFlags = this._subDataDirtyFlags;
    for (let i = 0, n = subDataDirtyFlags.length; i < n; i++) {
      if (subDataDirtyFlags[i].flag) {
        return true;
      }
    }
    return false;
  }

  private _updateVertexBufferIndex(): void {
    if (this._bufferBindingOffset !== -1) {
      return;
    }

    const modelMesh = this._modelMesh;
    const internalVertexBufferIndex = modelMesh._internalVertexBufferIndex;
    const vertexBufferBindings = modelMesh._primitive.vertexBufferBindings;
    let i = 0;
    const n = Math.max(vertexBufferBindings.length, internalVertexBufferIndex + 1);
    for (; i < n; i++) {
      if (!vertexBufferBindings[i] && i !== internalVertexBufferIndex) {
        break;
      }
    }
    this._bufferBindingOffset = i;
  }

  /**
   * @internal
   */
  _addVertexElements(modelMesh: ModelMesh): number {
    this._updateVertexBufferIndex();

    let elementIndex = this._vertexElementOffset;
    const bindingOffset = this._bufferBindingOffset;

    let offset = 0;
    for (let i = 0, n = Math.min(this._blendShapeCount, this._getVertexBufferModeSupportCount()); i < n; i++) {
      modelMesh._setVertexElement(
        elementIndex++,
        new VertexElement(`POSITION_BS${i}`, offset, VertexElementFormat.Vector3, bindingOffset)
      );
      offset += 12;
      if (this._useBlendNormal) {
        modelMesh._setVertexElement(
          elementIndex++,
          new VertexElement(`NORMAL_BS${i}`, offset, VertexElementFormat.Vector3, bindingOffset)
        );
        offset += 12;
      }
      if (this._useBlendTangent) {
        modelMesh._setVertexElement(
          elementIndex++,
          new VertexElement(`TANGENT_BS${i}`, offset, VertexElementFormat.Vector3, bindingOffset)
        );
        offset += 12;
      }
    }
    return elementIndex;
  }

  /**
   * @internal
   */
  _update(noLongerReadable: boolean): void {
    const { vertexCount } = this._modelMesh;
    const useTexture = this._useTextureMode();
    const createHost = this._isCreateHost(vertexCount);

    if (createHost) {
      if (useTexture) {
        this._createTextureArray(vertexCount);
      } else {
        this._createVertexBuffers(vertexCount, noLongerReadable);
      }
      this._lastHostCreatedInfo.set(this._blendShapeCount, +this._useBlendNormal, +this._useBlendTangent, vertexCount);
    }
    if (this._needUpdateData()) {
      if (useTexture) {
        this._updateTextureArray(vertexCount, createHost);
      } else {
        this._updateVertexBuffers(vertexCount, createHost);
      }
    }
  }

  /**
   * @internal
   */
  _releaseMemoryCache(): void {
    const blendShapes = this._blendShapes;
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      blendShapes[i]._releaseData();
    }

    this._vertices = null;
  }

  private _createVertexBuffers(vertexCount: number, noLongerAccessible: boolean): void {
    const {
      _engine: engine,
      _modelMesh: modelMesh,
      _blendShapeCount: blendShapeCount,
      _vertexBuffers: vertexBuffers
    } = this;
    const vertexFloatCount = this._vertexElementCount * 3;
    const vertexByteCount = vertexFloatCount * 4;
    const maxCountSingleBuffer = Math.floor(255 / vertexByteCount); // 255: Attribute MaxStride
    const bufferCount = Math.ceil(blendShapeCount / maxCountSingleBuffer);
    const floatCount = vertexFloatCount * vertexCount * Math.min(maxCountSingleBuffer, blendShapeCount);

    vertexBuffers.length = bufferCount;
    this._vertices = new Float32Array(floatCount);
    this._maxCountSingleVertexBuffer = maxCountSingleBuffer;
    this._storeInVertexBufferInfo.length = blendShapeCount;

    const bufferBindingOffset = this._bufferBindingOffset;
    for (let i = 0; i < bufferCount; i++) {
      const lastIndex = bufferCount - 1;
      const containCount = i === lastIndex ? blendShapeCount - lastIndex * maxCountSingleBuffer : maxCountSingleBuffer;
      const stride = containCount * vertexByteCount;
      const byteLength = stride * vertexCount;

      const usage = noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic;
      const blendShapeBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, usage);
      modelMesh._setVertexBufferBinding(bufferBindingOffset + i, new VertexBufferBinding(blendShapeBuffer, stride));
      vertexBuffers[i] = blendShapeBuffer;
    }
  }

  private _createTextureArray(vertexCount: number): void {
    const maxTextureSize = this._engine._hardwareRenderer.capability.maxTextureSize;
    const vertexPixelStride = this._vertexElementCount;

    let textureWidth = vertexPixelStride * vertexCount;
    let textureHeight = 1;
    if (textureWidth > maxTextureSize) {
      textureHeight = Math.ceil(textureWidth / maxTextureSize);
      textureWidth = maxTextureSize;
    }

    let blendShapeDataTexture = this._vertexTexture;
    const blendShapeCount = this._blendShapes.length;

    blendShapeDataTexture && blendShapeDataTexture.destroy();

    blendShapeDataTexture = new Texture2DArray(
      this._engine,
      textureWidth,
      textureHeight,
      blendShapeCount,
      TextureFormat.R32G32B32A32,
      false,
      false
    );
    blendShapeDataTexture.filterMode = TextureFilterMode.Point;

    this._vertices = new Float32Array(blendShapeCount * textureWidth * textureHeight * 4);
    this._vertexTexture = blendShapeDataTexture;
    this._dataTextureInfo.set(vertexPixelStride, textureWidth, textureHeight);
  }

  /**
   * @internal
   */
  _updateVertexBuffers(vertexCount: number, force: boolean): void {
    const { _blendShapes: blendShapes, _maxCountSingleVertexBuffer: maxCountSingleBuffer } = this;
    const { _vertices: vertices, _vertexBuffers: vertexBuffers, _storeInVertexBufferInfo: storeInfos } = this;

    const subDataDirtyFlags = this._subDataDirtyFlags;
    const blendShapeFloatStride = this._vertexElementCount * 3;
    const blendShapeByteStride = blendShapeFloatStride * 4;
    const bufferOffset = this._bufferBindingOffset;

    // @todo: should fix bug when dataChangedFlag is true
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      const dataChangedFlag = subDataDirtyFlags[i];
      if (force || dataChangedFlag.flag) {
        const { frames } = blendShapes[i];
        const frameCount = frames.length;
        const endFrame = frames[frameCount - 1];
        if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
          throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
        }

        const bufferIndex = Math.floor(i / maxCountSingleBuffer);
        const indexInBuffer = i % maxCountSingleBuffer;
        const buffer = vertexBuffers[bufferIndex];
        const bufferFloatStride = buffer.byteLength / (vertexCount * 4);

        let offset = indexInBuffer * blendShapeFloatStride;

        let storeInfo = storeInfos[i];
        storeInfo || (storeInfos[i] = storeInfo = new Vector2());
        storeInfo.set(bufferOffset + bufferIndex, indexInBuffer * blendShapeByteStride); // BufferOffset is mesh vertexBuffer offset

        const { deltaPositions } = endFrame;
        for (let j = 0; j < vertexCount; j++) {
          const start = offset + bufferFloatStride * j;
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
              const start = offset + bufferFloatStride * j;
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
              const start = offset + bufferFloatStride * j;
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

        if (indexInBuffer === maxCountSingleBuffer - 1 || i === n - 1) {
          // @todo: can optimize in setData
          buffer.setData(vertices, 0, 0, buffer.byteLength / 4);
        }

        dataChangedFlag.flag = false;
      }
    }
  }

  private _updateTextureArray(vertexCount: number, force: boolean): void {
    const {
      _blendShapes: blendShapes,
      _vertexTexture: vertexTexture,
      _vertices: vertices,
      _subDataDirtyFlags: subDataDirtyFlags
    } = this;

    for (let i = 0, n = blendShapes.length; i < n; i++) {
      const subDirtyFlag = subDataDirtyFlags[i];
      const subBlendShapeDataStride = vertexTexture.width * vertexTexture.height * 4;
      if (force || subDirtyFlag.flag) {
        const { frames } = blendShapes[i];
        const frameCount = frames.length;
        const endFrame = frames[frameCount - 1];
        if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
          throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
        }

        const { deltaPositions, deltaNormals, deltaTangents } = endFrame;
        let offset = i * subBlendShapeDataStride;
        for (let j = 0; j < vertexCount; j++) {
          const position = deltaPositions[j];
          vertices[offset] = position.x;
          vertices[offset + 1] = position.y;
          vertices[offset + 2] = position.z;
          offset += 4;

          if (deltaNormals) {
            const normal = deltaNormals[j];
            vertices[offset] = normal.x;
            vertices[offset + 1] = normal.y;
            vertices[offset + 2] = normal.z;
            offset += 4;
          }

          if (deltaTangents) {
            const tangent = deltaTangents[j];
            vertices[offset] = tangent.x;
            vertices[offset + 1] = tangent.y;
            vertices[offset + 2] = tangent.z;
            offset += 4;
          }
        }
        subDirtyFlag.flag = false;
      }
    }
    vertexTexture.setPixelBuffer(0, vertices);
  }

  private _updateLayoutChange(type: number, blendShape: BlendShape): void {
    const notFirst = this._blendShapeCount > 1;
    let vertexElementCount = 1;
    let useBlendNormal = blendShape._useBlendShapeNormal;
    let useBlendTangent = blendShape._useBlendShapeTangent;
    if (notFirst) {
      useBlendNormal &&= this._useBlendNormal;
      useBlendTangent &&= this._useBlendTangent;
    }

    useBlendNormal && vertexElementCount++;
    useBlendTangent && vertexElementCount++;

    this._useBlendNormal = useBlendNormal;
    this._useBlendTangent = useBlendTangent;
    this._vertexElementCount = vertexElementCount;
  }

  private _attributeModeUpdateVertexElement(
    vertexElements: VertexElement[],
    vertexBufferStoreInfo: Vector2[],
    index: number,
    condensedIndex: number
  ): void {
    let elementOffset = this._vertexElementOffset + this._vertexElementCount * condensedIndex;

    let { x: bufferIndex, y: offset } = vertexBufferStoreInfo[index];
    const vertexElement = vertexElements[elementOffset];
    vertexElement.bindingIndex = bufferIndex;
    vertexElement.offset = offset;
    if (this._useBlendNormal) {
      const vertexElement = vertexElements[++elementOffset];
      offset += 12;
      vertexElement.bindingIndex = bufferIndex;
      vertexElement.offset = offset;
    }
    if (this._useBlendTangent) {
      const vertexElement = vertexElements[++elementOffset];
      offset += 12;
      vertexElement.bindingIndex = bufferIndex;
      vertexElement.offset = offset;
    }
  }

  private _getVertexBufferModeSupportCount(): number {
    if (this._useBlendNormal && this._useBlendTangent) {
      return 2;
    } else {
      return this._useBlendNormal || this._useBlendTangent ? 4 : 8;
    }
  }

  private _filterCondensedBlendShapeWeights(
    blendShapeWeights: Float32Array,
    condensedBlendShapeWeights: Float32Array
  ): void {
    const condensedWeightsCount = condensedBlendShapeWeights.length;
    const vertexElements = this._modelMesh._primitive.vertexElements;
    const vertexBufferStoreInfo = this._storeInVertexBufferInfo;
    let thresholdWeight = Number.POSITIVE_INFINITY;
    let thresholdIndex: number;
    for (let i = 0, n = Math.min(blendShapeWeights.length, this._blendShapeCount); i < n; i++) {
      const weight = blendShapeWeights[i];
      if (i < condensedWeightsCount) {
        this._attributeModeUpdateVertexElement(vertexElements, vertexBufferStoreInfo, i, i);
        condensedBlendShapeWeights[i] = weight;
        if (weight < thresholdWeight) {
          thresholdWeight = weight;
          thresholdIndex = i;
        }
      } else if (weight > thresholdWeight) {
        this._attributeModeUpdateVertexElement(vertexElements, vertexBufferStoreInfo, i, thresholdIndex);
        condensedBlendShapeWeights[thresholdIndex] = weight;

        thresholdWeight = Number.POSITIVE_INFINITY;
        for (let j = 0; j < condensedWeightsCount; j++) {
          const condensedWeight = condensedBlendShapeWeights[j];
          if (condensedWeight < thresholdWeight) {
            thresholdWeight = condensedWeight;
            thresholdIndex = j;
          }
        }
      }
    }
  }
}
