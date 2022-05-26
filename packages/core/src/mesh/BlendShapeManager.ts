import { Vector2, Vector3 } from "@oasis-engine/math";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { ListenerUpdateFlag } from "../ListenerUpdateFlag";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { Texture2DArray, TextureFilterMode, TextureFormat } from "../texture";
import { BlendShape } from "./BlendShape";
import { ModelMesh } from "./ModelMesh";
import { SkinnedMeshRenderer } from "./SkinnedMeshRenderer";

/**
 * @internal
 */
export class BlendShapeManager {
  private static _blendShapeMacro = Shader.getMacroByName("OASIS_BLENDSHAPE");
  private static _blendShapeTextureMacro = Shader.getMacroByName("OASIS_BLENDSHAPE_TEXTURE");
  private static _blendShapeNormalMacro = Shader.getMacroByName("OASIS_BLENDSHAPE_NORMAL");
  private static _blendShapeTangentMacro = Shader.getMacroByName("OASIS_BLENDSHAPE_TANGENT");

  private static _blendShapeWeightsProperty = Shader.getPropertyByName("u_blendShapeWeights");
  private static _blendShapeTextureProperty = Shader.getPropertyByName("u_blendShapeTexture");
  private static _blendShapeTextureInfoProperty = Shader.getPropertyByName("u_blendShapeTextureInfo");

  /** @internal */
  _blendShapeCount: number = 0;
  /** @internal */
  _useBlendNormal: boolean = true;
  /** @internal */
  _useBlendTangent: boolean = true;
  /** @internal */
  _blendShapes: BlendShape[] = [];
  /** @internal */
  _blendShapeNames: string[];
  /** @internal */
  _layoutDirtyFlag: ListenerUpdateFlag = new ListenerUpdateFlag();
  /** @internal */
  _subDataDirtyFlags: BoolUpdateFlag[] = [];
  /** @internal */
  _vertexTexture: Texture2DArray;
  /** @internal */
  _vertexBuffers: Buffer[] = [];
  /** @internal */
  _vertices: Float32Array;

  private _vertexElementCount: number = 0;
  private _vertexElementStartIndex: number;
  private _storeVertexBufferInfo: Vector2[] = [];
  private _maxCountSingleVertexBuffer: number = 0;
  private readonly _engine: Engine;
  private readonly _modelMesh: ModelMesh;
  private readonly _lastCreateHostInfo: Vector3 = new Vector3(0, 0, 0);
  private readonly _canUseTextureStoreData: boolean = true;
  private readonly _dataTextureInfo: Vector3 = new Vector3();

  constructor(engine: Engine, modelMesh: ModelMesh) {
    this._engine = engine;
    this._modelMesh = modelMesh;
    this._canUseTextureStoreData = this._engine._hardwareRenderer.capability.canUseFloatTextureBlendShape;
    this._layoutDirtyFlag.listener = this._updateLayoutChange.bind(this);
  }

  /**
   * @internal
   */
  _addBlendShape(blendShape: BlendShape): void {
    this._blendShapes.push(blendShape);
    this._blendShapeCount++;

    blendShape._addLayoutChangeFlag(this._layoutDirtyFlag);
    this._updateLayoutChange(blendShape);

    this._subDataDirtyFlags.push(blendShape._createSubDataDirtyFlag());
  }

