import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { IndexBufferBinding } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Mesh } from "../graphic/Mesh";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BlendShape } from "./BlendShape";
import { BlendShapeManager } from "./BlendShapeManager";

/**
 * Mesh containing common vertex elements of the model.
 */
export class ModelMesh extends Mesh {
  /** @internal */
  _blendShapeManager: BlendShapeManager;

  private _vertexCount: number = 0;
  private _accessible: boolean = true;
  private _verticesFloat32: Float32Array | null = null;
  private _verticesUint8: Uint8Array | null = null;
  private _indices: Uint8Array | Uint16Array | Uint32Array | null = null;
  private _indicesFormat: IndexFormat = null;
  private _vertexSlotChanged: boolean = true;
  private _vertexChangeFlag: number = 0;
  private _indicesChangeFlag: boolean = false;
  private _vertexStrideFloat: number = 0;
  private _lastUploadVertexCount: number = -1;

  private _positions: Vector3[] = [];
  private _normals: Vector3[] | null = null;
  private _colors: Color[] | null = null;
  private _tangents: Vector4[] | null = null;
  private _uv: Vector2[] | null = null;
  private _uv1: Vector2[] | null = null;
  private _uv2: Vector2[] | null = null;
  private _uv3: Vector2[] | null = null;
  private _uv4: Vector2[] | null = null;
  private _uv5: Vector2[] | null = null;
  private _uv6: Vector2[] | null = null;
  private _uv7: Vector2[] | null = null;
  private _boneWeights: Vector4[] | null = null;
  private _boneIndices: Vector4[] | null = null;

  /**
   * Whether to access data of the mesh.
   */
  get accessible(): boolean {
    return this._accessible;
  }

  /**
   * Vertex count of current mesh.
   */
  get vertexCount(): number {
    return this._vertexCount;
  }

  /**
   * BlendShapes of this ModelMesh.
   */
  get blendShapes(): Readonly<BlendShape[]> {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._blendShapeManager._blendShapes;
  }

  /**
   * BlendShape count of this ModelMesh.
   */
  get blendShapeCount(): number {
    return this._blendShapeManager._blendShapeCount;
  }

