import { IPlatformPrimitive } from "@galacean/engine-design/types/renderingHardwareInterface/IPlatformPrimitive";
import { BoundingBox } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { GraphicsResource } from "../asset/GraphicsResource";
import { BufferUtil } from "../graphic/BufferUtil";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { SubMesh } from "../graphic/SubMesh";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { ShaderProgram } from "../shader/ShaderProgram";

/**
 * Mesh.
 */
export abstract class Mesh extends GraphicsResource {
  /** Name. */
  name: string;

  /** @internal */
  _vertexElementMap: Record<string, VertexElement> = {};
  /** @internal */
  _glIndexType: number;
  /** @internal */
  _glIndexByteCount: number;
  /** @internal */
  _bufferStructChanged: boolean;
  /** @internal */
  _platformPrimitive: IPlatformPrimitive;

  /** @internal */
  _instanceCount: number = 0;
  /** @internal */
  _vertexBufferBindings: VertexBufferBinding[] = [];
  /** @internal */
  _indexBufferBinding: IndexBufferBinding = null;
  /** @internal */
  _vertexElements: VertexElement[] = [];
  /** @internal */
  _enableVAO: boolean = true;
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _bounds: BoundingBox = new BoundingBox();
  private _subMeshes: SubMesh[] = [];

  /**
   * The bounding volume of the mesh.
   */
  get bounds(): BoundingBox {
    return this._bounds;
  }

  set bounds(value: BoundingBox) {
    if (this._bounds !== value) {
      this._bounds.copyFrom(value);
    }
  }

  /**
   * First sub-mesh. Rendered using the first material.
   */
  get subMesh(): SubMesh | null {
    return this._subMeshes[0] || null;
  }

  /**
   * A collection of sub-mesh, each sub-mesh can be rendered with an independent material.
   */
  get subMeshes(): Readonly<SubMesh[]> {
    return this._subMeshes;
  }

  /**
   * Create mesh.
   * @param engine - Engine
   * @param name - Mesh name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this._platformPrimitive = this._engine._hardwareRenderer.createPlatformPrimitive(this);
    this._onBoundsChanged = this._onBoundsChanged.bind(this);

    const bounds = this._bounds;
    // @ts-ignore
    bounds.min._onValueChanged = this._onBoundsChanged;
    // @ts-ignore
    bounds.max._onValueChanged = this._onBoundsChanged;
  }

  /**
   * Add sub-mesh, each sub-mesh can correspond to an independent material.
   * @param subMesh - Start drawing offset, if the index buffer is set, it means the offset in the index buffer, if not set, it means the offset in the vertex buffer
   * @returns Sub-mesh
   */
  addSubMesh(subMesh: SubMesh): SubMesh;

  /**
   * Add sub-mesh, each sub-mesh can correspond to an independent material.
   * @param start - Start drawing offset, if the index buffer is set, it means the offset in the index buffer, if not set, it means the offset in the vertex buffer
   * @param count - Drawing count, if the index buffer is set, it means the count in the index buffer, if not set, it means the count in the vertex buffer
   * @param topology - Drawing topology, default is MeshTopology.Triangles
   * @returns Sub-mesh
   */
  addSubMesh(start: number, count: number, topology?: MeshTopology): SubMesh;

  addSubMesh(
    startOrSubMesh: number | SubMesh,
    count?: number,
    topology: MeshTopology = MeshTopology.Triangles
  ): SubMesh {
    if (typeof startOrSubMesh === "number") {
      startOrSubMesh = new SubMesh(startOrSubMesh, count, topology);
    }
    this._subMeshes.push(startOrSubMesh);
    return startOrSubMesh;
  }

  /**
   * Remove sub-mesh.
   * @param subMesh - Sub-mesh needs to be removed
   */
  removeSubMesh(subMesh: SubMesh): void {
    const subMeshes = this._subMeshes;
    const index = subMeshes.indexOf(subMesh);
    if (index !== -1) {
      subMeshes.splice(index, 1);
    }
  }

  /**
   * Clear all sub-mesh.
   */
  clearSubMesh(): void {
    this._subMeshes.length = 0;
  }

  /**
   * @internal
   */
  _clearVertexElements(): void {
    this._vertexElements.length = 0;
    const vertexElementMap = this._vertexElementMap;
    for (const k in vertexElementMap) {
      delete vertexElementMap[k];
    }
  }

