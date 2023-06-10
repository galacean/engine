import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { DataType, TypedArray } from "../base";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Mesh } from "../graphic/Mesh";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { BlendShape } from "./BlendShape";
import { BlendShapeManager } from "./BlendShapeManager";
import { VertexAttribute } from "./enums/VertexAttribute";

/**
 * Mesh containing common vertex elements of the model.
 */
export class ModelMesh extends Mesh {
  private static _tempVec0 = new Vector3();
  private static _tempVec1 = new Vector3();
  private static _tempVec2 = new Vector3();
  private static _tempVec3 = new Vector3();
  private static _tempVec4 = new Vector3();

  /** @internal */
  _blendShapeManager: BlendShapeManager;
  /** @internal */
  _internalVertexBufferIndex: number = -1;

  private _vertexCount: number = 0;
  private _vertexCountDirty: boolean = false;
  private _accessible: boolean = true;
  private _dataVersionCounter: number = 0;

  private _positions: Vector3[] | null = null;
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
  private _advancedDataUpdateFlag: VertexElementFlags = VertexElementFlags.None;
  private _advancedVertexDataVersions: number[] = new Array<number>(13); // Only have 13 vertex element can set advanced data
  private _advancedDataSyncToBuffer: boolean = false;

  private _internalVertexBuffer: Buffer;
  private _internalVertexBufferStride: number = 0;
  private _internalVertexBufferCreatedInfo: Vector2 = new Vector2(); // x:vertexCount, y:vertexStride
  private _internalVertexElementsOffset: number = 0;
  private _internalVertexElementsFlags: VertexElementFlags = VertexElementFlags.None;
  private _internalVertexElementsUpdate: boolean = false;

  private _vertexBufferDataVersions: number[] = [];

  private _indices: Uint8Array | Uint16Array | Uint32Array | null = null;
  private _indicesFormat: IndexFormat = null;
  private _indicesChangeFlag: boolean = false;

  /**
   * Whether to access data of the mesh.
   */
  get accessible(): boolean {
    return this._accessible;
  }

  /**
   * Vertex count of mesh.
   */
  get vertexCount(): number {
    if (this._vertexCountDirty) {
      let vertexCount = 0;
      const positionElement = this._vertexElementMap[VertexAttribute.Position];
      if (positionElement) {
        const positionBufferBinding = this._vertexBufferBindings[positionElement.bindingIndex];
        if (positionBufferBinding) {
          vertexCount = positionBufferBinding.buffer.byteLength / positionBufferBinding.stride;
        }
      }
      this._vertexCount = vertexCount;
      this._vertexCountDirty = false;
    }
    return this._vertexCount;
  }

  /**
   * Vertex element collection.
   */
  get vertexElements(): Readonly<VertexElement[]> {
    this._updateVertexElements();
    return this._vertexElements;
  }

