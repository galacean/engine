// @ts-ignore
import { BoundingBox, type BoundingFrustum, Matrix, Vector4 } from "@galacean/engine-math";
import { SpriteMaskInteraction } from "./2d/enums/SpriteMaskInteraction";
import { Component } from "./Component";
import { DependentMode, dependentComponents } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import {
  MatrixSnapshot,
  createCalculatedMatrix,
  restoreCalculatedMatrix,
  saveCalculatedMatrix
} from "./RenderPipeline/MatrixSnapshot";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { RenderElement } from "./RenderPipeline/RenderElement";
import { Transform, TransformModifyFlags } from "./Transform";
import { ignoreClone } from "./clone/CloneDecorators";
import type { ICloneHook } from "./clone/ICloneHook";
import { SpriteMaskLayer } from "./enums/SpriteMaskLayer";
import { Material } from "./material";
import { ShaderMacro } from "./shader/ShaderMacro";
import { ShaderProperty } from "./shader/ShaderProperty";
import { ShaderData } from "./shader/ShaderData";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";

/**
 * Basis for all renderers.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Renderer extends Component implements ICloneHook<Renderer> {
  /** @internal */
  static _worldMatrixProperty = ShaderProperty.getByName("renderer_ModelMat");
  /** @internal */
  static _rendererLayerProperty = ShaderProperty.getByName("renderer_Layer");

  private static _receiveShadowMacro = ShaderMacro.getByName("RENDERER_IS_RECEIVE_SHADOWS");
  private static _mvMatrixProperty = ShaderProperty.getByName("renderer_MVMat");
  private static _mvpMatrixProperty = ShaderProperty.getByName("renderer_MVPMat");
  private static _normalMatrixProperty = ShaderProperty.getByName("renderer_NormalMat");

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
  _renderFrameCount: number;
  /** @internal */
  _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  /** @internal */
  _maskLayer: SpriteMaskLayer = SpriteMaskLayer.Layer0;

  @ignoreClone
  protected _overrideUpdate: boolean = false;
  @ignoreClone
  protected _materials: (Material | null)[] = [];
  @ignoreClone
  protected _dirtyUpdateFlag: number = 0;
  @ignoreClone
  protected _rendererLayer: Vector4 = new Vector4();
  @ignoreClone
  protected _bounds: BoundingBox = new BoundingBox();
  @ignoreClone
  protected _transformEntity: Entity | null;

  @ignoreClone
  private _visibility?: {
    frustum: number;
    bounds: Float64Array;
    visible: boolean;
  };
  @ignoreClone
  private _transformCache?: {
    world: MatrixSnapshot;
    normalDirty: boolean;
    viewRevision: number;
    viewProjectionRevision: number;
  };

  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Renderer);
  @ignoreClone
  private _mvMatrix = createCalculatedMatrix();
  @ignoreClone
  private _mvpMatrix = createCalculatedMatrix();
  @ignoreClone
  private _normalMatrix = createCalculatedMatrix();
  @ignoreClone
  private _materialsInstanced: boolean[] = [];
  private _priority: number = 0;
  private _receiveShadows: boolean = true;

  /**
   * ShaderData related to renderer.
   */
  get shaderData(): ShaderData {
    return this._shaderData;
  }

  /**
   * Whether this renderer was culled by all cameras in the previous frame.
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
   * The world bounding volume of the renderer.
   */
  get bounds(): BoundingBox {
    if (this._dirtyUpdateFlag & RendererUpdateFlags.WorldVolume) {
      this._updateBounds(this._bounds);
      this._dirtyUpdateFlag &= ~RendererUpdateFlags.WorldVolume;
    }
    return this._bounds;
  }

  /** @internal Cache the plane tests while both the camera and this world-space bounding box stay unchanged. */
  _intersectsFrustum(frustum: BoundingFrustum, revision: number): boolean {
    const bounds = this.bounds;
    const { min, max } = bounds;
    const cache = (this._visibility ??= { frustum: -1, bounds: new Float64Array(6), visible: false });
    const box = cache.bounds;
    if (
      cache.frustum === revision &&
      min.x === box[0] &&
      min.y === box[1] &&
      min.z === box[2] &&
      max.x === box[3] &&
      max.y === box[4] &&
      max.z === box[5]
    )
      return cache.visible;
    box[0] = min.x;
    box[1] = min.y;
    box[2] = min.z;
    box[3] = max.x;
    box[4] = max.y;
    box[5] = max.z;
    cache.frustum = revision;
    return (cache.visible = frustum.intersectsBox(bounds));
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
    this._setTransformEntity(entity);

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
  setMaterial(material: Material | null): void;

  /**
   * Set material by index.
   * @param index - Material index
   * @param material - The material
   */
  setMaterial(index: number, material: Material | null): void;

  setMaterial(indexOrMaterial: number | Material | null, material: Material | null = null): void {
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
  getInstanceMaterials(): Readonly<(Material | null)[]> {
    const materials = this._materials;
    const materialsInstance = this._materialsInstanced;
    for (let i = 0, n = materials.length; i < n; i++) {
      const material = materials[i];
      if (material && !materialsInstance[i]) {
        this._createInstanceMaterial(material, i);
      }
    }
    return materials;
  }

  /**
   * Get all materials.
   * @returns All materials
   */
  getMaterials(): Readonly<(Material | null)[]> {
    return this._materials;
  }

  /**
   * Set all materials.
   * @param materials - All materials
   */
  setMaterials(materials: (Material | null)[]): void {
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
    // Treat a newly enabled renderer as visible until the first culling result.
    const engine = this.engine;
    const frameCount = engine.time.frameCount;
    this._renderFrameCount = engine._frameInProcess ? frameCount - 1 : frameCount;
    const componentsManager = this.scene!._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    componentsManager.addRenderer(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene!._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    componentsManager.removeRenderer(this);
  }

  /**
   * @internal
   */
  _prepareRender(context: RenderContext): void {
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
    }

    this._distanceForSort = NaN;
    this._render(context);
  }

  /**
   * @internal
   */
  _updateDistanceForSort(context: RenderContext): number {
    let distance = this._distanceForSort;
    if (distance !== distance) {
      const virtualCamera = context.virtualCamera;
      const cameraPosition = virtualCamera.position;
      const { min, max } = this.bounds;
      const dx = (min.x + max.x) * 0.5 - cameraPosition.x;
      const dy = (min.y + max.y) * 0.5 - cameraPosition.y;
      const dz = (min.z + max.z) * 0.5 - cameraPosition.z;
      if (virtualCamera.isOrthographic) {
        const forward = virtualCamera.forward;
        distance = dx * forward.x + dy * forward.y + dz * forward.z;
      } else {
        distance = dx * dx + dy * dy + dz * dz;
      }
      this._distanceForSort = distance;
    }
    return distance;
  }

  /**
   * @internal
   * @inheritdoc
   */
  _onClone(target: Renderer): void {
    const materials = this._materials;
    for (let i = 0, n = materials.length; i < n; i++) {
      target._setMaterial(i, materials[i]);
    }
  }

  /**
   * @internal
   */
  _isFrontFaceInvert(): boolean {
    return this._transformEntity!.transform._isFrontFaceInvert();
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();

    this._setTransformEntity(null);
    this._addResourceReferCount(this.shaderData, -1);

    const materials = this._materials;
    for (let i = 0, n = materials.length; i < n; i++) {
      const material = materials[i];
      material && this._addResourceReferCount(material, -1);
    }

    this._bounds = null!;
    this._materials = null!;
    this._shaderData = null!;
    this._mvMatrix = null!;
    this._mvpMatrix = null!;
    this._normalMatrix = null!;
    this._materialsInstanced = null!;
    this._rendererLayer = null!;
  }

  /**
   * @internal
   */
  _updateTransformShaderData(context: RenderContext, onlyMVP: boolean): void {
    const worldMatrix = this._transformEntity!.transform.worldMatrix;
    const { shaderData } = this;
    const cache = (this._transformCache ??= {
      world: new MatrixSnapshot(),
      normalDirty: true,
      viewRevision: -1,
      viewProjectionRevision: -1
    });
    if (cache.world.update(worldMatrix)) {
      cache.normalDirty = true;
      cache.viewRevision = cache.viewProjectionRevision = -1;
    }

    // ShaderData exposes the result matrices to callers. Restore the calculated values even when their inputs are stable.
    const values = shaderData._propertyValueMap;
    if (!onlyMVP) {
      const normal = this._normalMatrix;
      if (cache.normalDirty) {
        Matrix.invert(worldMatrix, normal);
        normal.transpose();
        saveCalculatedMatrix(normal);
        cache.normalDirty = false;
      } else {
        restoreCalculatedMatrix(normal);
      }
      const mv = this._mvMatrix;
      if (cache.viewRevision !== context.viewRevision) {
        Matrix.multiply(context.viewMatrix, worldMatrix, mv);
        saveCalculatedMatrix(mv);
        cache.viewRevision = context.viewRevision;
      } else {
        restoreCalculatedMatrix(mv);
      }
      if (values[Renderer._worldMatrixProperty._uniqueId] !== worldMatrix)
        shaderData.setMatrix(Renderer._worldMatrixProperty, worldMatrix);
      if (values[Renderer._mvMatrixProperty._uniqueId] !== mv) shaderData.setMatrix(Renderer._mvMatrixProperty, mv);
      if (values[Renderer._normalMatrixProperty._uniqueId] !== normal)
        shaderData.setMatrix(Renderer._normalMatrixProperty, normal);
    }
    const mvp = this._mvpMatrix;
    if (cache.viewProjectionRevision !== context.viewProjectionRevision) {
      Matrix.multiply(context.viewProjectionMatrix, worldMatrix, mvp);
      saveCalculatedMatrix(mvp);
      cache.viewProjectionRevision = context.viewProjectionRevision;
    } else {
      restoreCalculatedMatrix(mvp);
    }
    if (values[Renderer._mvpMatrixProperty._uniqueId] !== mvp) shaderData.setMatrix(Renderer._mvpMatrixProperty, mvp);
  }

  /**
   * @internal
   */
  _canBatch(preElement: RenderElement, curElement: RenderElement): boolean {
    return false;
  }

  /**
   * @internal
   */
  _batch(preElement: RenderElement | null, curElement: RenderElement): void {}

  /**
   * Update once per frame per renderer.
   */
  protected _update(context: RenderContext): void {
    const { layer } = this.entity;
    this._rendererLayer.set(layer & 65535, (layer >>> 16) & 65535, 0, 0);
    this.scene!.environmentLighting._updateRendererProbeData(this.shaderData, this.entity.transform.worldPosition);
  }

  /**
   * Update transform shader data for world-space vertices (2D renderers).
   * Vertices are already in world space, so model matrix is identity.
   */
  protected _updateWorldSpaceTransformShaderData(context: RenderContext, onlyMVP: boolean): void {
    const { shaderData } = this;
    if (onlyMVP) {
      shaderData.setMatrix(Renderer._mvpMatrixProperty, context.viewProjectionMatrix);
    } else {
      // @ts-ignore
      const identityMatrix = Matrix._identity;
      shaderData.setMatrix(Renderer._worldMatrixProperty, identityMatrix);
      shaderData.setMatrix(Renderer._mvMatrixProperty, context.viewMatrix);
      shaderData.setMatrix(Renderer._normalMatrixProperty, identityMatrix);
      shaderData.setMatrix(Renderer._mvpMatrixProperty, context.viewProjectionMatrix);
    }
  }

  /**
   * @internal
   */
  protected _setTransformEntity(entity: Entity | null): void {
    const preEntity = this._transformEntity;
    if (entity !== preEntity) {
      preEntity?._updateFlagManager.removeListener(this._onTransformChanged);
      entity?._updateFlagManager.addListener(this._onTransformChanged);
      this._transformEntity = entity;
    }
  }

  protected _updateBounds(worldBounds: BoundingBox): void {}

  protected _render(context: RenderContext): void {
    throw "not implement";
  }

  private _createInstanceMaterial(material: Material, index: number): Material {
    const insMaterial: Material = material.clone();
    insMaterial.name = material.name + "(Instance)";
    this._addResourceReferCount(material, -1);
    this._addResourceReferCount(insMaterial, 1);
    this._materialsInstanced[index] = true;
    this._materials[index] = insMaterial;
    return insMaterial;
  }

  private _setMaterial(index: number, material: Material | null): void {
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

  @ignoreClone
  protected _onTransformChanged(type: TransformModifyFlags): void {
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }
}

export enum RendererUpdateFlags {
  /** Include world position and world bounds. */
  WorldVolume = 0x1
}
