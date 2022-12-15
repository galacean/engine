import { BoundingBox, Matrix, Vector3 } from "@oasis-engine/math";
import { assignmentClone, deepClone, ignoreClone, shallowClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { dependentComponents } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { Material } from "./material/Material";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { Shader } from "./shader";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { Transform, TransformModifyFlags } from "./Transform";

/**
 * Basis for all renderers.
 * @decorator `@dependentComponents(Transform)`
 */
@dependentComponents(Transform)
export class Renderer extends Component {
  private static _tempVector0 = new Vector3();

  private static _receiveShadowMacro = Shader.getMacroByName("OASIS_RECEIVE_SHADOWS");
  private static _localMatrixProperty = Shader.getPropertyByName("u_localMat");
  private static _worldMatrixProperty = Shader.getPropertyByName("u_modelMat");
  private static _mvMatrixProperty = Shader.getPropertyByName("u_MVMat");
  private static _mvpMatrixProperty = Shader.getPropertyByName("u_MVPMat");
  private static _mvInvMatrixProperty = Shader.getPropertyByName("u_MVInvMat");
  private static _normalMatrixProperty = Shader.getPropertyByName("u_normalMat");

  /** ShaderData related to renderer. */
  @deepClone
  readonly shaderData: ShaderData = new ShaderData(ShaderDataGroup.Renderer);

  /** @internal */
  @ignoreClone
  _distanceForSort: number;
  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;
  /** @internal */
  @ignoreClone
  _rendererIndex: number = -1;
  /** @internal */
  @ignoreClone
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();
  /** @internal */
  @deepClone
  _bounds: BoundingBox = new BoundingBox();
  @ignoreClone
  _renderFrameCount: number;

  @ignoreClone
  protected _overrideUpdate: boolean = false;
  @shallowClone
  protected _materials: Material[] = [];
  @ignoreClone
  protected _dirtyUpdateFlag: number = 0;

  @ignoreClone
  private _mvMatrix: Matrix = new Matrix();
  @ignoreClone
  private _mvpMatrix: Matrix = new Matrix();
  @ignoreClone
  private _mvInvMatrix: Matrix = new Matrix();
  @ignoreClone
  private _normalMatrix: Matrix = new Matrix();
  @ignoreClone
  private _materialsInstanced: boolean[] = [];
  @ignoreClone
  private _priority: number = 0;
  @assignmentClone
  private _receiveShadows: boolean = true;

  /**
   * Whether it is culled in the current frame and does not participate in rendering.
   */
  get isCulled(): boolean {
    return !(this._renderFrameCount === undefined || this._renderFrameCount === this._engine.time.frameCount - 1);
  }

  /**
   * Whether receive shadow.
   */
  get receiveShadows(): boolean {
    return this._receiveShadows;
  }

  set receiveShadows(value: boolean) {
    if (this._receiveShadows !== value) {
      if (value) {
        this.shaderData.enableMacro(Renderer._receiveShadowMacro);
      } else {
        this.shaderData.disableMacro(Renderer._receiveShadowMacro);
      }
      this._receiveShadows = value;
    }
  }

  /** Whether cast shadow. */
  castShadows: boolean = true;

  /**
   * Material count.
   */
  get materialCount(): number {
    return this._materials.length;
  }

  set materialCount(value: number) {
    const materials = this._materials;
    const materialsInstanced = this._materialsInstanced;

    materials.length !== value && (materials.length = value);
    materialsInstanced.length > value && (materialsInstanced.length = value);
  }

  /**
   * The bounding volume of the renderer.
   */
  get bounds(): BoundingBox {
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      this._updateBounds(this._bounds);
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }
    return this._bounds;
  }

  /**
   * The render priority of the renderer, lower values are rendered first and higher values are rendered last.
   */
  get priority(): number {
    return this._priority;
  }

  set priority(value: number) {
    this._priority = value;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const prototype = Renderer.prototype;
    this._overrideUpdate = this.update !== prototype.update;
    this.shaderData._addRefCount(1);
    this._onTransformChanged = this._onTransformChanged.bind(this);
    this._registerEntityTransformListener();

    this.shaderData.enableMacro(Renderer._receiveShadowMacro);
  }

  /**
   * Get the first instance material.
   * @returns The first instance material
   */
  getInstanceMaterial(): Material | null;

  /**
   * Get the first instance material by index.
   * @remarks Calling this function for the first time after the material is set will create an instance material to ensure that it is unique to the renderer.
   * @param index - Material index
   * @returns Instance material
   */
  getInstanceMaterial(index: number): Material | null;

  getInstanceMaterial(index: number = 0): Material | null {
    const materials = this._materials;
    if (materials.length > index) {
      const material = materials[index];
      if (material) {
        if (this._materialsInstanced[index]) {
          return material;
        } else {
          return this._createInstanceMaterial(material, index);
        }
      }
    }
    return null;
  }

  /**
   * Get the first material.
   * @returns The first material
   */
  getMaterial(): Material | null;

  /**
   * Get the first material by index.
   * @param index - Material index
   * @returns Material
   */
  getMaterial(index: number): Material | null;

  getMaterial(index: number = 0): Material | null {
    return this._materials[index] || null;
  }

  /**
   * Set the first material.
   * @param material - The first material
   */
  setMaterial(material: Material): void;

  /**
   * Set material by index.
   * @param index - Material index
   * @param material - The material
   */
  setMaterial(index: number, material: Material): void;

  setMaterial(indexOrMaterial: number | Material, material: Material = null): void {
    if (typeof indexOrMaterial === "number") {
      this._setMaterial(indexOrMaterial, material);
    } else {
      this._setMaterial(0, indexOrMaterial);
    }
  }

  /**
   * Get all instance materials.
   * @remarks Calling this function for the first time after the material is set will create an instance material to ensure that it is unique to the renderer.
   * @returns All instance materials
   */
  getInstanceMaterials(): Readonly<Material[]> {
    const materials = this._materials;
    const materialsInstance = this._materialsInstanced;
    for (let i = 0, n = materials.length; i < n; i++) {
      if (!materialsInstance[i]) {
        this._createInstanceMaterial(this._materials[i], i);
      }
    }
    return materials;
  }

  /**
   * Get all materials.
   * @returns All materials
   */
  getMaterials(): Readonly<Material[]> {
    return this._materials;
  }

  /**
   * Set all materials.
   * @param materials - All materials
   */
  setMaterials(materials: Material[]): void {
    const count = materials.length;
    const internalMaterials = this._materials;
    const materialsInstanced = this._materialsInstanced;

    for (let i = count, n = internalMaterials.length; i < n; i++) {
      const internalMaterial = internalMaterials[i];
      internalMaterial && internalMaterial._addRefCount(-1);
    }

    internalMaterials.length !== count && (internalMaterials.length = count);
    materialsInstanced.length !== 0 && (materialsInstanced.length = 0);

    for (let i = 0; i < count; i++) {
      const internalMaterial = internalMaterials[i];
      const material = materials[i];
      if (internalMaterial !== material) {
        internalMaterials[i] = material;
        internalMaterial && internalMaterial._addRefCount(-1);
        material && material._addRefCount(1);
      }
    }
  }

  update(deltaTime: number): void {}

  /**
   * @override
   * @internal
   */
  _onEnable(): void {
    const componentsManager = this.engine._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  /**
   * @override
   * @internal
   */
  _onDisable(): void {
    const componentsManager = this.engine._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    componentsManager.removeRenderer(this);
  }

  /**
   * @internal
   */
  _prepareRender(context: RenderContext): void {
    const virtualCamera = context.virtualCamera;
    const cameraPosition = virtualCamera.position;
    const boundsCenter = this.bounds.getCenter(Renderer._tempVector0);

    if (virtualCamera.isOrthographic) {
      Vector3.subtract(boundsCenter, cameraPosition, boundsCenter);
      this._distanceForSort = Vector3.dot(boundsCenter, virtualCamera.forward);
    } else {
      this._distanceForSort = Vector3.distanceSquared(boundsCenter, cameraPosition);
    }

    this._updateShaderData(context);
    this._render(context);

    // union camera global macro and renderer macro.
    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      this.shaderData._macroCollection,
      this._globalShaderMacro
    );
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this.entity.transform._updateFlagManager.removeListener(this._onTransformChanged);

    this.shaderData._addRefCount(-1);

    const materials = this._materials;
    for (let i = 0, n = materials.length; i < n; i++) {
      materials[i]?._addRefCount(-1);
    }
  }

  protected _updateShaderData(context: RenderContext): void {
    const worldMatrix = this.entity.transform.worldMatrix;
    this._updateTransformShaderData(context, worldMatrix);
  }

  protected _updateTransformShaderData(context: RenderContext, worldMatrix: Matrix): void {
    const shaderData = this.shaderData;
    const virtualCamera = context.virtualCamera;

    const mvMatrix = this._mvMatrix;
    const mvpMatrix = this._mvpMatrix;
    const mvInvMatrix = this._mvInvMatrix;
    const normalMatrix = this._normalMatrix;

    Matrix.multiply(virtualCamera.viewMatrix, worldMatrix, mvMatrix);
    Matrix.multiply(virtualCamera.viewProjectionMatrix, worldMatrix, mvpMatrix);
    Matrix.invert(mvMatrix, mvInvMatrix);
    Matrix.invert(worldMatrix, normalMatrix);
    normalMatrix.transpose();

    shaderData.setMatrix(Renderer._localMatrixProperty, this.entity.transform.localMatrix);
    shaderData.setMatrix(Renderer._worldMatrixProperty, worldMatrix);
    shaderData.setMatrix(Renderer._mvMatrixProperty, mvMatrix);
    shaderData.setMatrix(Renderer._mvpMatrixProperty, mvpMatrix);
    shaderData.setMatrix(Renderer._mvInvMatrixProperty, mvInvMatrix);
    shaderData.setMatrix(Renderer._normalMatrixProperty, normalMatrix);
  }

  protected _registerEntityTransformListener(): void {
    this.entity.transform._updateFlagManager.addListener(this._onTransformChanged);
  }

  protected _updateBounds(worldBounds: BoundingBox): void {}

  protected _render(context: RenderContext): void {
    throw "not implement";
  }

  private _createInstanceMaterial(material: Material, index: number): Material {
    const insMaterial: Material = material.clone();
    insMaterial.name = insMaterial.name + "(Instance)";
    material._addRefCount(-1);
    insMaterial._addRefCount(1);
    this._materialsInstanced[index] = true;
    this._materials[index] = insMaterial;
    return insMaterial;
  }

  private _setMaterial(index: number, material: Material): void {
    const materials = this._materials;
    if (index >= materials.length) {
      materials.length = index + 1;
    }

    const internalMaterial = materials[index];
    if (internalMaterial !== material) {
      const materialsInstance = this._materialsInstanced;
      index < materialsInstance.length && (materialsInstance[index] = false);

      internalMaterial && internalMaterial._addRefCount(-1);
      material && material._addRefCount(1);
      materials[index] = material;
    }
  }

  @ignoreClone
  protected _onTransformChanged(type: TransformModifyFlags): void {
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }
}

/**
 * @internal
 */
export enum RendererUpdateFlags {
  /** Include world position and world bounds. */
  WorldVolume = 0x1
}
