// @ts-ignore
import { BoundingBox, Matrix, Vector3, Vector4 } from "@galacean/engine-math";
import { Component } from "./Component";
import { DependentMode, dependentComponents } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { Transform, TransformModifyFlags } from "./Transform";
import { assignmentClone, deepClone, ignoreClone } from "./clone/CloneManager";
import { IComponentCustomClone } from "./clone/ComponentCloner";
import { Material } from "./material";
import { ShaderMacro, ShaderProperty } from "./shader";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { RenderElement } from "./RenderPipeline/RenderElement";

/**
 * Basis for all renderers.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Renderer extends Component implements IComponentCustomClone {
  private static _tempVector0 = new Vector3();

  private static _receiveShadowMacro = ShaderMacro.getByName("RENDERER_IS_RECEIVE_SHADOWS");
  private static _localMatrixProperty = ShaderProperty.getByName("renderer_LocalMat");
  private static _worldMatrixProperty = ShaderProperty.getByName("renderer_ModelMat");
  private static _mvMatrixProperty = ShaderProperty.getByName("renderer_MVMat");
  private static _mvpMatrixProperty = ShaderProperty.getByName("renderer_MVPMat");
  private static _mvInvMatrixProperty = ShaderProperty.getByName("renderer_MVInvMat");
  private static _normalMatrixProperty = ShaderProperty.getByName("renderer_NormalMat");
  private static _rendererLayerProperty = ShaderProperty.getByName("renderer_Layer");

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
  @ignoreClone
  _bounds: BoundingBox = new BoundingBox();
  @ignoreClone
  _renderFrameCount: number;

  @ignoreClone
  protected _overrideUpdate: boolean = false;
  @ignoreClone
  protected _materials: Material[] = [];
  @ignoreClone
  protected _dirtyUpdateFlag: number = 0;

  @deepClone
  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Renderer);
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
  @assignmentClone
  private _priority: number = 0;
  @assignmentClone
  private _receiveShadows: boolean = true;

  @ignoreClone
  protected _rendererLayer: Vector4 = new Vector4();

  /**
   * ShaderData related to renderer.
   */
  get shaderData(): ShaderData {
    return this._shaderData;
  }

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
    const shaderData = this.shaderData;
    this._overrideUpdate = this.update !== prototype.update;

    this._addResourceReferCount(this.shaderData, 1);

    this._onTransformChanged = this._onTransformChanged.bind(this);
    this._registerEntityTransformListener();

    shaderData.enableMacro(Renderer._receiveShadowMacro);
    shaderData.setVector4(Renderer._rendererLayerProperty, this._rendererLayer);
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
      internalMaterial && this._addResourceReferCount(internalMaterial, -1);
    }

    internalMaterials.length !== count && (internalMaterials.length = count);
    materialsInstanced.length !== 0 && (materialsInstanced.length = 0);

    for (let i = 0; i < count; i++) {
      const internalMaterial = internalMaterials[i];
      const material = materials[i];
      if (internalMaterial !== material) {
        internalMaterials[i] = material;
        internalMaterial && this._addResourceReferCount(internalMaterial, -1);
        material && this._addResourceReferCount(material, 1);
      }
    }
  }

  update(deltaTime: number): void {}

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene._componentsManager;
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

    this._updateShaderData(context, false);
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
  _cloneTo(target: Renderer, srcRoot: Entity, targetRoot: Entity): void {
    const materials = this._materials;
    for (let i = 0, n = materials.length; i < n; i++) {
      target._setMaterial(i, materials[i]);
    }
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();

    this._unRegisterEntityTransformListener();
    this._addResourceReferCount(this.shaderData, -1);

    const materials = this._materials;
    for (let i = 0, n = materials.length; i < n; i++) {
      const material = materials[i];
      material && this._addResourceReferCount(material, -1);
    }

    this._entity = null;
    this._globalShaderMacro = null;
    this._bounds = null;
    this._materials = null;
    this._shaderData = null;
    this._mvMatrix = null;
    this._mvpMatrix = null;
    this._mvInvMatrix = null;
    this._normalMatrix = null;
    this._materialsInstanced = null;
    this._rendererLayer = null;
  }

  /**
   * @internal
   */
  _updateShaderData(context: RenderContext, onlyMVP: boolean): void {
    const entity = this.entity;
    const worldMatrix = entity.transform.worldMatrix;
    if (onlyMVP) {
      this._updateMVPShaderData(context, worldMatrix);
      return;
    }
    this._updateTransformShaderData(context, worldMatrix);

    const layer = entity.layer;
    this._rendererLayer.set(layer & 65535, (layer >>> 16) & 65535, 0, 0);
  }

  protected _updateTransformShaderData(context: RenderContext, worldMatrix: Matrix): void {
    const shaderData = this.shaderData;
    const mvMatrix = this._mvMatrix;
    const mvInvMatrix = this._mvInvMatrix;
    const normalMatrix = this._normalMatrix;

    Matrix.multiply(context.viewMatrix, worldMatrix, mvMatrix);
    Matrix.invert(mvMatrix, mvInvMatrix);
    Matrix.invert(worldMatrix, normalMatrix);
    normalMatrix.transpose();

    shaderData.setMatrix(Renderer._localMatrixProperty, this.entity.transform.localMatrix);
    shaderData.setMatrix(Renderer._worldMatrixProperty, worldMatrix);
    shaderData.setMatrix(Renderer._mvMatrixProperty, mvMatrix);
    shaderData.setMatrix(Renderer._mvInvMatrixProperty, mvInvMatrix);
    shaderData.setMatrix(Renderer._normalMatrixProperty, normalMatrix);
    this._updateMVPShaderData(context, worldMatrix);
  }

  protected _updateMVPShaderData(context: RenderContext, worldMatrix: Matrix): void {
    const mvpMatrix = this._mvpMatrix;

    Matrix.multiply(context.viewProjectionMatrix, worldMatrix, mvpMatrix);
    this.shaderData.setMatrix(Renderer._mvpMatrixProperty, mvpMatrix);
  }

  /**
   * @internal
   */
  protected _registerEntityTransformListener(): void {
    this.entity.transform._updateFlagManager.addListener(this._onTransformChanged);
  }

  /**
   * @internal
   */
  protected _unRegisterEntityTransformListener(): void {
    this.entity.transform._updateFlagManager.removeListener(this._onTransformChanged);
  }

  /**
   * @internal
   */
  protected _updateBounds(worldBounds: BoundingBox): void {}

  /**
   * @internal
   */
  protected _render(context: RenderContext): void {
    throw "not implement";
  }

  /**
   * @internal
   */
  protected _canBatch(elementA: RenderElement, elementB: RenderElement): boolean {
    return false;
  }

  /**
   * @internal
   */
  protected _batchRenderElement(elementA: RenderElement, elementB?: RenderElement): void {}

  /**
   * @internal
   */
  private _createInstanceMaterial(material: Material, index: number): Material {
    const insMaterial: Material = material.clone();
    insMaterial.name = insMaterial.name + "(Instance)";
    this._addResourceReferCount(material, -1);
    this._addResourceReferCount(insMaterial, 1);
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

      internalMaterial && this._addResourceReferCount(internalMaterial, -1);
      material && this._addResourceReferCount(material, 1);
      materials[index] = material;
    }
  }

  /**
   * @internal
   */
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