  /**
   * Create a model mesh.
   * @param engine - Engine to which the mesh belongs
   * @param name - Mesh name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this._blendShapeManager = new BlendShapeManager(engine, this);
  }

  /**
   * Set positions for the mesh.
   * @param positions - The positions for the mesh.
   */
  setPositions(positions: Vector3[]): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    this._positions = positions;
    this._vertexCount = positions.length;
    this._vertexChangeFlag |= ValueChanged.Position;
  }

  /**
   * Get positions for the mesh.
   * @remarks Please call the setPositions() method after modification to ensure that the modification takes effect.
   */
  getPositions(): Vector3[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._positions;
  }

  /**
   * Set per-vertex normals for the mesh.
   * @param normals - The normals for the mesh.
   */
  setNormals(normals: Vector3[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (normals.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._normals !== !!normals;
    this._vertexChangeFlag |= ValueChanged.Normal;
    this._normals = normals;
  }

  /**
   * Get normals for the mesh.
   * @remarks Please call the setNormals() method after modification to ensure that the modification takes effect.
   */
  getNormals(): Vector3[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._normals;
  }

  /**
   * Set per-vertex colors for the mesh.
   * @param colors - The colors for the mesh.
   */
  setColors(colors: Color[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (colors.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._colors !== !!colors;
    this._vertexChangeFlag |= ValueChanged.Color;
    this._colors = colors;
  }

  /**
   * Get colors for the mesh.
   * @remarks Please call the setColors() method after modification to ensure that the modification takes effect.
   */
  getColors(): Color[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._colors;
  }

  /**
   * Set per-vertex bone weights for the mesh.
   * @param boneWeights - The bone weights for the mesh.
   */
  setBoneWeights(boneWeights: Vector4[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (boneWeights.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = boneWeights != null;
    this._vertexChangeFlag |= ValueChanged.BoneWeight;
    this._boneWeights = boneWeights;
  }

  /**
   * Get weights for the mesh.
   * @remarks Please call the setWeights() method after modification to ensure that the modification takes effect.
   */
  getBoneWeights(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._boneWeights;
  }

  /**
   * Set per-vertex bone indices for the mesh.
   * @param boneIndices - The bone indices for the mesh.
   */
  setBoneIndices(boneIndices: Vector4[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (boneIndices.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._boneIndices !== !!boneIndices;
    this._vertexChangeFlag |= ValueChanged.BoneIndex;
    this._boneIndices = boneIndices;
  }

  /**
   * Get joints for the mesh.
   * @remarks Please call the setBoneIndices() method after modification to ensure that the modification takes effect.
   */
  getBoneIndices(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._boneIndices;
  }

  /**
   * Set per-vertex tangents for the mesh.
   * @param tangents - The tangents for the mesh.
   */
  setTangents(tangents: Vector4[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (tangents.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._tangents !== !!tangents;
    this._vertexChangeFlag |= ValueChanged.Tangent;
    this._tangents = tangents;
  }

  /**
   * Get tangents for the mesh.
   * @remarks Please call the setTangents() method after modification to ensure that the modification takes effect.
   */
  getTangents(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._tangents;
  }

  /**
   * Set per-vertex uv for the mesh.
   * @param uv - The uv for the mesh.
   */
  setUVs(uv: Vector2[] | null): void;
  /**
   * Set per-vertex uv for the mesh by channelIndex.
   * @param uv - The uv for the mesh.
   * @param channelIndex - The index of uv channels, in [0 ~ 7] range.
   */
  setUVs(uv: Vector2[] | null, channelIndex: number): void;
  setUVs(uv: Vector2[] | null, channelIndex?: number): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    channelIndex = channelIndex ?? 0;
    switch (channelIndex) {
      case 0:
        this._vertexSlotChanged = !!this._uv !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV;
        this._uv = uv;
        break;
      case 1:
        this._vertexSlotChanged = !!this._uv1 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV1;
        this._uv1 = uv;
        break;
      case 2:
        this._vertexSlotChanged = !!this._uv2 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV2;
        this._uv2 = uv;
        break;
      case 3:
        this._vertexSlotChanged = !!this._uv3 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV3;
        this._uv3 = uv;
        break;
      case 4:
        this._vertexSlotChanged = !!this._uv4 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV4;
        this._uv4 = uv;
        break;
      case 5:
        this._vertexSlotChanged = !!this._uv5 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV5;
        this._uv5 = uv;
        break;
      case 6:
        this._vertexSlotChanged = !!this._uv6 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV6;
        this._uv6 = uv;
        break;
      case 7:
        this._vertexSlotChanged = !!this._uv7 !== !!uv;
        this._vertexChangeFlag |= ValueChanged.UV7;
        this._uv7 = uv;
        break;
      default:
        throw "The index of channel needs to be in range [0 - 7].";
    }
  }

  /**
   * Get uv for the mesh.
   * @remarks Please call the setUV() method after modification to ensure that the modification takes effect.
   */
  getUVs(): Vector2[] | null;
  /**
   * Get uv for the mesh by channelIndex.
   * @param channelIndex - The index of uv channels, in [0 ~ 7] range.
   * @remarks Please call the setUV() method after modification to ensure that the modification takes effect.
   */
  getUVs(channelIndex: number): Vector2[] | null;
  getUVs(channelIndex?: number): Vector2[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    channelIndex = channelIndex ?? 0;
    switch (channelIndex) {
      case 0:
        return this._uv;
      case 1:
        return this._uv1;
      case 2:
        return this._uv2;
      case 3:
        return this._uv3;
      case 4:
        return this._uv4;
      case 5:
        return this._uv5;
      case 6:
        return this._uv6;
      case 7:
        return this._uv7;
    }
    throw "The index of channel needs to be in range [0 - 7].";
  }

  /**
   * Set indices for the mesh.
   * @param indices - The indices for the mesh.
   */
  setIndices(indices: Uint8Array | Uint16Array | Uint32Array): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (this._indices !== indices) {
      this._indices = indices;
      if (indices instanceof Uint8Array) {
        this._indicesFormat = IndexFormat.UInt8;
      } else if (indices instanceof Uint16Array) {
        this._indicesFormat = IndexFormat.UInt16;
      } else if (indices instanceof Uint32Array) {
        this._indicesFormat = IndexFormat.UInt32;
      }
    }

    this._indicesChangeFlag = true;
  }

  /**
   * Get indices for the mesh.
   */
  getIndices(): Uint8Array | Uint16Array | Uint32Array {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._indices;
  }

  /**
   * Add a BlendShape for this ModelMesh.
   * @param blendShape - The BlendShape
   */
  addBlendShape(blendShape: BlendShape): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    this._blendShapeManager._addBlendShape(blendShape);
  }

  /**
   * Clear all BlendShapes.
   */
  clearBlendShapes(): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    this._blendShapeManager._clearBlendShapes();
  }

  /**
   * Get name of BlendShape by given index.
   * @param index - The index of BlendShape
   * @returns The name of BlendShape
   */
  getBlendShapeName(index: number): string {
    if (this._accessible) {
      const blendShapes = this._blendShapeManager._blendShapes;
      return blendShapes[index].name;
    } else {
      return this._blendShapeManager._blendShapeNames[index];
    }
  }

  /**
   * Upload Mesh Data to GPU.
   * @param noLongerAccessible - Whether to access data later. If true, you'll never access data anymore (free memory cache)
   */
  uploadData(noLongerAccessible: boolean): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    const { _vertexCount: vertexCount } = this;
    const vertexElementChanged = this._updateVertexElements();
    const vertexCountChange = this._lastUploadVertexCount !== vertexCount;

    // Vertex count change
    const vertexBuffer = this._vertexBufferBindings[0]?._buffer;
    if (vertexCountChange) {
      vertexBuffer?.destroy();
      const elementCount = this._vertexStrideFloat;
      const vertexFloatCount = elementCount * vertexCount;
      const vertices = new Float32Array(vertexFloatCount);
      this._verticesFloat32 = vertices;
      this._verticesUint8 = new Uint8Array(vertices.buffer);
      this._updateVertices(vertices, true);

      const newVertexBuffer = new Buffer(
        this._engine,
        BufferBindFlag.VertexBuffer,
        vertices,
        noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic
      );

      this._setVertexBufferBinding(0, new VertexBufferBinding(newVertexBuffer, elementCount * 4));
      this._lastUploadVertexCount = vertexCount;
    } else {
      if (this._vertexChangeFlag & ValueChanged.All) {
        const vertices = this._verticesFloat32;
        this._updateVertices(vertices, vertexElementChanged);
        vertexBuffer.setData(vertices);
      }
    }

    const { _indices: indices } = this;
    const indexBuffer = this._indexBufferBinding?._buffer;
    if (indices) {
      if (!indexBuffer || indices.byteLength != indexBuffer.byteLength) {
        indexBuffer?.destroy();
        const newIndexBuffer = new Buffer(this._engine, BufferBindFlag.IndexBuffer, indices);
        this._setIndexBufferBinding(new IndexBufferBinding(newIndexBuffer, this._indicesFormat));
        this._indicesChangeFlag = false;
      } else if (this._indicesChangeFlag) {
        indexBuffer.setData(indices);
        if (this._indexBufferBinding._format !== this._indicesFormat) {
          this._setIndexBufferBinding(new IndexBufferBinding(indexBuffer, this._indicesFormat));
        }
        this._indicesChangeFlag = false;
      }
    } else if (indexBuffer) {
      indexBuffer.destroy();
      this._setIndexBufferBinding(null);
    }

    const { _blendShapeManager: blendShapeManager } = this;
    blendShapeManager._blendShapeCount > 0 && blendShapeManager._update(vertexCountChange, noLongerAccessible);

    if (noLongerAccessible) {
      this._accessible = false;
      this._releaseCache();
    }
  }

  /**
   * @override
   * @internal
   */
  _onDestroy(): void {
    super._onDestroy();
    this._accessible && this._releaseCache();
  }

  private _updateVertexElements(): boolean {
    const blendShapeManager = this._blendShapeManager;
    const attributeMode = !blendShapeManager._useTextureMode();

    if (this._vertexSlotChanged || (attributeMode && blendShapeManager._vertexElementsNeedUpdate())) {
      let offset = 12;
      let elementCount = 3;
      this._clearVertexElements();
      this._addVertexElement(POSITION_VERTEX_ELEMENT);

      if (this._normals) {
        this._addVertexElement(new VertexElement("NORMAL", offset, VertexElementFormat.Vector3, 0));
        offset += 12;
        elementCount += 3;
      }
      if (this._colors) {
        this._addVertexElement(new VertexElement("COLOR_0", offset, VertexElementFormat.Vector4, 0));
        offset += 16;
        elementCount += 4;
      }
      if (this._boneWeights) {
        this._addVertexElement(new VertexElement("WEIGHTS_0", offset, VertexElementFormat.Vector4, 0));
        offset += 16;
        elementCount += 4;
      }
      if (this._boneIndices) {
        this._addVertexElement(new VertexElement("JOINTS_0", offset, VertexElementFormat.UByte4, 0));
        offset += 4;
        elementCount += 1;
      }
      if (this._tangents) {
        this._addVertexElement(new VertexElement("TANGENT", offset, VertexElementFormat.Vector4, 0));
        offset += 16;
        elementCount += 4;
      }
      if (this._uv) {
        this._addVertexElement(new VertexElement("TEXCOORD_0", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv1) {
        this._addVertexElement(new VertexElement("TEXCOORD_1", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv2) {
        this._addVertexElement(new VertexElement("TEXCOORD_2", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv3) {
        this._addVertexElement(new VertexElement("TEXCOORD_3", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv4) {
        this._addVertexElement(new VertexElement("TEXCOORD_4", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv5) {
        this._addVertexElement(new VertexElement("TEXCOORD_5", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv6) {
        this._addVertexElement(new VertexElement("TEXCOORD_6", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (this._uv7) {
        this._addVertexElement(new VertexElement("TEXCOORD_7", offset, VertexElementFormat.Vector2, 0));
        offset += 8;
        elementCount += 2;
      }
      if (attributeMode) {
        blendShapeManager._blendShapeCount > 0 && blendShapeManager._addVertexElements(this);
      }
      this._vertexSlotChanged = false;
      this._vertexStrideFloat = elementCount;
      return true;
    }
    return false;
  }

  private _updateVertices(vertices: Float32Array, force: boolean): void {
    // prettier-ignore
    const { _vertexStrideFloat,_vertexCount, _positions, _normals, _colors, _vertexChangeFlag, _boneWeights, _boneIndices, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;

    force && (this._vertexChangeFlag = ValueChanged.All);

    if (_vertexChangeFlag & ValueChanged.Position) {
      for (let i = 0; i < _vertexCount; i++) {
        const start = _vertexStrideFloat * i;
        const position = _positions[i];
        vertices[start] = position.x;
        vertices[start + 1] = position.y;
        vertices[start + 2] = position.z;
      }
    }

    let offset = 3;

    if (_normals) {
      if (_vertexChangeFlag & ValueChanged.Normal) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const normal = _normals[i];
          if (normal) {
            vertices[start] = normal.x;
            vertices[start + 1] = normal.y;
            vertices[start + 2] = normal.z;
          }
        }
      }
      offset += 3;
    }

    if (_colors) {
      if (_vertexChangeFlag & ValueChanged.Color) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const color = _colors[i];
          if (color) {
            vertices[start] = color.r;
            vertices[start + 1] = color.g;
            vertices[start + 2] = color.b;
            vertices[start + 3] = color.a;
          }
        }
      }
      offset += 4;
    }

    if (_boneWeights) {
      if (_vertexChangeFlag & ValueChanged.BoneWeight) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const weight = _boneWeights[i];
          if (weight) {
            vertices[start] = weight.x;
            vertices[start + 1] = weight.y;
            vertices[start + 2] = weight.z;
            vertices[start + 3] = weight.w;
          }
        }
      }
      offset += 4;
    }

    if (_boneIndices) {
      if (_vertexChangeFlag & ValueChanged.BoneIndex) {
        const { _verticesUint8 } = this;
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const joint = _boneIndices[i];
          if (joint) {
            const internalStart = start * 4;
            _verticesUint8[internalStart] = joint.x;
            _verticesUint8[internalStart + 1] = joint.y;
            _verticesUint8[internalStart + 2] = joint.z;
            _verticesUint8[internalStart + 3] = joint.w;
          }
        }
      }
      offset += 1;
    }

    if (_tangents) {
      if (_vertexChangeFlag & ValueChanged.Tangent) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const tangent = _tangents[i];
          if (tangent) {
            vertices[start] = tangent.x;
            vertices[start + 1] = tangent.y;
            vertices[start + 2] = tangent.z;
          }
        }
      }
      offset += 4;
    }
    if (_uv) {
      if (_vertexChangeFlag & ValueChanged.UV) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv1) {
      if (_vertexChangeFlag & ValueChanged.UV1) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv1[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv2) {
      if (_vertexChangeFlag & ValueChanged.UV2) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv2[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv3) {
      if (_vertexChangeFlag & ValueChanged.UV3) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv3[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv4) {
      if (_vertexChangeFlag & ValueChanged.UV4) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv4[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv5) {
      if (_vertexChangeFlag & ValueChanged.UV5) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv5[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv6) {
      if (_vertexChangeFlag & ValueChanged.UV6) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv6[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    if (_uv7) {
      if (_vertexChangeFlag & ValueChanged.UV7) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const uv = _uv7[i];
          if (uv) {
            vertices[start] = uv.x;
            vertices[start + 1] = uv.y;
          }
        }
      }
      offset += 2;
    }
    this._vertexChangeFlag = 0;
  }

  private _releaseCache(): void {
    this._verticesUint8 = null;
    this._indices = null;
    this._verticesFloat32 = null;
    this._positions = null;
    this._tangents = null;
    this._normals = null;
    this._colors = null;
    this._uv = null;
    this._uv1 = null;
    this._uv2 = null;
    this._uv3 = null;
    this._uv4 = null;
    this._uv5 = null;
    this._uv6 = null;
    this._uv7 = null;
    this._blendShapeManager._releaseMemoryCache();
  }

  toObject() {
    return {
      // positions: this._positions.map((item) => item.toObject()),
      // normals: this._normals?.map((item) => item.toObject()),
      // uvs: this._uv?.map((item) => item.toObject()),
      // uv1: this._uv1?.map((item) => item.toObject()),
      // uv2: this._uv2?.map((item) => item.toObject()),
      // uv3: this._uv3?.map((item) => item.toObject()),
      // uv4: this._uv4?.map((item) => item.toObject()),
      // uv5: this._uv5?.map((item) => item.toObject()),
      // uv6: this._uv6?.map((item) => item.toObject()),
      // uv7: this._uv7?.map((item) => item.toObject()),
      // colors: this._colors?.map((item) => item.toObject()),
      // tangents: this._tangents?.map((item) => item.toObject()),
      // boneWeights: this._boneWeights?.map((item) => item.toObject()),
      // boneIndices: this._boneIndices?.map((item) => item.toObject()),
      blendShapes: this._blendShapeManager._blendShapes?.map((item) => item.toObject()),
      indices: Array.from(this._indices),
      subMeshes: this.subMeshes.map((item) => ({ start: item.start, topology: item.topology, count: item.count }))
    };
  }
}

const POSITION_VERTEX_ELEMENT = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);

enum ValueChanged {
  Position = 0x1,
  Normal = 0x2,
  Color = 0x4,
  Tangent = 0x8,
  BoneWeight = 0x10,
  BoneIndex = 0x20,
  UV = 0x40,
  UV1 = 0x80,
  UV2 = 0x100,
  UV3 = 0x200,
  UV4 = 0x400,
  UV5 = 0x800,
  UV6 = 0x1000,
  UV7 = 0x2000,
  All = 0xffff
}