  /**
   * Vertex buffer binding collection.
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._vertexBufferBindings;
  }

  /**
   * BlendShapes of this ModelMesh.
   */
  get blendShapes(): Readonly<BlendShape[]> {
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
  setPositions(positions: Vector3[] | null): void {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (!this._positions && !positions) {
      return;
    }

    this._updateAdvancedVertexDataMarks(
      this._positions,
      positions,
      VertexElementFlags.Position,
      VertexElementIndex.Position
    );
    this._positions = positions;

    this._vertexCount = positions?.length ?? 0;
    this._vertexCountDirty = false;
  }

  /**
   * Get a copy of positions for the mesh.
   * @remarks Please call the setPositions() method after modification to ensure that the modification takes effect.
   */
  getPositions(): Vector3[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._getVertexElementData(
      this._positions,
      VertexAttribute.Position,
      VertexElementIndex.Position,
      this._readVector3VertexData
    );
  }

  /**
   * Set per-vertex normals for the mesh.
   * @param normals - The normals for the mesh.
   */
  setNormals(normals: Vector3[] | null): void {
    if (
      this._beforeSetAdvancedVertexData(this._normals, normals, VertexElementFlags.Normal, VertexElementIndex.Normal)
    ) {
      this._normals = normals;
    }
  }

  /**
   * Get a copy of normals for the mesh.
   * @remarks Please call the setNormals() method after modification to ensure that the modification takes effect.
   */
  getNormals(): Vector3[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._getVertexElementData(
      this._normals,
      VertexAttribute.Normal,
      VertexElementIndex.Normal,
      this._readVector3VertexData
    );
  }

  private _getVertexElementData<T extends VertexType>(
    vertices: T[],
    vertexAttribute: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    readVertexData: (vertexAttribute: VertexAttribute) => T[]
  ): T[] | null {
    const advancedDataVersion = this._advancedVertexDataVersions[vertexElementIndex] ?? -1;
    const vertexElement = this._vertexElementMap[vertexAttribute];
    const bufferDataVersion = vertexElement ? this._vertexBufferDataVersions[vertexElement.bindingIndex] ?? -1 : -1;
    if (advancedDataVersion > bufferDataVersion) {
      return vertices;
    } else if (advancedDataVersion < bufferDataVersion) {
      return readVertexData.call(this, vertexAttribute);
    } else {
      return null;
    }
  }

  /**
   * Set per-vertex colors for the mesh.
   * @param colors - The colors for the mesh.
   */
  setColors(colors: Color[] | null): void {
    if (this._beforeSetAdvancedVertexData(this._colors, colors, VertexElementFlags.Color, VertexElementIndex.Color)) {
      this._colors = colors;
    }
  }

  /**
   * Get a copy of colors for the mesh.
   * @remarks Please call the setColors() method after modification to ensure that the modification takes effect.
   */
  getColors(): Color[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._getVertexElementData(
      this._colors,
      VertexAttribute.Color,
      VertexElementIndex.Color,
      this._readColorVertexData
    );
  }

  /**
   * Set per-vertex bone weights for the mesh.
   * @param boneWeights - The bone weights for the mesh.
   */
  setBoneWeights(boneWeights: Vector4[] | null): void {
    if (
      this._beforeSetAdvancedVertexData(
        this._boneWeights,
        boneWeights,
        VertexElementFlags.BoneWeight,
        VertexElementIndex.BoneWeight
      )
    ) {
      this._boneWeights = boneWeights;
    }
  }

  /**
   * Get a copy of bone weights for the mesh.
   * @remarks Please call the setWeights() method after modification to ensure that the modification takes effect.
   */
  getBoneWeights(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._getVertexElementData(
      this._boneWeights,
      VertexAttribute.BoneWeight,
      VertexElementIndex.BoneWeight,
      this._readVector4VertexData
    );
  }

  /**
   * Set per-vertex bone indices for the mesh.
   * @param boneIndices - The bone indices for the mesh.
   */
  setBoneIndices(boneIndices: Vector4[] | null): void {
    if (
      this._beforeSetAdvancedVertexData(
        this._boneWeights,
        boneIndices,
        VertexElementFlags.BoneIndex,
        VertexElementIndex.BoneIndex
      )
    ) {
      this._boneIndices = boneIndices;
    }
  }

  /**
   * Get a copy of bone indices for the mesh.
   * @remarks Please call the setBoneIndices() method after modification to ensure that the modification takes effect.
   */
  getBoneIndices(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._getVertexElementData(
      this._boneIndices,
      VertexAttribute.BoneIndex,
      VertexElementIndex.BoneIndex,
      this._readVector4VertexData
    );
  }

  /**
   * Set per-vertex tangents for the mesh.
   * @param tangents - The tangents for the mesh.
   */
  setTangents(tangents: Vector4[] | null): void {
    if (
      this._beforeSetAdvancedVertexData(
        this._tangents,
        tangents,
        VertexElementFlags.Tangent,
        VertexElementIndex.Tangent
      )
    ) {
      this._tangents = tangents;
    }
  }

  /**
   * Get a copy of tangents for the mesh.
   * @remarks Please call the setTangents() method after modification to ensure that the modification takes effect.
   */
  getTangents(): Vector4[] | null {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._getVertexElementData(
      this._tangents,
      VertexAttribute.Tangent,
      VertexElementIndex.Tangent,
      this._readVector4VertexData
    );
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
    channelIndex = channelIndex ?? 0;
    switch (channelIndex) {
      case 0:
        if (this._beforeSetAdvancedVertexData(this._uv, uv, VertexElementFlags.UV, VertexElementIndex.UV)) {
          this._uv = uv;
        }
        break;
      case 1:
        if (this._beforeSetAdvancedVertexData(this._uv1, uv, VertexElementFlags.UV1, VertexElementIndex.UV1)) {
          this._uv1 = uv;
        }
        break;
      case 2:
        if (this._beforeSetAdvancedVertexData(this._uv2, uv, VertexElementFlags.UV2, VertexElementIndex.UV2)) {
          this._uv2 = uv;
        }
        break;
      case 3:
        if (this._beforeSetAdvancedVertexData(this._uv3, uv, VertexElementFlags.UV3, VertexElementIndex.UV3)) {
          this._uv3 = uv;
        }
        break;
      case 4:
        if (this._beforeSetAdvancedVertexData(this._uv4, uv, VertexElementFlags.UV4, VertexElementIndex.UV4)) {
          this._uv4 = uv;
        }
        break;
      case 5:
        if (this._beforeSetAdvancedVertexData(this._uv5, uv, VertexElementFlags.UV5, VertexElementIndex.UV5)) {
          this._uv5 = uv;
        }
        break;
      case 6:
        if (this._beforeSetAdvancedVertexData(this._uv6, uv, VertexElementFlags.UV6, VertexElementIndex.UV6)) {
          this._uv6 = uv;
        }
        break;
      case 7:
        if (this._beforeSetAdvancedVertexData(this._uv7, uv, VertexElementFlags.UV7, VertexElementIndex.UV7)) {
          this._uv7 = uv;
        }
        break;
      default:
        throw "The index of channel needs to be in range [0 - 7].";
    }
  }

  /**
   * Get a copy of uv for the mesh.
   * @remarks Please call the setUV() method after modification to ensure that the modification takes effect.
   */
  getUVs(): Vector2[] | null;
  /**
   * Get a copy of uv for the mesh by channelIndex.
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
        return this._getVertexElementData(
          this._uv,
          VertexAttribute.UV,
          VertexElementIndex.UV,
          this._readVector2VertexData
        );
      case 1:
        return this._getVertexElementData(
          this._uv1,
          VertexAttribute.UV1,
          VertexElementIndex.UV1,
          this._readVector2VertexData
        );
      case 2:
        return this._getVertexElementData(
          this._uv2,
          VertexAttribute.UV2,
          VertexElementIndex.UV2,
          this._readVector2VertexData
        );
      case 3:
        return this._getVertexElementData(
          this._uv3,
          VertexAttribute.UV3,
          VertexElementIndex.UV3,
          this._readVector2VertexData
        );
      case 4:
        return this._getVertexElementData(
          this._uv4,
          VertexAttribute.UV4,
          VertexElementIndex.UV4,
          this._readVector2VertexData
        );
      case 5:
        return this._getVertexElementData(
          this._uv5,
          VertexAttribute.UV5,
          VertexElementIndex.UV5,
          this._readVector2VertexData
        );
      case 6:
        return this._getVertexElementData(
          this._uv6,
          VertexAttribute.UV6,
          VertexElementIndex.UV6,
          this._readVector2VertexData
        );
      case 7:
        return this._getVertexElementData(
          this._uv7,
          VertexAttribute.UV7,
          VertexElementIndex.UV7,
          this._readVector2VertexData
        );
    }
    throw "The index of channel needs to be in range [0 - 7].";
  }

  /**
   * Set indices for the mesh.
   * @param indices - The indices for the mesh.
   */
  setIndices(indices: Uint8Array | Uint16Array | Uint32Array): void {
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
   * Set vertex elements.
   * @param elements - Vertex element collection
   *
   * @remarks
   * Call this method will clear the vertex data set by the setPositions(), setNormals(), setColors(), setBoneWeights(), setBoneIndices(), setTangents(), setUVs() methods.
   */
  setVertexElements(elements: VertexElement[]): void {
    this._clearVertexElements();

    const count = elements.length;
    for (let i = 0; i < count; i++) {
      this._addVertexElement(elements[i]);
    }

    this.setPositions(null);
    this.setNormals(null);
    this.setColors(null);
    this.setBoneWeights(null);
    this.setBoneIndices(null);
    this.setTangents(null);
    for (let i = 0; i < 8; i++) {
      this.setUVs(null, i);
    }

    this._internalVertexElementsOffset = count;
    this._internalVertexBufferIndex = -1;
    this._internalVertexElementsUpdate = false;
    this._vertexCountDirty = true;
    this._blendShapeManager._bufferBindingOffset = -1;
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBufferBindings: VertexBufferBinding, index?: number): void;

  /**
   * Set vertex buffer binding.
   * @param vertexBuffer - Vertex buffer
   * @param stride - Vertex buffer data stride
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, index?: number): void;

  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    strideOrFirstIndex: number = 0,
    indexOrNull: number = 0
  ): void {
    let binding = <VertexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new VertexBufferBinding(<Buffer>bufferOrBinding, strideOrFirstIndex));
    const index = isBinding ? strideOrFirstIndex : indexOrNull;

    const bindings = this._vertexBufferBindings;
    const dataVersions = this._vertexBufferDataVersions;

    const needLength = index + 1;
    if (bindings.length < needLength) {
      bindings.length = needLength;
      dataVersions.length = needLength;
    }

    this._setVertexBufferBinding(index, binding);
    this._vertexCountDirty = true;
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const count = vertexBufferBindings.length;
    const bindings = this._vertexBufferBindings;

    const needLength = firstIndex + count;
    if (bindings.length < needLength) {
      bindings.length = needLength;
      this._vertexBufferDataVersions.length = needLength;
    }

    for (let i = 0; i < count; i++) {
      this._setVertexBufferBinding(firstIndex + i, vertexBufferBindings[i]);
    }
    this._vertexCountDirty = true;
  }

  /**
   * Add a BlendShape for this ModelMesh.
   * @param blendShape - The BlendShape
   */
  addBlendShape(blendShape: BlendShape): void {
    this._blendShapeManager._addBlendShape(blendShape);
  }

  /**
   * Clear all BlendShapes.
   */
  clearBlendShapes(): void {
    this._blendShapeManager._clearBlendShapes();
  }

  /**
   * Get name of BlendShape by given index.
   * @param index - The index of BlendShape
   * @returns The name of BlendShape
   */
  getBlendShapeName(index: number): string {
    const blendShapes = this._blendShapeManager._blendShapes;
    return blendShapes[index].name;
  }

  /**
   * Upload Mesh Data to GPU.
   * @param noLongerAccessible - Whether to access data later. If true, you'll never read data anymore (free memory cache)
   */
  uploadData(noLongerAccessible: boolean): void {
    this._updateVertexElements();
    this._updateInternalVertexBuffer(!noLongerAccessible);

    // Update advanced vertex data to buffer
    if (this._advancedDataUpdateFlag & VertexElementFlags.All) {
      this._updateAdvancedVertices();

      this._advancedDataSyncToBuffer = true;
      // @todo: add buffer dirty flag
      const vertexBufferBindings = this._vertexBufferBindings;
      for (let i = 0, n = vertexBufferBindings.length; i < n; i++) {
        const buffer = vertexBufferBindings[i]?._buffer;
        buffer.readable && buffer.setData(buffer.data);
      }
      this._advancedDataSyncToBuffer = false;
    }

    if (this._indicesChangeFlag) {
      const { _indices: indices } = this;
      const indexBuffer = this._indexBufferBinding?._buffer;
      if (indices) {
        if (!indexBuffer || indices.byteLength != indexBuffer.byteLength) {
          indexBuffer?.destroy();
          const newIndexBuffer = new Buffer(this._engine, BufferBindFlag.IndexBuffer, indices);
          this._setIndexBufferBinding(new IndexBufferBinding(newIndexBuffer, this._indicesFormat));
        } else {
          indexBuffer.setData(indices);
          if (this._indexBufferBinding._format !== this._indicesFormat) {
            this._setIndexBufferBinding(new IndexBufferBinding(indexBuffer, this._indicesFormat));
          }
        }
      } else if (indexBuffer) {
        indexBuffer.destroy();
        this._setIndexBufferBinding(null);
      }

      this._indicesChangeFlag = false;
    }

    const blendShapeManager = this._blendShapeManager;
    blendShapeManager._blendShapeCount > 0 && blendShapeManager._update(noLongerAccessible);

    if (noLongerAccessible) {
      this._accessible = false;
      this._releaseCache();
    }
  }

  /**
   * Calculate mesh tangent.
   * @remark need to set positions(with or not with indices), normals, uv before calculation.
   * @remark based on http://foundationsofgameenginedev.com/FGED2-sample.pdf
   */
  calculateTangents(): void {
    const positions = this.getPositions();
    const normals = this.getNormals();
    const uvs = this.getUVs();

    if (!normals || !uvs) {
      throw "Set normal and uv before calculation.";
    }

    const { _indices: indices, vertexCount } = this;
    const { _tempVec0: e1, _tempVec1: e2, _tempVec2: t, _tempVec3: b, _tempVec4: temp } = ModelMesh;
    const triangleCount = indices ? indices.length / 3 : positions.length / 3;
    const tangents = new Array<Vector4>(vertexCount);
    const biTangents = new Array<Vector3>(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      tangents[i] = new Vector4();
      biTangents[i] = new Vector3();
    }

    // Calculate tangent and bi-tangent for each triangle and add to all three vertices.
    for (let k = 0; k < triangleCount; k++) {
      let i0 = 3 * k;
      let i1 = 3 * k + 1;
      let i2 = 3 * k + 2;
      if (indices) {
        i0 = indices[i0];
        i1 = indices[i1];
        i2 = indices[i2];
      }

      const p0 = positions[i0];
      const p1 = positions[i1];
      const p2 = positions[i2];
      const w0 = uvs[i0];
      const w1 = uvs[i1];
      const w2 = uvs[i2];

      Vector3.subtract(p1, p0, e1);
      Vector3.subtract(p2, p0, e2);
      const x1 = w1.x - w0.x;
      const x2 = w2.x - w0.x;
      const y1 = w1.y - w0.y;
      const y2 = w2.y - w0.y;
      const r = 1.0 / (x1 * y2 - x2 * y1);

      Vector3.scale(e1, y2 * r, t);
      Vector3.scale(e2, y1 * r, temp);
      Vector3.subtract(t, temp, t);
      Vector3.scale(e2, x1 * r, b);
      Vector3.scale(e1, x2 * r, temp);
      Vector3.subtract(b, temp, b);

      let tangent = tangents[i0];
      tangent.set(tangent.x + t.x, tangent.y + t.y, tangent.z + t.z, 1.0);

      tangent = tangents[i1];
      tangent.set(tangent.x + t.x, tangent.y + t.y, tangent.z + t.z, 1.0);

      tangent = tangents[i2];
      tangent.set(tangent.x + t.x, tangent.y + t.y, tangent.z + t.z, 1.0);

      biTangents[i0].add(b);
      biTangents[i1].add(b);
      biTangents[i2].add(b);
    }

    // Orthonormalize each tangent and calculate the handedness.
    for (let i = 0; i < vertexCount; i++) {
      const n = normals[i];
      const b = biTangents[i];
      const tangent = tangents[i];
      t.set(tangent.x, tangent.y, tangent.z);

      Vector3.cross(t, b, temp);
      const w = Vector3.dot(temp, n) > 0.0 ? 1 : -1;
      Vector3.scale(n, Vector3.dot(t, n), temp);
      Vector3.subtract(t, temp, t);
      t.normalize();
      tangent.set(t.x, t.y, t.z, w);
    }
    this.setTangents(tangents);
  }

  /**
   * @internal
   */
  override _setVertexBufferBinding(index: number, binding: VertexBufferBinding): void {
    const onVertexBufferChanged = () => {
      if (!this._advancedDataSyncToBuffer) {
        this._vertexBufferDataVersions[index] = this._dataVersionCounter++;
      }
    };

    // Remove listener from previous binding
    const previousBinding = this._vertexBufferBindings[index];
    previousBinding && previousBinding.buffer._dataUpdateManager.removeListener(onVertexBufferChanged);

    super._setVertexBufferBinding(index, binding);

    // Add listener to new binding and trigger update
    if (binding) {
      binding.buffer._dataUpdateManager.addListener(onVertexBufferChanged);
      onVertexBufferChanged();
    }
  }

  /**
   * @internal
   */
  _getVertexTypedArray(vertexDataBuffer: ArrayBuffer, dataType: DataType): TypedArray {
    switch (dataType) {
      case DataType.BYTE:
        return new Int8Array(vertexDataBuffer);
      case DataType.UNSIGNED_BYTE:
        return new Uint8Array(vertexDataBuffer);
      case DataType.SHORT:
        return new Int16Array(vertexDataBuffer);
      case DataType.UNSIGNED_SHORT:
        return new Uint16Array(vertexDataBuffer);
      case DataType.FLOAT:
        return new Float32Array(vertexDataBuffer);
    }
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._accessible && this._releaseCache();
  }

  private _beforeSetAdvancedVertexData<T extends VertexType>(
    oldVertices: T[],
    vertices: T[],
    elementChangeFlag: VertexElementFlags,
    elementIndex: VertexElementIndex
  ): boolean {
    if (!this._accessible) {
      throw "Not allowed to access data while accessible is false.";
    }

    if (vertices) {
      if (vertices.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!oldVertices) {
      return false;
    }

    this._updateAdvancedVertexDataMarks(oldVertices, vertices, elementChangeFlag, elementIndex);
    return true;
  }

  private _updateAdvancedVertexDataMarks<T extends VertexType>(
    oldVertices: T[],
    vertices: T[],
    elementChangeFlag: VertexElementFlags,
    elementIndex: VertexElementIndex
  ): void {
    this._internalVertexElementsUpdate ||= !!oldVertices !== !!vertices;
    this._advancedDataUpdateFlag |= elementChangeFlag;
    this._advancedVertexDataVersions[elementIndex] = this._dataVersionCounter++;
  }

  private _updateInternalVertexBuffer(accessible: boolean): void {
    const bufferStride = this._internalVertexBufferStride;
    const vertexCount = this.vertexCount;
    const bufferCreatedInfo = this._internalVertexBufferCreatedInfo;

    // If need recreate internal vertex buffer
    if (bufferCreatedInfo.x !== bufferStride || bufferCreatedInfo.y !== vertexCount) {
      const vertexBufferIndex = this._internalVertexBufferIndex;

      // Destroy old internal vertex buffer
      this._vertexBufferBindings[vertexBufferIndex]?._buffer?.destroy();

      const byteLength = bufferStride * this.vertexCount;
      if (byteLength > 0) {
        // No matter the internal buffer is stride change or vertex count change, we need set to internal buffer again
        this._advancedDataUpdateFlag |= this._internalVertexElementsFlags;
        const bufferUsage = accessible ? BufferUsage.Static : BufferUsage.Dynamic;
        const vertexBuffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, byteLength, bufferUsage, true);
        this._advancedDataSyncToBuffer = true;
        this._setVertexBufferBinding(vertexBufferIndex, new VertexBufferBinding(vertexBuffer, bufferStride));
        this._advancedDataSyncToBuffer = false;
        this._internalVertexBuffer = vertexBuffer;
      } else {
        this._setVertexBufferBinding(vertexBufferIndex, null);
        this._internalVertexBuffer = null;
      }
      bufferCreatedInfo.set(bufferStride, vertexCount);
    }
  }

  private _readVector2VertexData(attributeType: string): Vector2[] {
    return this._readVertexData<Vector2>(attributeType, (dataReader: TypedArray, offset: number) => {
      return new Vector2(dataReader[offset], dataReader[offset + 1]);
    });
  }

  private _readVector3VertexData(attributeType: string): Vector3[] {
    return this._readVertexData<Vector3>(attributeType, (dataReader: TypedArray, offset: number) => {
      return new Vector3(dataReader[offset], dataReader[offset + 1], dataReader[offset + 2]);
    });
  }

  private _readVector4VertexData(attributeType: string): Vector4[] {
    return this._readVertexData<Vector4>(attributeType, (dataReader: TypedArray, offset: number) => {
      return new Vector4(dataReader[offset], dataReader[offset + 1], dataReader[offset + 2], dataReader[offset + 3]);
    });
  }

  private _readColorVertexData(attributeType: string): Color[] {
    return this._readVertexData<Color>(attributeType, (dataReader: TypedArray, offset: number) => {
      return new Color(dataReader[offset], dataReader[offset + 1], dataReader[offset + 2], dataReader[offset + 3]);
    });
  }

  private _readVertexData<T extends VertexType>(
    attributeType: string,
    onVertexParse: (dataReader: TypedArray, offset: number) => T
  ): T[] {
    const vertexElement = this._vertexElementMap[attributeType];
    if (!vertexElement) {
      return null;
    }

    const bufferBinding = this._vertexBufferBindings[vertexElement.bindingIndex];
    const buffer = bufferBinding?.buffer;
    if (!buffer) {
      return null;
    }
    if (!buffer.readable) {
      throw "Not allowed to access data while vertex buffer readable is false.";
    }

    const vertexCount = this.vertexCount;
    const formatMetaInfo = vertexElement._formatMetaInfo;
    const vertices = new Array<T>(vertexCount);
    const dataReader = this._getVertexTypedArray(buffer.data.buffer, formatMetaInfo.type);
    const byteOffset = vertexElement.offset;
    const byteStride = bufferBinding.stride;

    for (let i = 0; i < vertexCount; i++) {
      const offset = (i * byteStride + byteOffset) / dataReader.BYTES_PER_ELEMENT;
      const vertex = onVertexParse(dataReader, offset);
      formatMetaInfo.normalized && vertex.scale(formatMetaInfo.normalizedScaleFactor);
      vertices[i] = vertex;
    }

    return vertices;
  }

  private _updateInternalVertexElements(): void {
    this._updateInternalVertexBufferIndex();
    this._internalVertexElementsFlags = VertexElementFlags.None;

    let offset = this._internalVertexElementsOffset;
    const vertexElementMap = this._vertexElementMap;

    if (this._positions && !vertexElementMap[VertexAttribute.Position]) {
      this._addInternalVertexAttribute(VertexAttribute.Position, offset++, VertexElementFlags.Position);
    }

    if (this._normals && !vertexElementMap[VertexAttribute.Normal]) {
      this._addInternalVertexAttribute(VertexAttribute.Normal, offset++, VertexElementFlags.Normal);
    }

    if (this._colors && !vertexElementMap[VertexAttribute.Color]) {
      this._addInternalVertexAttribute(VertexAttribute.Color, offset++, VertexElementFlags.Color);
    }

    if (this._boneWeights && !vertexElementMap[VertexAttribute.BoneWeight]) {
      this._addInternalVertexAttribute(VertexAttribute.BoneWeight, offset++, VertexElementFlags.BoneWeight);
    }

    if (this._boneIndices && !vertexElementMap[VertexAttribute.BoneIndex]) {
      this._addInternalVertexAttribute(VertexAttribute.BoneIndex, offset++, VertexElementFlags.BoneIndex);
    }

    if (this._tangents && !vertexElementMap[VertexAttribute.Tangent]) {
      this._addInternalVertexAttribute(VertexAttribute.Tangent, offset++, VertexElementFlags.Tangent);
    }

    if (this._uv && !vertexElementMap[VertexAttribute.UV]) {
      this._addInternalVertexAttribute(VertexAttribute.UV, offset++, VertexElementFlags.UV);
    }

    if (this._uv1 && !vertexElementMap[VertexAttribute.UV1]) {
      this._addInternalVertexAttribute(VertexAttribute.UV1, offset++, VertexElementFlags.UV1);
    }

    if (this._uv2 && !vertexElementMap[VertexAttribute.UV2]) {
      this._addInternalVertexAttribute(VertexAttribute.UV2, offset++, VertexElementFlags.UV2);
    }

    if (this._uv3 && !vertexElementMap[VertexAttribute.UV3]) {
      this._addInternalVertexAttribute(VertexAttribute.UV3, offset++, VertexElementFlags.UV3);
    }

    if (this._uv4 && !vertexElementMap[VertexAttribute.UV4]) {
      this._addInternalVertexAttribute(VertexAttribute.UV4, offset++, VertexElementFlags.UV4);
    }

    if (this._uv5 && !vertexElementMap[VertexAttribute.UV5]) {
      this._addInternalVertexAttribute(VertexAttribute.UV5, offset++, VertexElementFlags.UV5);
    }

    if (this._uv6 && !vertexElementMap[VertexAttribute.UV6]) {
      this._addInternalVertexAttribute(VertexAttribute.UV6, offset++, VertexElementFlags.UV6);
    }

    if (this._uv7 && !vertexElementMap[VertexAttribute.UV7]) {
      this._addInternalVertexAttribute(VertexAttribute.UV7, offset++, VertexElementFlags.UV7);
    }
    this._blendShapeManager._vertexElementOffset = offset;
  }

  private _updateVertexElements(): void {
    const vertexElements = this._vertexElements;
    const bsManager = this._blendShapeManager;
    const previousCount = vertexElements.length;
    const previousBSOffset = bsManager._vertexElementOffset;

    if (this._internalVertexElementsUpdate) {
      this._updateInternalVertexElements();
      this._internalVertexElementsUpdate = false;
    }

    const bsUpdate = !bsManager._useTextureMode() && bsManager._vertexElementsNeedUpdate();
    if (previousBSOffset !== bsManager._vertexElementOffset || (bsUpdate && bsManager._blendShapeCount > 0)) {
      const length = bsManager._addVertexElements(this);
      if (length < previousCount) {
        this._setVertexElementsLength(length);
      }
    }
  }

  private _writeVector2AdvancedVertexData(
    attributeType: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    vertices: Vector2[]
  ): void {
    this._writeAdvancedVertexData(
      attributeType,
      vertexElementIndex,
      (typedArray: TypedArray, offset: number, index: number) => {
        const vertex = vertices[index]; // vertex maybe null or advanced data array length less than vertexCount
        if (vertex) {
          typedArray[offset] = vertex.x;
          typedArray[offset + 1] = vertex.y;
        }
      }
    );
  }

  private _writeVector3AdvancedVertexData(
    attributeType: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    vertices: Vector3[]
  ): void {
    this._writeAdvancedVertexData(
      attributeType,
      vertexElementIndex,
      (typedArray: TypedArray, offset: number, index: number) => {
        const vertex = vertices[index];
        if (vertex) {
          typedArray[offset] = vertex.x;
          typedArray[offset + 1] = vertex.y;
          typedArray[offset + 2] = vertex.z;
        }
      }
    );
  }

  private _writeVector4AdvancedVertexData(
    attributeType: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    vertices: Vector4[]
  ): void {
    this._writeAdvancedVertexData(
      attributeType,
      vertexElementIndex,
      (typedArray: TypedArray, offset: number, index: number) => {
        const vertex = vertices[index];
        if (vertex) {
          typedArray[offset] = vertex.x;
          typedArray[offset + 1] = vertex.y;
          typedArray[offset + 2] = vertex.z;
          typedArray[offset + 3] = vertex.w;
        }
      }
    );
  }

  private _writeColorAdvancedVertexData(
    attributeType: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    vertices: Color[]
  ): void {
    this._writeAdvancedVertexData(
      attributeType,
      vertexElementIndex,
      (typedArray: TypedArray, offset: number, index: number) => {
        const vertex = vertices[index];
        if (vertex) {
          typedArray[offset] = vertex.r;
          typedArray[offset + 1] = vertex.g;
          typedArray[offset + 2] = vertex.b;
          typedArray[offset + 3] = vertex.a;
        }
      }
    );
  }

  private _writeAdvancedVertexData(
    attributeType: VertexAttribute,
    vertexElementIndex: VertexElementIndex,
    onVertexWrite: (typedArray: TypedArray, offset: number, index: number) => void
  ): void {
    const vertexElement = this._vertexElementMap[attributeType];
    const bindingIndex = vertexElement.bindingIndex;
    const bufferBinding = this._vertexBufferBindings[bindingIndex];
    const buffer = bufferBinding?.buffer;
    if (!buffer) {
      return;
    }

    const advancedDataVersion = this._advancedVertexDataVersions[vertexElementIndex] ?? -1;
    if (advancedDataVersion > this._vertexBufferDataVersions[bindingIndex]) {
      const formatMetaInfo = vertexElement._formatMetaInfo;
      const typedArray = this._getVertexTypedArray(buffer.data.buffer, formatMetaInfo.type);
      const byteOffset = vertexElement.offset;
      const byteStride = bufferBinding.stride;
      const { BYTES_PER_ELEMENT } = typedArray;

      const { normalized, size, normalizedScaleFactor } = formatMetaInfo;
      for (let i = 0, n = this._vertexCount; i < n; i++) {
        const offset = (i * byteStride + byteOffset) / BYTES_PER_ELEMENT;
        onVertexWrite(typedArray, offset, i);
        if (normalized) {
          for (let j = 0; j < size; j++) {
            typedArray[offset + j] /= normalizedScaleFactor;
          }
        }
      }
    }
  }

  private _updateAdvancedVertices(): void {
    // prettier-ignore
    const { _positions, _normals, _colors, _advancedDataUpdateFlag, _boneWeights, _boneIndices, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;

    if (_advancedDataUpdateFlag & VertexElementFlags.Position) {
      this._writeVector3AdvancedVertexData(VertexAttribute.Position, VertexElementIndex.Position, _positions);
    }

    if (_normals && _advancedDataUpdateFlag & VertexElementFlags.Normal) {
      this._writeVector3AdvancedVertexData(VertexAttribute.Normal, VertexElementIndex.Normal, _normals);
    }

    if (_colors && _advancedDataUpdateFlag & VertexElementFlags.Color) {
      this._writeColorAdvancedVertexData(VertexAttribute.Color, VertexElementIndex.Color, _colors);
    }

    if (_boneWeights && _advancedDataUpdateFlag & VertexElementFlags.BoneWeight) {
      this._writeVector4AdvancedVertexData(VertexAttribute.BoneWeight, VertexElementIndex.BoneWeight, _boneWeights);
    }

    if (_boneIndices && _advancedDataUpdateFlag & VertexElementFlags.BoneIndex) {
      this._writeVector4AdvancedVertexData(VertexAttribute.BoneIndex, VertexElementIndex.BoneIndex, _boneIndices);
    }

    if (_tangents && _advancedDataUpdateFlag & VertexElementFlags.Tangent) {
      this._writeVector4AdvancedVertexData(VertexAttribute.Tangent, VertexElementIndex.Tangent, _tangents);
    }

    if (_uv && _advancedDataUpdateFlag & VertexElementFlags.UV) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV, VertexElementIndex.UV, _uv);
    }

    if (_uv1 && _advancedDataUpdateFlag & VertexElementFlags.UV1) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV1, VertexElementIndex.UV1, _uv1);
    }