  /**
   * @internal
   */
  _addVertexElement(element: VertexElement): void {
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    const semantic = element.semantic;
    const oldVertexElement = vertexElementMap[semantic];
    if (oldVertexElement) {
      console.warn(`VertexElement ${semantic} already exists.`);
      vertexElements.splice(vertexElements.indexOf(oldVertexElement), 1);
    }
    vertexElementMap[semantic] = element;
    vertexElements.push(element);
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
    this._bufferStructChanged = true;
  }

  /**
   * @internal
   */
  _removeVertexElement(index: number): void {
    const vertexElements = this._vertexElements;

    // Delete the old vertex element
    const vertexElement = vertexElements[index];
    vertexElements.splice(index, 1);
    delete this._vertexElementMap[vertexElement.semantic];

    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
    this._bufferStructChanged = true;
  }

  /**
   * @internal
   * @remarks should use together with `_setVertexElementsLength`
   */
  _setVertexElement(index: number, element: VertexElement): void {
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    // Delete the old vertex element
    const oldVertexElement = vertexElements[index];
    oldVertexElement && delete vertexElementMap[oldVertexElement.semantic];

    vertexElementMap[element.semantic] = element;
    vertexElements[index] = element;
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
    this._bufferStructChanged = true;
  }

  /**
   * @internal
   *
   */
  _setVertexElementsLength(length: number): void {
    const vertexElementMap = this._vertexElementMap;
    const vertexElements = this._vertexElements;

    for (let i = length, n = vertexElements.length; i < n; i++) {
      const element = vertexElements[i];
      delete vertexElementMap[element.semantic];
    }
    vertexElements.length = length;
  }

  /**
   * @internal
   */
  _setVertexBufferBinding(index: number, binding: VertexBufferBinding): void {
    const referCount = this._getReferCount();
    if (referCount > 0) {
      this._vertexBufferBindings[index]?.buffer._addReferCount(-referCount);
      binding?.buffer._addReferCount(referCount);
    }
    this._vertexBufferBindings[index] = binding;
    this._bufferStructChanged = true;
  }

  /**
   * @internal
   */
  _draw(shaderProgram: ShaderProgram, subMesh: SubMesh): void {
    this._platformPrimitive.draw(shaderProgram, subMesh);
    this._bufferStructChanged = false;
  }

  override _addReferCount(value: number): void {
    super._addReferCount(value);
    const vertexBufferBindings = this._vertexBufferBindings;
    for (let i = 0, n = vertexBufferBindings.length; i < n; i++) {
      vertexBufferBindings[i]?.buffer._addReferCount(value);
    }
    this._indexBufferBinding?._buffer._addReferCount(value);
  }

  override _rebuild(): void {
    this._engine._hardwareRenderer.createPlatformPrimitive(this);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._vertexBufferBindings = null;
    this._indexBufferBinding = null;
    this._vertexElements = null;
    this._vertexElementMap = null;
    this._platformPrimitive.destroy();
  }

  /**
   * @internal
   */
  protected _setVertexElements(elements: VertexElement[]): void {
    this._clearVertexElements();
    for (let i = 0, n = elements.length; i < n; i++) {
      this._addVertexElement(elements[i]);
    }
  }

  /**
   * @internal
   */
  protected _setIndexBufferBinding(binding: IndexBufferBinding | null): void {
    const lastBinding = this._indexBufferBinding;
    const referCount = this._getReferCount();
    if (referCount > 0) {
      lastBinding?.buffer._addReferCount(-referCount);
      binding?.buffer._addReferCount(referCount);
    }
    if (binding) {
      this._indexBufferBinding = binding;
      this._glIndexType = BufferUtil._getGLIndexType(binding.format);
      this._glIndexByteCount = BufferUtil._getGLIndexByteCount(binding.format);
      (!lastBinding || lastBinding._buffer !== binding._buffer) && (this._bufferStructChanged = true);
    } else {
      this._indexBufferBinding = null;
      this._glIndexType = undefined;
      lastBinding && (this._bufferStructChanged = true);
    }
  }

  private _onBoundsChanged(): void {
    this._updateFlagManager.dispatch(MeshModifyFlags.Bounds);
  }
}

/**
 * @internal
 */
export enum MeshModifyFlags {
  Bounds = 0x1,
  VertexElements = 0x2
}