  /**
   * @internal
   */
  _clearBlendShapes(): void {
    this._useBlendNormal = true;
    this._useBlendTangent = true;
    this._vertexElementCount = 0;
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
  _updateShaderData(shaderData: ShaderData, skinnedMeshRenderer: SkinnedMeshRenderer): void {
    const blendShapeCount = this._blendShapeCount;
    if (blendShapeCount > 0) {
      shaderData.enableMacro(BlendShapeManager._blendShapeMacro);
      shaderData.enableMacro("OASIS_BLENDSHAPE_COUNT", blendShapeCount.toString());
      if (this._useTextureMode()) {
        shaderData.enableMacro(BlendShapeManager._blendShapeTextureMacro);
        shaderData.setTexture(BlendShapeManager._blendShapeTextureProperty, this._vertexTexture);
        shaderData.setVector3(BlendShapeManager._blendShapeTextureInfoProperty, this._dataTextureInfo);
        shaderData.setFloatArray(BlendShapeManager._blendShapeWeightsProperty, skinnedMeshRenderer._blendShapeWeights);
      } else {
        const maxBlendCount = this._getAttributeModeSupportCount();
        if (blendShapeCount > maxBlendCount) {
          let condensedBlendShapeWeights = skinnedMeshRenderer._condensedBlendShapeWeights;
          if (!condensedBlendShapeWeights) {
            condensedBlendShapeWeights = new Float32Array(maxBlendCount);
            skinnedMeshRenderer._condensedBlendShapeWeights = condensedBlendShapeWeights;
          }
          this._filterCondensedBlendShapeWeights(skinnedMeshRenderer._blendShapeWeights, condensedBlendShapeWeights);
          shaderData.setFloatArray(BlendShapeManager._blendShapeWeightsProperty, condensedBlendShapeWeights);
        } else {
          shaderData.setFloatArray(
            BlendShapeManager._blendShapeWeightsProperty,
            skinnedMeshRenderer._blendShapeWeights
          );
        }
        shaderData.disableMacro(BlendShapeManager._blendShapeTextureMacro);
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
      shaderData.disableMacro("OASIS_BLENDSHAPE_COUNT");
    }
  }

  /**
   * @internal
   */
  _useTextureMode(): boolean {
    if (!this._canUseTextureStoreData) {
      return false;
    }
    return this._blendShapeCount > this._getAttributeModeSupportCount();
  }

  /**
   * @internal
   */
  _layoutOrCountChange(): boolean {
    const last = this._lastCreateHostInfo;
    if (last.x !== this._blendShapeCount || !!last.y !== this._useBlendNormal || !!last.z !== this._useBlendTangent) {
      return true;
    }
  }

  /**
   * @internal
   */
  _vertexElementsNeedUpdate(): boolean {
    const last = this._lastCreateHostInfo;
    if (
      last.x !== Math.min(this._blendShapeCount, this._getAttributeModeSupportCount()) ||
      !!last.y !== this._useBlendNormal ||
      !!last.z !== this._useBlendTangent
    ) {
      return true;
    }
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

  /**
   * @internal
   */
  _addVertexElements(modelMesh: ModelMesh): void {
    let offset = 0;
    this._vertexElementStartIndex = modelMesh._vertexElements.length;
    for (let i = 0, n = Math.min(this._blendShapeCount, this._getAttributeModeSupportCount()); i < n; i++) {
      modelMesh._addVertexElement(new VertexElement(`POSITION_BS${i}`, offset, VertexElementFormat.Vector3, 1));
      offset += 12;
      if (this._useBlendNormal) {
        modelMesh._addVertexElement(new VertexElement(`NORMAL_BS${i}`, offset, VertexElementFormat.Vector3, 1));
        offset += 12;
      }
      if (this._useBlendTangent) {
        modelMesh._addVertexElement(new VertexElement(`TANGENT_BS${i}`, offset, VertexElementFormat.Vector3, 1));
        offset += 12;
      }
    }
  }

  /**
   * @internal
   */
  _update(modelMesh: ModelMesh, vertexCountChange: boolean, noLongerAccessible: boolean): void {
    const { vertexCount } = modelMesh;
    const useTexture = this._useTextureMode();
    const createHost = this._layoutOrCountChange() || vertexCountChange;
    if (createHost) {
      if (useTexture) {
        this._createTextureArray(vertexCount);
      } else {
        this._createVertexBuffers(modelMesh, vertexCount, noLongerAccessible);
      }
      this._lastCreateHostInfo.setValue(this._blendShapeCount, +this._useBlendNormal, +this._useBlendTangent);
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
    const { _blendShapes: blendShapes } = this;
    const blendShapeNamesMap = new Array<string>(blendShapes.length);
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      blendShapeNamesMap[i] = blendShapes[i].name;
    }
    this._blendShapeNames = blendShapeNamesMap;

    this._layoutDirtyFlag.destroy();
    const dataChangedFlags = this._subDataDirtyFlags;
    for (let i = 0, n = dataChangedFlags.length; i < n; i++) {
      dataChangedFlags[i].destroy();
    }

    this._layoutDirtyFlag = null;
    this._subDataDirtyFlags = null;
    this._blendShapes = null;
  }

  private _createVertexBuffers(modelMesh: ModelMesh, vertexCount: number, noLongerAccessible: boolean): void {
    const { _engine: engine, _blendShapeCount: blendShapeCount, _vertexBuffers: vertexBuffers } = this;
    const vertexFloatCount = this._vertexElementCount * 3;
    const vertexByteCount = vertexFloatCount * 4;
    const maxCountSingleBuffer = Math.floor(255 / vertexByteCount); // 255: Attribute MaxStride
    const bufferCount = Math.ceil(blendShapeCount / maxCountSingleBuffer);
    const floatCount = vertexFloatCount * vertexCount * Math.min(maxCountSingleBuffer, blendShapeCount);

    vertexBuffers.length = bufferCount;
    this._vertices = new Float32Array(floatCount);
    this._maxCountSingleVertexBuffer = maxCountSingleBuffer;
    this._storeVertexBufferInfo.length = blendShapeCount;

    for (let i = 0; i < bufferCount; i++) {
      const lastIndex = bufferCount - 1;
      const containCount = i === lastIndex ? blendShapeCount - lastIndex * maxCountSingleBuffer : maxCountSingleBuffer;
      const stride = containCount * vertexByteCount;
      const byteLength = stride * vertexCount;

      const usage = noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic;

      const blendShapeBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, usage);
      modelMesh._setVertexBufferBinding(i + 1, new VertexBufferBinding(blendShapeBuffer, stride));
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
      false
    );
    blendShapeDataTexture.filterMode = TextureFilterMode.Point;

    this._vertices = new Float32Array(blendShapeCount * textureWidth * textureHeight * 4);
    this._vertexTexture = blendShapeDataTexture;
    this._dataTextureInfo.setValue(vertexPixelStride, textureWidth, textureHeight);
  }

  /**
   * @internal
   */
  _updateVertexBuffers(vertexCount: number, force: boolean): void {
    const { _maxCountSingleVertexBuffer: maxCountSingleBuffer } = this;
    const { _vertices: vertices, _vertexBuffers: vertexBuffers, _storeVertexBufferInfo: vertexBufferStoreInfo } = this;
    const { _blendShapeCount: blendShapeCount, _blendShapes: blendShapes } = this;

    const subDataDirtyFlags = this._subDataDirtyFlags;
    const blendShapeFloatStride = this._vertexElementCount * 3;

    for (let i = 0; i < blendShapeCount; i++) {
      const dataChangedFlag = subDataDirtyFlags[i];
      if (force || dataChangedFlag.flag) {
        const { frames } = blendShapes[i];
        const frameCount = frames.length;
        const endFrame = frames[frameCount - 1];
        if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
          throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
        }

        const bufferIndex = Math.floor(i / maxCountSingleBuffer);
        const buffer = vertexBuffers[bufferIndex];
        const bufferStrideFloat = buffer.byteLength / (vertexCount * 4);

        const indexInBuffer = i % maxCountSingleBuffer;

        let offset = indexInBuffer * blendShapeFloatStride;

        let storeInfo = vertexBufferStoreInfo[i];
        storeInfo || (vertexBufferStoreInfo[i] = storeInfo = new Vector2());
        storeInfo.setValue(bufferIndex + 1, indexInBuffer * blendShapeFloatStride * 4); // BlendShape buffer is from 1

        const { deltaPositions } = endFrame;
        for (let j = 0; j < vertexCount; j++) {
          const start = offset + bufferStrideFloat * j;
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
              const start = offset + bufferStrideFloat * j;
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
              const start = offset + bufferStrideFloat * j;
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

        if (indexInBuffer === maxCountSingleBuffer - 1 || i === blendShapeCount - 1) {
          buffer.setData(vertices, 0, 0, buffer.byteLength / 4);
        }

        dataChangedFlag.flag = false;
      }
    }
  }

  private _updateTextureArray(vertexCount: number, force: boolean): void {
    const {
      _blendShapes: blendShapes,
      _vertexTexture: dataTexture,
      _vertices: buffer,
      _subDataDirtyFlags: subDataDirtyFlags
    } = this;

    let offset = 0;
    for (let i = 0, n = blendShapes.length; i < n; i++) {
      const subDirtyFlag = subDataDirtyFlags[i];
      const subBlendShapeDataStride = dataTexture.width * dataTexture.height * 4;
      if (force || subDirtyFlag.flag) {
        const { frames } = blendShapes[i];
        const frameCount = frames.length;
        const endFrame = frames[frameCount - 1];
        if (frameCount > 0 && endFrame.deltaPositions.length !== vertexCount) {
          throw "BlendShape frame deltaPositions length must same with mesh vertexCount.";
        }
        const { deltaPositions, deltaNormals, deltaTangents } = endFrame;
        offset = i * subBlendShapeDataStride;
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
  }

  private _updateLayoutChange(blendShape: BlendShape): void {
    const useBlendNormal = blendShape._useBlendShapeNormal && this._useBlendNormal;
    const useBlendTangent = blendShape._useBlendShapeTangent && this._useBlendTangent;

    let vertexElementCount = 1;
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
    let elementOffset = this._vertexElementStartIndex + this._vertexElementCount * condensedIndex;

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

  private _getAttributeModeSupportCount(): number {
    if (this._useBlendNormal || this._useBlendTangent) {
      return 4;
    } else {
      return 8;
    }
  }

  private _filterCondensedBlendShapeWeights(
    blendShapeWeights: Float32Array,
    condensedBlendShapeWeights: Float32Array
  ): void {
    const weightsCount = blendShapeWeights.length;
    const condensedWeightsCount = condensedBlendShapeWeights.length;
    const vertexElements = this._modelMesh._vertexElements;
    const vertexBufferStoreInfo = this._storeVertexBufferInfo;
    let thresholdWeight = Number.POSITIVE_INFINITY;
    let thresholdIndex: number;
    for (let i = 0; i < weightsCount; i++) {
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
