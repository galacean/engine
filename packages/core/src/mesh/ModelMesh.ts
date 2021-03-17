import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Mesh } from "../graphic/Mesh";
import { Buffer } from "../graphic/Buffer";
import { Engine } from "../Engine";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { IndexBufferBinding } from "../graphic";

const POSITION_VERTEX_ELEMENT = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
/**
 * Mesh containing common vertex elements of the model.
 */
export class ModelMesh extends Mesh {
  private _vertexCount: number = 0;
  private _accessible: boolean = true;
  private _indexBuffer: Buffer | null = null;
  private _vertexBuffer: Buffer | null = null;
  private _verticesFloat32: Float32Array | null = null;
  private _verticesUint8: Uint8Array | null = null;
  private _indices: Uint8Array | Uint16Array | Uint32Array | null = null;
  private _indicesFormat: IndexFormat = null;
  private _vertexSlotChanged: boolean = false;
  private _vertexCountChanged: boolean = false;

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
  private _weights: Vector4[] | null = null;
  private _joints: Vector4[] | null = null;
  private _vertexChangeFlag: number = 0;
  private _indicesChangeFlag: boolean = false;
  private _elementCount: number = 0;

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
   * Create a model mesh.
   * @param engine - Engine to which the mesh belongs
   * @param name - Mesh name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
  }

  /**
   * Upload Mesh Data to the graphics API.
   * @param noLongerAccessible - Whether to access data later. If true, you'll never access data anymore (free memory cache)
   */
  uploadData(noLongerAccessible: boolean): void {
    const { _indices, _vertexSlotChanged, _accessible } = this;
    if (!_accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    // Structure of vertex buffer has changed
    if (_vertexSlotChanged || this._vertexCountChanged) {
      const vertexElements = this._updateVertexElements();
      const elementCount = this._elementCount;
      let vertices = this._verticesFloat32;
      if (!vertices || vertices.length !== elementCount * this._vertexCount) {
        vertices && this._vertexBuffer.destroy();
        vertices = new Float32Array(elementCount * this._vertexCount);
        this._verticesUint8 = new Uint8Array(vertices.buffer);
        this._verticesFloat32 = vertices;
      }
      this._vertexChangeFlag = ValueChanged.All;
      this._updateVertices(vertices);
      this._vertexBuffer = new Buffer(
        this._engine,
        BufferBindFlag.VertexBuffer,
        vertices,
        noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic
      );
      this.setVertexElements(vertexElements);
      const bingding = new VertexBufferBinding(this._vertexBuffer, elementCount * 4);
      this._setVertexBufferBinding(0, bingding);
      this._vertexSlotChanged = false;
      this._vertexCountChanged = false;
    } else {
      const verticesArray = this._verticesFloat32;
      this._updateVertices(verticesArray);
      this._vertexBuffer!.setData(verticesArray);
    }

    if (_indices) {
      if (!this._indexBuffer || _indices.byteLength != this._indexBuffer.byteLength) {
        this._indexBuffer && this._indexBuffer.destroy();
        this._indexBuffer = new Buffer(this._engine, BufferBindFlag.IndexBuffer, _indices);
        this._setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, this._indicesFormat));
      } else if (this._indicesChangeFlag) {
        this._indicesChangeFlag = false;
        this._indexBuffer.setData(this._indices);
        if (this._indexBufferBinding._format !== this._indicesFormat) {
          this._setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, this._indicesFormat));
        }
      }
    } else if (this._indexBuffer) {
      this._indexBuffer.destroy();
      this._setIndexBufferBinding(null);
      this._indexBuffer = null;
    }

    if (noLongerAccessible) {
      this._accessible = false;
      this._releaseCache();
    }
  }

  /**
   * Set indices for the mesh.
   * @param indices - The indices for the mesh.
   */
  setIndices(indices: Uint8Array | Uint16Array | Uint32Array): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    this._indices = indices;
    if (indices === null) {
      return;
    }

    if (indices instanceof Uint8Array) {
      this._indicesFormat = IndexFormat.UInt8;
    } else if (indices instanceof Uint16Array) {
      this._indicesFormat = IndexFormat.UInt16;
    } else if (indices instanceof Uint32Array) {
      this._indicesFormat = IndexFormat.UInt32;
    }
    this._indicesChangeFlag = true;
  }

  /**
   * Get indices for the mesh.
   */
  getIndices(): Uint8Array | Uint16Array | Uint32Array {
    return this._indices;
  }

  /**
   * Set positions for the mesh.
   * @param positions - The positions for the mesh.
   */
  setPositions(positions: Vector3[]): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    const count = positions.length;
    this._positions = positions;
    this._vertexChangeFlag |= ValueChanged.Position;

    if (this._vertexCount !== count) {
      this._vertexCount = count;
      this._vertexCountChanged = true;
    }
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
   * Set per-vertex weights for the mesh.
   * @param weights - The weights for the mesh.
   */
  setWeights(weights: Vector4[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (weights.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = weights != null;
    this._vertexChangeFlag |= ValueChanged.Weight;
    this._weights = weights;
  }

  /**
   * Get weights for the mesh.
   * @remarks Please call the setWeights() method after modification to ensure that the modification takes effect.
   */
  getWeights(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._weights;
  }

  /**
   * Set per-vertex joints for the mesh.
   * @param joints - The joints for the mesh.
   */
  setJoints(joints: Vector4[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (joints.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._joints !== !!joints;
    this._vertexChangeFlag |= ValueChanged.Joint;
    this._joints = joints;
  }

  /**
   * Get joints for the mesh.
   * @remarks Please call the setJoints() method after modification to ensure that the modification takes effect.
   */
  getJoints(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._joints;
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

  private _updateVertexElements(): VertexElement[] {
    const vertexElements = [POSITION_VERTEX_ELEMENT];
    const { _colors, _normals, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7, _weights, _joints } = this;
    let offset = 12;
    let elementCount = 3;
    if (_normals) {
      vertexElements.push(new VertexElement("NORMAL", offset, VertexElementFormat.Vector3, 0));
      offset += 12;
      elementCount += 3;
    }
    if (_colors) {
      vertexElements.push(new VertexElement("COLOR_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
      elementCount += 4;
    }
    if (_weights) {
      vertexElements.push(new VertexElement("WEIGHTS_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
      elementCount += 4;
    }
    if (_joints) {
      vertexElements.push(new VertexElement("JOINTS_0", offset, VertexElementFormat.UByte4, 0));
      offset += 4;
      elementCount += 1;
    }
    if (_tangents) {
      vertexElements.push(new VertexElement("TANGENT", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
      elementCount += 4;
    }
    if (_uv) {
      vertexElements.push(new VertexElement("TEXCOORD_0", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv1) {
      vertexElements.push(new VertexElement("TEXCOORD_1", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv2) {
      vertexElements.push(new VertexElement("TEXCOORD_2", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv3) {
      vertexElements.push(new VertexElement("TEXCOORD_3", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv4) {
      vertexElements.push(new VertexElement("TEXCOORD_4", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv5) {
      vertexElements.push(new VertexElement("TEXCOORD_5", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv6) {
      vertexElements.push(new VertexElement("TEXCOORD_6", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }
    if (_uv7) {
      vertexElements.push(new VertexElement("TEXCOORD_7", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
      elementCount += 2;
    }

    this._elementCount = elementCount;
    return vertexElements;
  }

  private _updateVertices(vertices: Float32Array): void {
    // prettier-ignore
    const { _elementCount,_vertexCount, _positions, _normals, _colors, _vertexChangeFlag, _weights, _joints, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;

    if (_vertexChangeFlag & ValueChanged.Position) {
      for (let i = 0; i < _vertexCount; i++) {
        const start = _elementCount * i;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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

    if (_weights) {
      if (_vertexChangeFlag & ValueChanged.Weight) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const weight = _weights[i];
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

    if (_joints) {
      if (_vertexChangeFlag & ValueChanged.Joint) {
        const { _verticesUint8 } = this;
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const joint = _joints[i];
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
          const start = _elementCount * i + offset;
          const tangent = _tangents[i];
          if (tangent) {
            vertices[start] = tangent.x;
            vertices[start + 1] = tangent.y;
            vertices[start + 2] = tangent.z;
          }
        }
      }
      offset += 3;
    }
    if (_uv) {
      if (_vertexChangeFlag & ValueChanged.UV) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
          const start = _elementCount * i + offset;
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
    this._indexBuffer = null;
    this._verticesUint8 = null;
    this._vertexBuffer = null;
    this._indices = null;
    this._verticesFloat32 = null;
    this._positions.length = 0;
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
  }
}

enum ValueChanged {
  Position = 0x1,
  Normal = 0x2,
  Color = 0x4,
  Tangent = 0x8,
  Weight = 0x10,
  Joint = 0x20,
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
