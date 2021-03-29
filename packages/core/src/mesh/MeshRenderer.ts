import { BoundingBox } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { ignoreClone, shallowClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { Mesh } from "./Mesh";

function addPrimitivesRefCount(mesh: Mesh, refCount: number): void {
  const primitives = mesh.primitives;
  for (let i = 0, l = primitives.length; i < l; i++) {
    primitives[i]._addRefCount(refCount);
  }
}

/**
 * MeshRenderer Component
 */
export class MeshRenderer extends Renderer {
  private _mesh: Mesh;
  @ignoreClone
  private _instanceMaterials: Material[] = [];
  @shallowClone
  private _sharedMaterials: Material[] = [];

  constructor(entity: Entity) {
    super(entity);

    this._mesh = null; // Mesh Asset Object
  }

  /**
   * Current mesh object.
   */
  get mesh() {
    return this._mesh;
  }

  /**
   * Specify mesh which will be used to render.
   * @param mesh - Mesh Object
   */
  set mesh(mesh: Mesh) {
    if (this._mesh) {
      addPrimitivesRefCount(this._mesh, -1);
    }
    addPrimitivesRefCount(mesh, 1);
    this._mesh = mesh;
    this._sharedMaterials = [];
    this._instanceMaterials = [];
  }

  /**
   * Specify a material that will be used by a primitive and the material could be shared.
   * @param primitiveIndex - Primitive's index
   * @param material - Material.
   */
  setSharedMaterial(primitiveIndex: number, material: Material) {
    if (this._sharedMaterials[primitiveIndex]) {
      this._sharedMaterials[primitiveIndex]._addRefCount(-1);
    }
    material._addRefCount(1);
    this._sharedMaterials[primitiveIndex] = material;
  }

  /**
   * Specify a material that will be used by a primitive.
   * @param primitiveIndex - Primitive's index
   * @param material - Material
   */
  setMaterial(primitiveIndex: number, material: Material) {
    if (this._instanceMaterials[primitiveIndex]) {
      this._instanceMaterials[primitiveIndex]._addRefCount(-1);
    }
    material._addRefCount(1);
    this._instanceMaterials[primitiveIndex] = material;
  }

  /**
   * Get the material object exclusive to this component
   * @param primitiveIndex - Primitive's index
   * @return Material
   */
  getInstanceMaterial(primitiveIndex: number): Material {
    return this._instanceMaterials[primitiveIndex];
  }

  /**
   * Get the shared primitive material object
   * @param primitiveIndex Primitive's index
   * @return Material
   */
  getSharedMaterial(primitiveIndex: number): Material {
    return this._sharedMaterials[primitiveIndex];
  }

  /**
   * Execute render
   * @param camera
   */
  render(camera: Camera) {
    const mesh = this._mesh;
    if (!mesh) {
      return;
    }

    const renderPipeline = camera._renderPipeline;
    const { primitives, groups } = mesh;
    const renderElementPool = this._engine._renderElementPool;

    //-- render every primitive
    for (let i = 0, len = primitives.length; i < len; i++) {
      const primitive = primitives[i];
      const material = this._instanceMaterials[i] || this._sharedMaterials[i];
      if (material) {
        const element = renderElementPool.getFromPool();
        element.setValue(this, primitive, groups[i], material);
        renderPipeline.pushPrimitive(element);
      } else {
        Logger.error("Primitive has no material: " + primitive.name);
      }
    } // end of for
  }

  /**
   * Destroy the component.
   */
  destroy() {
    super.destroy();

    //-- release mesh
    this._mesh = null;

    //-- materials
    this._instanceMaterials = [];
    this._sharedMaterials = [];

    // delete reference count
    for (let i = 0; i < this._instanceMaterials.length; i++) {
      this._instanceMaterials[i]._addRefCount(-1);
    }

    // delete reference count
    for (let i = 0; i < this._sharedMaterials.length; i++) {
      this._sharedMaterials[i]._addRefCount(-1);
    }

    if (this._mesh) {
      addPrimitivesRefCount(this._mesh, -1);
    }
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const localBounds = this.mesh.bounds;
    const worldMatrix = this._entity.transform.worldMatrix;

    BoundingBox.transform(localBounds, worldMatrix, worldBounds);
  }
}
