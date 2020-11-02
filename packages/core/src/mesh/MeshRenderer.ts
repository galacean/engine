import { Vector3 } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { Mesh } from "./Mesh";

// TODO 硬编码，后续添加到 RenderableComponent 内
function addPrimitivesRefCount(mesh: Mesh, refCount: number): void {
  const primitives = mesh.primitives;
  for (let i = 0, l = primitives.length; i < l; i++) {
    primitives[i]._addRefCount(refCount);
  }
}

/**
 * 负责渲染一个Mesh对象的组件
 */
export class MeshRenderer extends RenderableComponent {
  private _mesh: Mesh;
  @ignoreClone
  private _instanceMaterials: Material[] = [];
  @deepClone
  private _sharedMaterials: Material[] = [];

  constructor(entity: Entity) {
    super(entity);

    this._mesh = null; // Mesh Asset Object
  }

  /**
   * 当前绑定的 Mesh 对象
   */
  get mesh() {
    return this._mesh;
  }

  /**
   * 指定需要渲染的Mesh对象；多个MeshRenderer对象可以引用同一个Mesh对象
   * @param {Mesh} mesh Mesh 对象
   */
  set mesh(mesh: Mesh) {
    if (this._mesh) {
      // TODO 硬编码，后续添加到 RenderableComponent 内
      addPrimitivesRefCount(this._mesh, -1);
    }
    // TODO 硬编码，后续添加到 RenderableComponent 内
    addPrimitivesRefCount(mesh, 1);
    this._mesh = mesh;
    this._sharedMaterials = [];
    this._instanceMaterials = [];
  }

  /**
   * 指定一个Primitive所使用的材质（替代Primitive的默认材质）
   * @param {number} primitiveIndex Primitive 的名称
   * @param {Material} material 材质对象
   */
  setSharedMaterial(primitiveIndex: number, material: Material) {
    if (this._sharedMaterials[primitiveIndex]) {
      this._sharedMaterials[primitiveIndex]._addRefCount(-1);
    }
    material._addRefCount(1);
    this._sharedMaterials[primitiveIndex] = material;
  }

  /**
   * 指定一个Primitive所使用的材质（替代Primitive的默认材质）
   * @param {number} primitiveIndex Primitive 的名称
   * @param {Material} material 材质对象
   */
  setMaterial(primitiveIndex: number, material: Material) {
    if (this._instanceMaterials[primitiveIndex]) {
      this._instanceMaterials[primitiveIndex]._addRefCount(-1);
    }
    material._addRefCount(1);
    this._instanceMaterials[primitiveIndex] = material;
  }

  /**
   * 取得这个组件独有的材质对象
   * @param {number} primitiveIndex 索引值
   * @return {Material}
   */
  getInstanceMaterial(primitiveIndex: number): Material {
    return this._instanceMaterials[primitiveIndex];
  }

  /**
   * 取得共享的Primitive的材质对象
   * @param {number} primitiveIndex 索引值
   * @return {Material}
   */
  getSharedMaterial(primitiveIndex: number): Material {
    return this._sharedMaterials[primitiveIndex];
  }

  /**
   * 执行渲染
   * @param {CameraComponent} camera
   */
  render(camera: Camera) {
    const mesh = this._mesh;
    if (!mesh) {
      return;
    }

    const renderPipeline = camera._renderPipeline;
    const { primitives, groups } = mesh;

    //-- render every primitive
    for (let i = 0, len = primitives.length; i < len; i++) {
      const primitive = primitives[i];
      const material = this._instanceMaterials[i] || this._sharedMaterials[i];
      if (material) {
        const element = RenderElement.getFromPool();
        element.setValue(this, primitive, groups[i], material);
        renderPipeline.pushPrimitive(element);
      } else {
        Logger.error("Primitive has no material: " + primitive.name);
      }
    } // end of for
  }

  /**
   * 释放资源
   */
  destroy() {
    super.destroy();

    //-- release mesh
    this._mesh = null;

    //-- materials
    this._instanceMaterials = [];
    this._sharedMaterials = [];

    // 删除引用计数
    for (let i = 0; i < this._instanceMaterials.length; i++) {
      this._instanceMaterials[i]._addRefCount(-1);
    }

    // 删除引用计数
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
  protected _updateBounds(worldBounds: any): void {
    const localBounds: any = this.mesh.bounds;
    const worldMatrix: any = this._entity.transform.worldMatrix;
    Vector3.transformCoordinate(localBounds.min, worldMatrix, worldBounds.min); //TODO:简单模式，有漏洞，待AABB重构
    Vector3.transformCoordinate(localBounds.max, worldMatrix, worldBounds.max);
  }
}