    if (_uv2 && _advancedDataUpdateFlag & VertexElementFlags.UV2) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV2, VertexElementIndex.UV2, _uv2);
    }

    if (_uv3 && _advancedDataUpdateFlag & VertexElementFlags.UV3) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV3, VertexElementIndex.UV3, _uv3);
    }

    if (_uv4 && _advancedDataUpdateFlag & VertexElementFlags.UV4) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV4, VertexElementIndex.UV4, _uv4);
    }

    if (_uv5 && _advancedDataUpdateFlag & VertexElementFlags.UV5) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV5, VertexElementIndex.UV5, _uv5);
    }

    if (_uv6 && _advancedDataUpdateFlag & VertexElementFlags.UV6) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV6, VertexElementIndex.UV6, _uv6);
    }

    if (_uv7 && _advancedDataUpdateFlag & VertexElementFlags.UV7) {
      this._writeVector2AdvancedVertexData(VertexAttribute.UV7, VertexElementIndex.UV7, _uv7);
    }

    this._advancedDataUpdateFlag = 0;
  }

  private _updateInternalVertexBufferIndex(): void {
    if (this._internalVertexBufferIndex !== -1) {
      return;
    }

    let i = 0;
    const vertexBufferBindings = this._vertexBufferBindings;
    for (let n = vertexBufferBindings.length; i < n; i++) {
      if (!vertexBufferBindings[i]) {
        break;
      }
    }
    this._internalVertexBufferIndex = i;
  }

  private _addInternalVertexAttribute(
    vertexAttribute: VertexAttribute,
    index: number,
    vertexFlag: VertexElementFlags
  ): void {
    const format = this._getAttributeFormat(vertexAttribute);
    const bufferIndex = this._internalVertexBufferIndex;
    this._setVertexElement(
      index,
      new VertexElement(vertexAttribute, this._internalVertexBufferStride, format, bufferIndex)
    );

    this._internalVertexBufferStride += this._getAttributeByteLength(vertexAttribute);
    this._internalVertexElementsFlags |= vertexFlag;
  }

  private _getAttributeFormat(attribute: VertexAttribute): VertexElementFormat {
    switch (attribute) {
      case VertexAttribute.Position:
      case VertexAttribute.Normal:
        return VertexElementFormat.Vector3;
      case VertexAttribute.Color:
      case VertexAttribute.BoneWeight:
      case VertexAttribute.Tangent:
        return VertexElementFormat.Vector4;
      case VertexAttribute.BoneIndex:
        return VertexElementFormat.UByte4;
      case VertexAttribute.UV:
      case VertexAttribute.UV1:
      case VertexAttribute.UV2:
      case VertexAttribute.UV3:
      case VertexAttribute.UV4:
      case VertexAttribute.UV5:
      case VertexAttribute.UV6:
      case VertexAttribute.UV7:
        return VertexElementFormat.Vector2;
    }
  }

  private _getAttributeByteLength(attribute: VertexAttribute): number {
    switch (attribute) {
      case VertexAttribute.Position:
      case VertexAttribute.Normal:
        return 12;
      case VertexAttribute.Color:
      case VertexAttribute.BoneWeight:
      case VertexAttribute.Tangent:
        return 16;
      case VertexAttribute.BoneIndex:
        return 4;
      case VertexAttribute.UV:
      case VertexAttribute.UV1:
      case VertexAttribute.UV2:
      case VertexAttribute.UV3:
      case VertexAttribute.UV4:
      case VertexAttribute.UV5:
      case VertexAttribute.UV6:
      case VertexAttribute.UV7:
        return 8;
    }
  }

  private _releaseCache(): void {
    this._internalVertexBuffer?.markAsUnreadable();
    this._indices = null;
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
}

enum VertexElementFlags {
  None = 0,
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

enum VertexElementIndex {
  Position = 0,
  Normal = 1,
  Color = 2,
  Tangent = 3,
  BoneWeight = 4,
  BoneIndex = 5,
  UV = 6,
  UV1 = 7,
  UV2 = 8,
  UV3 = 9,
  UV4 = 10,
  UV5 = 11,
  UV6 = 12,
  UV7 = 13
}

type VertexType = Vector2 | Vector3 | Vector4 | Color;
