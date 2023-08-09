import { BoundingBox } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { ReferResource } from "../asset/ReferResource";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { SubMesh } from "../graphic/SubMesh";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { ShaderProgram } from "../shader/ShaderProgram";
import { Primitive } from "./Primitive";

/**
 * Mesh.
 */
export abstract class Mesh extends ReferResource {
  /** Name. */
  name: string;

  /** @internal */
  _primitive: Primitive;

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
    this._primitive = new Primitive(engine);
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
    this._primitive.clearVertexElements();
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
  }

  /**
   * @internal
   */
  _addVertexElement(element: VertexElement): void {
    this._primitive.addVertexElement(element);
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
  }

  /**
   * @internal
   */
  _removeVertexElement(index: number): void {
    this._primitive.removeVertexElement(index);
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
  }

  /**
   * @internal
   * @remarks should use together with `_setVertexElementsLength`
   */
  _setVertexElement(index: number, element: VertexElement): void {
    this._primitive.setVertexElement(index, element);
    this._updateFlagManager.dispatch(MeshModifyFlags.VertexElements);
  }

  /**
   * @internal
   *
   */
  _setVertexElementsLength(length: number): void {
    this._primitive.setVertexElementsLength(length);
  }

  /**
   * @internal
   */
  _setVertexBufferBinding(index: number, binding: VertexBufferBinding): void {
    this._primitive.setVertexBufferBinding(index, binding);
  }

  /**
   * @internal
   */
  _draw(shaderProgram: ShaderProgram, subMesh: SubMesh): void {
    this._primitive.draw(shaderProgram, subMesh);
  }

  override _addReferCount(value: number): void {
    super._addReferCount(value);
    this._primitive._addReferCount(value);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._primitive.destroy();
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
    this._primitive.setIndexBufferBinding(binding);
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
