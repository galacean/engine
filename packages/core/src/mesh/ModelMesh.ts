import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../Engine";
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

  private _vertexCount: number = 0;
  private _readable: boolean = true;
  private _verticesFloat32: Float32Array | null = null;
  private _verticesUint8: Uint8Array | null = null;
  private _indices: Uint8Array | Uint16Array | Uint32Array | null = null;
  private _indicesFormat: IndexFormat = null;
  private _indicesChangeFlag: boolean = false;

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

  private _bufferStrides: number[] = [];
  private _vertexBufferUpdateFlag: number = 0;
  private _vertexDataUpdateFlag: number = 0;
  private _vertexElementsUpdate: boolean = false;
  private _customVertexElements: VertexElement[] = [];
  private _vertexCountChanged: boolean = false;

  /**
   * Whether to read data of the mesh.
   */
  get readable(): boolean {
    return this._readable;
  }

  /**
   * Vertex count of current mesh.
   */
  get vertexCount(): number {
    if (this._vertexDataUpdateFlag & VertexChangedFlags.Position) {
      let vertexCount = 0;
      const positionElement = this._vertexElementMap[VertexAttribute.Position];
      if (positionElement) {
        const positionBufferBinding = this._vertexBufferBindings[positionElement.bindingIndex];
        if (positionBufferBinding) {
          vertexCount = positionBufferBinding.buffer.byteLength / positionBufferBinding.stride;
        }
      }

      this._vertexCount = vertexCount;
      this._vertexDataUpdateFlag &= ~VertexChangedFlags.Position;
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
    if (!this._positions && !positions) {
      return;
    }

    const newVertexCount = positions?.length || 0;
    this._vertexCountChanged = this._vertexCount != newVertexCount;
    this._vertexCount = newVertexCount;

    this._vertexElementsUpdate = !!this._positions !== !!positions;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.Position;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.Position;
    this._positions = positions;
  }

  /**
   * Get positions for the mesh.
   * @remarks Please call the setPositions() method after modification to ensure that the modification takes effect.
   */
  getPositions(): Vector3[] | null {
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }

    return this._positions;
  }

  /**
   * Set per-vertex normals for the mesh.
   * @param normals - The normals for the mesh.
   */
  setNormals(normals: Vector3[] | null): void {
    if (normals) {
      if (normals.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!this._normals) {
      return;
    }

    this._vertexElementsUpdate = !!this._normals !== !!normals;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.Normal;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.Normal;
    this._normals = normals;
  }

  /**
   * Get normals for the mesh.
   * @remarks Please call the setNormals() method after modification to ensure that the modification takes effect.
   */
  getNormals(): Vector3[] | null {
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._normals;
  }

  /**
   * Set per-vertex colors for the mesh.
   * @param colors - The colors for the mesh.
   */
  setColors(colors: Color[] | null): void {
    if (colors) {
      if (colors.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!this._colors) {
      return;
    }

    this._vertexElementsUpdate = !!this._colors !== !!colors;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.Color;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.Color;
    this._colors = colors;
  }

  /**
   * Get colors for the mesh.
   * @remarks Please call the setColors() method after modification to ensure that the modification takes effect.
   */
  getColors(): Color[] | null {
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._colors;
  }

  /**
   * Set per-vertex bone weights for the mesh.
   * @param boneWeights - The bone weights for the mesh.
   */
  setBoneWeights(boneWeights: Vector4[] | null): void {
    if (boneWeights) {
      if (boneWeights.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!this._boneWeights) {
      return;
    }

    this._vertexElementsUpdate = !!this._boneWeights !== !!boneWeights;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.BoneWeight;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.BoneWeight;
    this._boneWeights = boneWeights;
  }

  /**
   * Get weights for the mesh.
   * @remarks Please call the setWeights() method after modification to ensure that the modification takes effect.
   */
  getBoneWeights(): Vector4[] | null {
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._boneWeights;
  }

  /**
   * Set per-vertex bone indices for the mesh.
   * @param boneIndices - The bone indices for the mesh.
   */
  setBoneIndices(boneIndices: Vector4[] | null): void {
    if (boneIndices) {
      if (boneIndices?.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!this._boneIndices) {
      return;
    }

    this._vertexElementsUpdate = !!this._boneIndices !== !!boneIndices;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.BoneIndex;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.BoneIndex;
    this._boneIndices = boneIndices;
  }

  /**
   * Get joints for the mesh.
   * @remarks Please call the setBoneIndices() method after modification to ensure that the modification takes effect.
   */
  getBoneIndices(): Vector4[] | null {
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._boneIndices;
  }

  /**
   * Set per-vertex tangents for the mesh.
   * @param tangents - The tangents for the mesh.
   */
  setTangents(tangents: Vector4[] | null): void {
    if (tangents) {
      if (tangents.length !== this._vertexCount) {
        throw "The array provided needs to be the same size as vertex count.";
      }
    } else if (!this._tangents) {
      return;
    }

    this._vertexElementsUpdate = !!this._tangents !== !!tangents;
    this._vertexBufferUpdateFlag |= VertexChangedFlags.Tangent;
    this._vertexDataUpdateFlag &= ~VertexChangedFlags.Tangent;
    this._tangents = tangents;
  }

  /**
   * Get tangents for the mesh.
   * @remarks Please call the setTangents() method after modification to ensure that the modification takes effect.
   */
  getTangents(): Vector4[] | null {
    if (!this._readable) {
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
    if (uv && uv.length !== this._vertexCount) {
      throw "The array provided needs to be the same size as vertex count.";
    }

    channelIndex = channelIndex ?? 0;
    switch (channelIndex) {
      case 0:
        if (!this._uv && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV;
        this._uv = uv;
        break;
      case 1:
        if (!this._uv1 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv1 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV1;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV1;
        this._uv1 = uv;
        break;
      case 2:
        if (!this._uv2 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv2 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV2;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV2;
        this._uv2 = uv;
        break;
      case 3:
        if (!this._uv3 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv3 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV3;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV3;
        this._uv3 = uv;
        break;
      case 4:
        if (!this._uv4 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv4 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV4;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV4;
        this._uv4 = uv;
        break;
      case 5:
        if (!this._uv5 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv5 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV5;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV5;
        this._uv5 = uv;
        break;
      case 6:
        if (!this._uv6 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv6 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV6;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV6;
        this._uv6 = uv;
        break;
      case 7:
        if (!this._uv7 && !uv) {
          return;
        }

        this._vertexElementsUpdate = !!this._uv7 !== !!uv;
        this._vertexBufferUpdateFlag |= VertexChangedFlags.UV7;
        this._vertexDataUpdateFlag &= ~VertexChangedFlags.UV7;
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
    if (!this._readable) {
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
    if (!this._readable) {
      throw "Not allowed to access data while accessible is false.";
    }
    return this._indices;
  }

  /**
   * @beta
   * @todo Update buffer should support custom vertex elements.
   * Set vertex elements.
   * @param elements - Vertex element collection
   */
  setVertexElements(elements: VertexElement[]): void {
    const customVertexElements = this._customVertexElements;
    customVertexElements.length = 0;

    const customVertexElementMap: Record<string, VertexElement> = {};
    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      customVertexElements.push(element);
      customVertexElementMap[element.semantic] = element;
    }

    if (customVertexElementMap[VertexAttribute.Position]) {
      const positions = this.getPositions();
      positions && (this._vertexBufferUpdateFlag |= VertexChangedFlags.Position);
    } else {
      this.setPositions(null);
    }

    if (customVertexElementMap[VertexAttribute.Normal]) {
      const normals = this.getNormals();
      normals && (this._vertexBufferUpdateFlag |= VertexChangedFlags.Normal);
    } else {
      this.setNormals(null);
    }

    if (customVertexElementMap[VertexAttribute.Color]) {
      const colors = this.getColors();
      colors && (this._vertexBufferUpdateFlag |= VertexChangedFlags.Color);
    } else {
      this.setColors(null);
    }

    if (customVertexElementMap[VertexAttribute.BoneWeight]) {
      const boneWeights = this.getBoneWeights();
      boneWeights && (this._vertexBufferUpdateFlag |= VertexChangedFlags.BoneWeight);
    } else {
      this.setBoneWeights(null);
    }

    if (customVertexElementMap[VertexAttribute.BoneIndex]) {
      const boneIndices = this.getBoneIndices();
      boneIndices && (this._vertexBufferUpdateFlag |= VertexChangedFlags.BoneIndex);
    } else {
      this.setBoneIndices(null);
    }

    if (customVertexElementMap[VertexAttribute.Tangent]) {
      const tangents = this.getTangents();
      tangents && (this._vertexBufferUpdateFlag |= VertexChangedFlags.Tangent);
    } else {
      this.setTangents(null);
    }

    if (customVertexElementMap[VertexAttribute.UV]) {
      const uvs = this.getUVs(0);
      uvs && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV);
    } else {
      this.setUVs(null, 0);
    }

    if (customVertexElementMap[VertexAttribute.UV1]) {
      const uv1s = this.getUVs(1);
      uv1s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV1);
    } else {
      this.setUVs(null, 1);
    }

    if (customVertexElementMap[VertexAttribute.UV2]) {
      const uv2s = this.getUVs(2);
      uv2s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV2);
    } else {
      this.setUVs(null, 2);
    }

    if (customVertexElementMap[VertexAttribute.UV3]) {
      const uv3s = this.getUVs(3);
      uv3s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV3);
    } else {
      this.setUVs(null, 3);
    }

    if (customVertexElementMap[VertexAttribute.UV4]) {
      const uv4s = this.getUVs(4);
      uv4s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV4);
    } else {
      this.setUVs(null, 4);
    }

    if (customVertexElementMap[VertexAttribute.UV5]) {
      const uv5s = this.getUVs(5);
      uv5s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV5);
    } else {
      this.setUVs(null, 5);
    }

    if (customVertexElementMap[VertexAttribute.UV6]) {
      const uv6s = this.getUVs(6);
      uv6s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV6);
    } else {
      this.setUVs(null, 6);
    }

    if (customVertexElementMap[VertexAttribute.UV7]) {
      const uv7s = this.getUVs(7);
      uv7s && (this._vertexBufferUpdateFlag |= VertexChangedFlags.UV7);
    } else {
      this.setUVs(null, 7);
    }

    this._vertexElementsUpdate = true;
  }

  /**
   * @beta
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBufferBindings: VertexBufferBinding, index?: number): void;

  /**
   * @beta
   * Set vertex buffer binding.
   * @param vertexBuffer - Vertex buffer
   * @param stride - Vertex buffer data stride
   * @param index - Vertex buffer index, the default value is 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, index?: number): void;

  /**
   * @beta
   * @todo Use this way to update gpu buffer should can get cpu data(may be should support get data form GPU).
   * @use `setPosition` and `setVertexBufferBinding` at the same time, thew VertexBufferBinding and Vertex buffer data should right.
   */
  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    strideOrFirstIndex: number = 0,
    index: number = 0
  ): void {
    let binding = <VertexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new VertexBufferBinding(<Buffer>bufferOrBinding, strideOrFirstIndex));

    const bindings = this._vertexBufferBindings;
    bindings.length <= index && (bindings.length = index + 1);
    this._setVertexBufferBinding(isBinding ? strideOrFirstIndex : index, binding);
    this._vertexDataUpdateFlag |= VertexChangedFlags.Position;
  }

  /**
   * Set vertex buffer binding.
   * @param vertexBufferBindings - Vertex buffer binding
   * @param firstIndex - First vertex buffer index, the default value is 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._vertexBufferBindings;
    const count = vertexBufferBindings.length;
    const needLength = firstIndex + count;
    bindings.length < needLength && (bindings.length = needLength);
    for (let i = 0; i < count; i++) {
      this._setVertexBufferBinding(firstIndex + i, vertexBufferBindings[i]);
    }
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
   * @param noLongerReadable - Whether to read data later. If true, you'll never read data anymore (free memory cache)
   */
  uploadData(noLongerReadable: boolean): void {
    // Update vertex elements
    this._updateVertexElements();

    // Vertex count change
    const vertexBuffer = this._vertexBufferBindings[0]?._buffer;
    if (this._vertexCountChanged) {
      this._vertexBufferUpdateFlag = VertexChangedFlags.All;
      vertexBuffer?.destroy();

      const elementCount = this._bufferStrides[0] / 4;
      const vertexFloatCount = elementCount * this.vertexCount;
      const vertices = new Float32Array(vertexFloatCount);
      this._verticesFloat32 = vertices;
      this._verticesUint8 = new Uint8Array(vertices.buffer);
      this._updateVertices(vertices);

      const bufferUsage = noLongerReadable ? BufferUsage.Static : BufferUsage.Dynamic;
      const newVertexBuffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, vertices, bufferUsage);

      this._setVertexBufferBinding(0, new VertexBufferBinding(newVertexBuffer, elementCount * 4));
      this._vertexCountChanged = false;
    } else {
      if (this._vertexBufferUpdateFlag & VertexChangedFlags.All) {
        let vertices = this._verticesFloat32;
        if (!vertices) {
          const elementCount = this._bufferStrides[0] / 4;
          const vertexFloatCount = elementCount * this.vertexCount;
          this._verticesFloat32 = vertices = new Float32Array(vertexFloatCount);
        }

        this._updateVertices(vertices);
        vertexBuffer.setData(vertices);
      }
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

    const { _blendShapeManager: blendShapeManager } = this;
    blendShapeManager._blendShapeCount > 0 && blendShapeManager._update(this._vertexCountChanged, noLongerReadable);

    if (noLongerReadable) {
      this._readable = false;
      this._releaseCache();
    }
  }

  /**
   * Calculate mesh tangent.
   * @remark need to set positions(with or not with indices), normals, uv before calculation.
   * @remark based on http://foundationsofgameenginedev.com/FGED2-sample.pdf
   */
  calculateTangents(): void {
    if (!this._normals || !this._uv) {
      throw "Set normal and uv before calculation.";
    }
    const { _indices: indices, _positions: positions, _normals: normals, _uv: uvs, _vertexCount: vertexCount } = this;
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
  protected override _onDestroy(): void {
    super._onDestroy();
    this._readable && this._releaseCache();
  }

  private _supplementaryVertexElements(): void {
    this._clearVertexElements();

    const customVertexElements = this._customVertexElements;
    for (let i = 0, n = customVertexElements.length; i < n; i++) {
      this._addVertexElement(customVertexElements[i]);
    }

    const vertexElementMap = this._vertexElementMap;
    if (this._positions && !vertexElementMap[VertexAttribute.Position]) {
      this._insertVertexAttribute(VertexAttribute.Position);
    } else {
    }

    if (this._normals && !vertexElementMap[VertexAttribute.Normal]) {
      this._insertVertexAttribute(VertexAttribute.Normal);
    }

    if (this._colors && !vertexElementMap[VertexAttribute.Color]) {
      this._insertVertexAttribute(VertexAttribute.Color);
    }

    if (this._boneWeights && !vertexElementMap[VertexAttribute.BoneWeight]) {
      this._insertVertexAttribute(VertexAttribute.BoneWeight);
    }

    if (this._boneIndices && !vertexElementMap[VertexAttribute.BoneIndex]) {
      this._insertVertexAttribute(VertexAttribute.BoneIndex);
    }

    if (this._tangents && !vertexElementMap[VertexAttribute.Tangent]) {
      this._insertVertexAttribute(VertexAttribute.Tangent);
    }

    if (this._uv && !vertexElementMap[VertexAttribute.UV]) {
      this._insertVertexAttribute(VertexAttribute.UV);
    }

    if (this._uv1 && !vertexElementMap[VertexAttribute.UV1]) {
      this._insertVertexAttribute(VertexAttribute.UV1);
    }

    if (this._uv2 && !vertexElementMap[VertexAttribute.UV2]) {
      this._insertVertexAttribute(VertexAttribute.UV2);
    }

    if (this._uv3 && !vertexElementMap[VertexAttribute.UV3]) {
      this._insertVertexAttribute(VertexAttribute.UV3);
    }

    if (this._uv4 && !vertexElementMap[VertexAttribute.UV4]) {
      this._insertVertexAttribute(VertexAttribute.UV4);
    }

    if (this._uv5 && !vertexElementMap[VertexAttribute.UV5]) {
      this._insertVertexAttribute(VertexAttribute.UV5);
    }

    if (this._uv6 && !vertexElementMap[VertexAttribute.UV6]) {
      this._insertVertexAttribute(VertexAttribute.UV6);
    }

    if (this._uv7 && !vertexElementMap[VertexAttribute.UV7]) {
      this._insertVertexAttribute(VertexAttribute.UV7);
    }
  }

  private _updateVertexElements(): void {
    const bsManager = this._blendShapeManager;
    const bsAttributeUpdate = !bsManager._useTextureMode() && bsManager._vertexElementsNeedUpdate();

    if (this._vertexElementsUpdate || bsAttributeUpdate) {
      this._supplementaryVertexElements();

      if (bsAttributeUpdate && bsManager._blendShapeCount > 0) {
        // Reserve at least 1 placeholder to save the built-in vertex buffer
        bsManager._setAttributeModeOffsetInfo(this._vertexElements.length, this._vertexBufferBindings.length || 1);
        bsManager._addVertexElements(this);
      }
      this._vertexElementsUpdate = false;
    }
  }

  private _updateVertices(vertices: Float32Array): void {
    // prettier-ignore
    const { _bufferStrides,_vertexCount, _positions, _normals, _colors, _vertexBufferUpdateFlag: _vertexChangeFlag, _boneWeights, _boneIndices, _tangents, _uv, _uv1, _uv2, _uv3, _uv4, _uv5, _uv6, _uv7 } = this;
    const _vertexStrideFloat = _bufferStrides[0] / 4;

    if (_vertexChangeFlag & VertexChangedFlags.Position) {
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
      if (_vertexChangeFlag & VertexChangedFlags.Normal) {
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
      if (_vertexChangeFlag & VertexChangedFlags.Color) {
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
      if (_vertexChangeFlag & VertexChangedFlags.BoneWeight) {
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
      if (_vertexChangeFlag & VertexChangedFlags.BoneIndex) {
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
      if (_vertexChangeFlag & VertexChangedFlags.Tangent) {
        for (let i = 0; i < _vertexCount; i++) {
          const start = _vertexStrideFloat * i + offset;
          const tangent = _tangents[i];
          if (tangent) {
            vertices[start] = tangent.x;
            vertices[start + 1] = tangent.y;
            vertices[start + 2] = tangent.z;
            vertices[start + 3] = tangent.w;
          }
        }
      }
      offset += 4;
    }
    if (_uv) {
      if (_vertexChangeFlag & VertexChangedFlags.UV) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV1) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV2) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV3) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV4) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV5) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV6) {
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
      if (_vertexChangeFlag & VertexChangedFlags.UV7) {
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
    this._vertexBufferUpdateFlag = 0;
  }

  private _insertVertexAttribute(vertexAttribute: VertexAttribute): void {
    const format = this._getAttributeFormat(vertexAttribute);
    const needByteLength = this._getAttributeByteLength(vertexAttribute);
    const vertexElements = this._vertexElements;

    let i = 0;
    let lastOffset = 0;
    for (let n = vertexElements.length; i < n; i++) {
      const vertexElement = vertexElements[i];
      if (vertexElement.bindingIndex == 0) {
        if (vertexElement.offset - lastOffset >= needByteLength) {
          break;
        }
        lastOffset = vertexElement.offset + this._getAttributeByteLength(vertexElement.semantic);
      }
    }
    this._insertVertexElement(i, new VertexElement(vertexAttribute, lastOffset, format, 0));
    this._bufferStrides[0] = lastOffset + needByteLength;
  }

  private _getAttributeFormat(attribute: VertexAttribute): VertexElementFormat {
    switch (attribute) {
      case VertexAttribute.Position:
        return VertexElementFormat.Vector3;
      case VertexAttribute.Normal:
        return VertexElementFormat.Vector3;
      case VertexAttribute.Color:
        return VertexElementFormat.Vector4;
      case VertexAttribute.BoneWeight:
        return VertexElementFormat.Vector4;
      case VertexAttribute.BoneIndex:
        return VertexElementFormat.UByte4;
      case VertexAttribute.Tangent:
        return VertexElementFormat.Vector4;
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

  private _getAttributeByteLength(attribute: string): number {
    switch (attribute) {
      case VertexAttribute.Position:
        return 12;
      case VertexAttribute.Normal:
        return 12;
      case VertexAttribute.Color:
        return 16;
      case VertexAttribute.BoneWeight:
        return 16;
      case VertexAttribute.BoneIndex:
        return 4;
      case VertexAttribute.Tangent:
        return 16;
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
}

enum VertexChangedFlags {
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
