import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Engine } from "..";
import {
  BufferBindFlag,
  BufferUsage,
  IndexBufferBinding,
  IndexFormat,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "../graphic";
import { Mesh } from "../graphic/Mesh";
import { Buffer } from "../graphic/Buffer";

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
  private _vertexSlots: ModelMeshVertexSlots = new ModelMeshVertexSlots();
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
  private _valueChanged = {
    position: false,
    normal: false,
    color: false,
    weight: false,
    joint: false,
    tangent: false,
    uv: false,
    uv1: false,
    uv2: false,
    uv3: false,
    uv4: false,
    uv5: false,
    uv6: false,
    uv7: false
  };

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
   * @param noLongerAccessible - Whether to access data later. If true, you'll never access data anymore (free memory cache).
   */
  uploadMeshData(noLongerAccessible: boolean): void {
    const { _indicesArray, _vertexSlots, _accessible } = this;
    if (!_accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    // Structure of vertex buffer has changed
    if (_vertexSlots.slotChanged || this._vertexCountChanged) {
      const elementCount = this._getElementCount();
      const _verticesArray = new Float32Array(elementCount * this.vertexCount);
      this._verticesArray = _verticesArray;
      this._resetVertexArrayData(_verticesArray, true);
      this._vertexBuffer = new Buffer(
        this._engine,
        BufferBindFlag.VertexBuffer,
        _verticesArray,
        noLongerAccessible ? BufferUsage.Static : BufferUsage.Dynamic
      );
      this.setVertexElements(this._getVertexElements());
      this.setVertexBufferBinding(new VertexBufferBinding(this._vertexBuffer, elementCount * 4));
      _vertexSlots.resetSlotChanged();
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

    this._vertexSlots.position = true;
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
    this._vertexSlots.normal = normals != null;
    this._valueChanged.normal = true;
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

    this._vertexSlots.color = colors != null;
    this._valueChanged.color = true;
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

    this._vertexSlots.weight = weights != null;
    this._valueChanged.weight = true;
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

    this._vertexSlots.joint = joints != null;
    this._valueChanged.joint = true;
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

    this._vertexSlots.tangent = tangents != null;
    this._valueChanged.tangent = true;
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

    this._vertexSlots.uv = uv != null;
    this._valueChanged.uv = true;
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

    this._vertexSlots.uv1 = uv != null;
    this._valueChanged.uv1 = true;
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

    this._vertexSlots.uv2 = uv != null;
    this._valueChanged.uv2 = true;
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

    this._vertexSlots.uv3 = uv != null;
    this._valueChanged.uv3 = true;
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

    this._vertexSlots.uv4 = uv != null;
    this._valueChanged.uv4 = true;
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

    this._vertexSlots.uv5 = uv != null;
    this._valueChanged.uv5 = true;
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

    this._vertexSlots.uv6 = uv != null;
    this._valueChanged.uv6 = true;
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

    this._vertexSlots.uv7 = uv != null;
    this._valueChanged.uv7 = true;
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

  private _getElementCount(): number {
    // A ModelMesh must have position;
    let count = 3;
    const { _colors, _normals, _uv, _tangents, _weights, _joints, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;
    if (_normals) {
      count += 3;
    }

    if (_colors) {
      count += 4;
    }
    if (_weights) {
      count += 4;
    }
    if (_joints) {
      count += 4;
    }
    if (_tangents) {
      count += 4;
    }
    if (_uv) {
      count += 2;
    }
    if (_uv1) {
      count += 2;
    }
    if (_uv2) {
      count += 2;
    }
    if (_uv3) {
      count += 2;
    }
    if (_uv4) {
      count += 2;
    }
    if (_uv5) {
      count += 2;
    }
    if (_uv6) {
      count += 2;
    }
    if (_uv7) {
      count += 2;
    }
    return count;
  }

  private _getVertexElements(): VertexElement[] {
    const vertexElements = [POSITION_VERTEX_ELEMENT];
    const { _colors, _normals, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7, _weights, _joints } = this;
    let offset = 12;
    if (_normals) {
      vertexElements.push(new VertexElement("NORMAL", offset, VertexElementFormat.Vector3, 0));
      offset += 12;
    }
    if (_colors) {
      vertexElements.push(new VertexElement("COLOR_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
    }
    if (_weights) {
      vertexElements.push(new VertexElement("WEIGHTS_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
    }
    if (_joints) {
      vertexElements.push(new VertexElement("JOINTS_0", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
    }
    if (_tangents) {
      vertexElements.push(new VertexElement("TANGENT", offset, VertexElementFormat.Vector4, 0));
      offset += 16;
    }
    if (_uv) {
      vertexElements.push(new VertexElement("TEXCOORD_0", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv1) {
      vertexElements.push(new VertexElement("TEXCOORD_1", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv2) {
      vertexElements.push(new VertexElement("TEXCOORD_2", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv3) {
      vertexElements.push(new VertexElement("TEXCOORD_3", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv4) {
      vertexElements.push(new VertexElement("TEXCOORD_4", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv5) {
      vertexElements.push(new VertexElement("TEXCOORD_5", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv6) {
      vertexElements.push(new VertexElement("TEXCOORD_6", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }
    if (_uv7) {
      vertexElements.push(new VertexElement("TEXCOORD_7", offset, VertexElementFormat.Vector2, 0));
      offset += 8;
    }

    return vertexElements;
  }

  private _resetVertexArrayData(_verticesArray: Float32Array, allReset: boolean = false) {
    // prettier-ignore
    const { _vertexCount, _positions, _normals, _colors, _valueChanged: valueChanged, _weights, _joints, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;
    const elementCount = this._getElementCount();

    if (allReset || valueChanged.position) {
      for (let i = 0; i < _vertexCount; i++) {
        const start = elementCount * i;
        const position = _positions[i];
        _verticesArray[start] = position.x;
        _verticesArray[start + 1] = position.y;
        _verticesArray[start + 2] = position.z;
      }
      valueChanged.position = false;
    }

    let offset = 3;

    if (_normals) {
      if (allReset || valueChanged.normal) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const normal = _normals[i];
          if (normal) {
            _verticesArray[start] = normal.x;
            _verticesArray[start + 1] = normal.y;
            _verticesArray[start + 2] = normal.z;
          }
        }
        valueChanged.normal = false;
      }
      offset += 3;
    }

    if (_colors) {
      if (allReset || valueChanged.color) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const color = _colors[i];
          if (color) {
            _verticesArray[start] = color.r;
            _verticesArray[start + 1] = color.g;
            _verticesArray[start + 2] = color.b;
            _verticesArray[start + 3] = color.a;
          }
        }
        valueChanged.color = false;
      }
      offset += 4;
    }

    if (_weights) {
      if (allReset || valueChanged.weight) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const weight = _weights[i];
          if (weight) {
            _verticesArray[start] = weight.x;
            _verticesArray[start + 1] = weight.y;
            _verticesArray[start + 2] = weight.z;
            _verticesArray[start + 3] = weight.w;
          }
        }
        valueChanged.weight = false;
      }
      offset += 4;
    }

    if (_joints) {
      if (allReset || valueChanged.joint) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const joint = _joints[i];
          if (joint) {
            _verticesArray[start] = joint.x;
            _verticesArray[start + 1] = joint.y;
            _verticesArray[start + 2] = joint.z;
            _verticesArray[start + 3] = joint.w;
          }
        }
        valueChanged.joint = false;
      }
      offset += 4;
    }

    if (_tangents) {
      if (allReset || valueChanged.color) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const tangent = _tangents[i];
          if (tangent) {
            _verticesArray[start] = tangent.x;
            _verticesArray[start + 1] = tangent.y;
            _verticesArray[start + 2] = tangent.z;
          }
        }
        valueChanged.tangent = false;
      }
      offset += 3;
    }
    if (_uv) {
      if (allReset || valueChanged.uv) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv = false;
      }
      offset += 2;
    }
    if (_uv1) {
      if (allReset || valueChanged.uv1) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv1[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv1 = false;
      }
      offset += 2;
    }
    if (_uv2) {
      if (allReset || valueChanged.uv2) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv2[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv2 = false;
      }
      offset += 2;
    }
    if (_uv3) {
      if (allReset || valueChanged.uv3) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv3[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv3 = false;
      }
      offset += 2;
    }
    if (_uv4) {
      if (allReset || valueChanged.uv4) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv4[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv4 = false;
      }
      offset += 2;
    }
    if (_uv5) {
      if (allReset || valueChanged.uv5) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv5[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv5 = false;
      }
      offset += 2;
    }
    if (_uv6) {
      if (allReset || valueChanged.uv6) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv6[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv6 = false;
      }
      offset += 2;
    }
    if (_uv7) {
      if (allReset || valueChanged.uv7) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = elementCount * i + offset;
          const uv = _uv7[i];
          _verticesArray[start] = uv.x;
          _verticesArray[start + 1] = uv.y;
        }
        valueChanged.uv7 = false;
      }
      offset += 2;
    }
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

class ModelMeshVertexSlots {
  private _position: boolean = false;
  private _normal: boolean = false;
  private _slotChanged = false;
  private _color = false;
  private _weight = false;
  private _joint = false;
  private _tangent = false;
  private _uv = false;
  private _uv1 = false;
  private _uv2 = false;
  private _uv3 = false;
  private _uv4 = false;
  private _uv5 = false;
  private _uv6 = false;
  private _uv7 = false;

  get slotChanged(): boolean {
    return this._slotChanged;
  }

  set position(value: boolean) {
    if (value !== this._position) {
      this._position = value;
      this._slotChanged = true;
    }
  }

  set normal(value: boolean) {
    if (value !== this._normal) {
      this._normal = value;
      this._slotChanged = true;
    }
  }

  set color(value: boolean) {
    if (value !== this._color) {
      this._color = value;
      this._slotChanged = true;
    }
  }

  set weight(value: boolean) {
    if (value !== this._weight) {
      this._weight = value;
      this._slotChanged = true;
    }
  }

  set tangent(value: boolean) {
    if (value !== this._tangent) {
      this._tangent = value;
      this._slotChanged = true;
    }
  }

  set joint(value: boolean) {
    if (value !== this._joint) {
      this._joint = value;
      this._slotChanged = true;
    }
  }

  set uv(value: boolean) {
    if (value !== this._uv) {
      this._uv = value;
      this._slotChanged = true;
    }
  }

  set uv1(value: boolean) {
    if (value !== this._uv1) {
      this._uv1 = value;
      this._slotChanged = true;
    }
  }

  set uv2(value: boolean) {
    if (value !== this._uv2) {
      this._uv2 = value;
      this._slotChanged = true;
    }
  }

  set uv3(value: boolean) {
    if (value !== this._uv3) {
      this._uv3 = value;
      this._slotChanged = true;
    }
  }

  set uv4(value: boolean) {
    if (value !== this._uv4) {
      this._uv4 = value;
      this._slotChanged = true;
    }
  }

  set uv5(value: boolean) {
    if (value !== this._uv5) {
      this._uv = value;
      this._slotChanged = true;
    }
  }

  set uv6(value: boolean) {
    if (value !== this._uv6) {
      this._uv = value;
      this._slotChanged = true;
    }
  }

  set uv7(value: boolean) {
    if (value !== this._uv7) {
      this._uv = value;
      this._slotChanged = true;
    }
  }

  resetSlotChanged(): void {
    this._slotChanged = false;
  }
}
