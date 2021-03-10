import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Mesh } from "../graphic/Mesh";
import { Buffer } from "../graphic/Buffer";
import { Engine } from "../Engine";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";

const POSITION_VERTEX_ELEMENT = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);

/**
 * Mesh containing common vertex elements of the model.
 */
export class ModelMesh extends Mesh {
  private _vertexCount: number = 0;
  private _accessible: boolean = true;
  private _indexBuffer: Buffer | null = null;
  private _vertexBuffer: Buffer | null = null;
  private _verticesArray: Float32Array | null = null;
  private _indicesArray: Uint8Array | Uint16Array | Uint32Array | null = null;
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
  private _elementCount: number = 0;
  /**
   * Vertex count of current mesh.
   */
  private get vertexCount(): number {
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
  uploadMeshData(noLongerAccessible: boolean): void {
    const { _indicesArray, _vertexSlotChanged, _accessible } = this;
    if (!_accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    // Structure of vertex buffer has changed
    if (_vertexSlotChanged || this._vertexCountChanged) {
      const vertexElements = this._updateVertexElements();
      const elementCount = this._elementCount;
      const vertices = new Float32Array(elementCount * this.vertexCount);
      this._verticesArray = vertices;
      this._vertexChangeFlag = ValueChanged.All;
      this._resetVertexArrayData(vertices);
      this._vertexBuffer = new Buffer(
        this._engine,
        BufferBindFlag.VertexBuffer,
        vertices,
        noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic
      );
      this.setVertexElements(vertexElements);
      this.setVertexBufferBinding(new VertexBufferBinding(this._vertexBuffer, elementCount * 4));
      this._vertexSlotChanged = false;
      this._vertexCountChanged = false;
    } else {
      // TODO reset value
      const verticesArray = this._verticesArray;
      this._resetVertexArrayData(verticesArray);
      this._vertexBuffer!.setData(verticesArray);
    }

    if (_indicesArray) {
      if (!this._indexBuffer) {
        this._indexBuffer = new Buffer(this._engine, BufferBindFlag.IndexBuffer, _indicesArray);
        this.setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, this._indicesFormat));
      } else {
        this._indexBuffer.setData(this._indicesArray);
        if (this._indexBufferBinding._format !== this._indicesFormat) {
          this.setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, this._indicesFormat));
        }
      }
    } else if (this._indexBuffer) {
      this.setIndexBufferBinding(null);
      this._indexBuffer = null;
    }

    if (noLongerAccessible) {
      this._releaseCache();
    }
  }

  /**
   * Set IndicesArray for the mesh.
   * @param indices - The array of indices for the mesh.
   */
  setIndices(indices: Uint8Array | Uint16Array | Uint32Array) {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    this._indicesArray = indices;
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
  }

  /**
   * Get array of indices for the mesh.
   */
  getIndices(): Uint8Array | Uint16Array | Uint32Array {
    return this._indicesArray;
  }

  /**
   * Set positions array for the mesh.
   * @param positions - The array of positions for the mesh.
   */
  setPositions(positions: Vector3[]): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    this._vertexSlotChanged = true;
    const count = positions.length;
    this._positions = positions;
    if (this._vertexCount !== count) {
      this._vertexCount = count;
      this._vertexCountChanged = true;
    }
  }

  /**
   * Get array of positions for the mesh.
   */
  getPositions(): Vector3[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._positions;
  }

  /**
   * Set normals array for the mesh.
   * @param normals - The array of normals for the mesh.
   */
  setNormals(normals: Vector3[] | null) {
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
   * Get array of normals for the mesh.
   */
  getNormals() {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._normals;
  }

  /**
   * Set colors array for the mesh.
   * @param colors - The array of colors for the mesh.
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
   * Get array of colors for the mesh.
   */
  getColors(): Color[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._colors;
  }

  /**
   * Set weights array for the mesh.
   * @param weights - The array of weights for the mesh.
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
   * Get array of weights for the mesh.
   */
  getWeights(): Vector4[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._weights;
  }

  /**
   * Set joints array for the mesh.
   * @param joints - The array of joints for the mesh.
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
   * Get array of joints for the mesh.
   */
  getJoints(): Vector4[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._joints;
  }

  /**
   * Set tangents array for the mesh.
   * @param tangents - The array of tangents for the mesh.
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
   * Get array of tangents for the mesh.
   */
  getTangents(): Vector4[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._tangents;
  }

  /**
   * Set uv array for the mesh.
   * @param uv - The array of uv for the mesh.
   */
  setUV(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV;
    this._uv = uv;
  }

  /**
   * Get array of uv for the mesh.
   */
  getUV(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv;
  }

  /**
   * Set uv1 array for the mesh.
   * @param uv - The array of uv1 for the mesh.
   */
  setUV1(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv1 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV1;
    this._uv1 = uv;
  }

  /**
   * Get array of uv1 for the mesh.
   */
  getUV1(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv1;
  }

  /**
   * Set uv2 array for the mesh.
   * @param uv - The array of uv2 for the mesh.
   */
  setUV2(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv2 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV2;
    this._uv2 = uv;
  }

  /**
   * Get array of uv2 for the mesh.
   */
  getUV2(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv2;
  }

  /**
   * Set uv3 array for the mesh.
   * @param uv - The array of uv3 for the mesh.
   */
  setUV3(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv3 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV3;
    this._uv3 = uv;
  }

  /**
   * Get array of uv3 for the mesh.
   */
  getUV3(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv3;
  }

  /**
   * Set uv4 array for the mesh.
   * @param uv - The array of uv4 for the mesh.
   */
  setUV4(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv4 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV4;
    this._uv4 = uv;
  }

  /**
   * Get array of uv4 for the mesh.
   */
  getUV4(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv4;
  }

  /**
   * Set uv5 array for the mesh.
   * @param uv - The array of uv5 for the mesh.
   */
  setUV5(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv5 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV5;
    this._uv5 = uv;
  }

  /**
   * Get array of uv5 for the mesh.
   */
  getUV5(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv5;
  }

  /**
   * Set uv6 array for the mesh.
   * @param uv - The array of uv6 for the mesh.
   */
  setUV6(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv6 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV6;
    this._uv6 = uv;
  }

  /**
   * Get array of uv6 for the mesh.
   */
  getUV6(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv6;
  }

  /**
   * Set uv7 array for the mesh.
   * @param uv - The array of uv7 for the mesh.
   */
  setUV7(uv: Vector2[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    this._vertexSlotChanged = !!this._uv7 !== !!uv;
    this._vertexChangeFlag |= ValueChanged.UV7;
    this._uv7 = uv;
  }

  /**
   * Get array of uv7 for the mesh.
   */
  getUV7(): Vector2[] {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._uv7;
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
      vertexElements.push(new VertexElement("JOINTS_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
      elementCount += 4;
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

  private _resetVertexArrayData(vertices: Float32Array): void {
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
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const joint = _joints[i];
          if (joint) {
            vertices[start] = joint.x;
            vertices[start + 1] = joint.y;
            vertices[start + 2] = joint.z;
            vertices[start + 3] = joint.w;
          }
        }
      }
      offset += 4;
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
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv1) {
      if (_vertexChangeFlag & ValueChanged.UV1) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv1[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv2) {
      if (_vertexChangeFlag & ValueChanged.UV2) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv2[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv3) {
      if (_vertexChangeFlag & ValueChanged.UV3) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv3[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv4) {
      if (_vertexChangeFlag & ValueChanged.UV4) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv4[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv5) {
      if (_vertexChangeFlag & ValueChanged.UV5) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv5[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv6) {
      if (_vertexChangeFlag & ValueChanged.UV6) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv6[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    if (_uv7) {
      if (_vertexChangeFlag & ValueChanged.UV7) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _elementCount * i + offset;
          const uv = _uv7[i];
          vertices[start] = uv.x;
          vertices[start + 1] = uv.y;
        }
      }
      offset += 2;
    }
    this._vertexChangeFlag = 0;
  }

  private _releaseCache() {
    if (this._indexBuffer) {
      this._indexBuffer.destroy();
      this._indexBuffer = null;
    }
    if (this._vertexBuffer) {
      this._vertexBuffer.destroy();
      this._vertexBuffer = null;
    }
    this._indicesArray = null;
    this._verticesArray = null;
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
