import type { ISpineAnimationState, ISpineSkeleton } from "@galacean/engine-design";
import { SpineSkeleton } from "../SpineSkeleton";
import { SpineSlot } from "../SpineSlot";
import { SpineAnimationState } from "../SpineAnimationState";
import { SpinePhysics } from "../SpinePhysics";
import type { SpinePhysicsSupport } from "../SpinePhysics";
import type { SpineSkeletonData } from "../SpineSkeletonData";
import type { SpineAnimationStateData } from "../SpineAnimationStateData";
import type { ISpineRuntime } from "../runtime/ISpineRuntime";
import {
  assignmentClone,
  BlendFactor,
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  deepClone,
  Entity,
  Engine,
  ignoreClone,
  IndexBufferBinding,
  IndexFormat,
  Material,
  Primitive,
  Renderer,
  RendererUpdateFlags,
  ShaderData,
  ShaderDataGroup,
  ShaderProperty,
  Signal,
  SubPrimitive,
  Vector3,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { SpineResource } from "../loader/SpineResource";
import { SpineMaterial } from "./SpineMaterial";
import { SpineBlendMode } from "../enums/SpineBlendMode";
import { SpineGeometry } from "./SpineGeometry";

/**
 * Spine animation renderer, capable of rendering spine animations and providing functions for animation and skeleton manipulation.
 */
export class SpineAnimationRenderer extends Renderer {
  private static _defaultMaterials = new WeakMap<Engine, SpineMaterial>();
  private static _textureProperty = ShaderProperty.getByName("renderElement_SpineTexture");
  private static _sourceColorProperty = ShaderProperty.getByName("renderElement_SpineSourceColorBlendFactor");
  private static _destinationColorProperty = ShaderProperty.getByName("renderElement_SpineDestinationColorBlendFactor");
  private static _sourceAlphaProperty = ShaderProperty.getByName("renderElement_SpineSourceAlphaBlendFactor");
  private static _destinationAlphaProperty = ShaderProperty.getByName("renderElement_SpineDestinationAlphaBlendFactor");
  private static _positionVertexElement = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
  private static _lightColorVertexElement = new VertexElement("LIGHT_COLOR", 12, VertexElementFormat.Vector4, 0);
  private static _uvVertexElement = new VertexElement("TEXCOORD_0", 28, VertexElementFormat.Vector2, 0);
  private static _darkColorVertexElement = new VertexElement("DARK_COLOR", 36, VertexElementFormat.Vector3, 0);

  /** Called after time advances, before animations are applied. Use to prepare the base pose. */
  readonly onBeforeApply = new Signal<[SpineAnimationRenderer]>();

  /** Called after animations are applied, before world transforms are solved. Use to edit local bone values. */
  readonly onUpdateLocal = new Signal<[SpineAnimationRenderer]>();

  /**
   * Called with evaluated world transforms, before the final constraint and physics solve.
   * Use to edit local bone values based on world values. A listener enables an additional pose solve;
   * physics simulation still advances only once per update.
   */
  readonly onUpdateWorld = new Signal<[SpineAnimationRenderer]>();

  /** Called after the final bone transforms are solved, before geometry is built. Use to read the final pose. */
  readonly onUpdateComplete = new Signal<[SpineAnimationRenderer]>();

  /**
   * Time multiplier for both animation playback and skeleton physics. Defaults to 1.
   * Zero stops time advancement while still applying the pose and rendering.
   * AnimationState and TrackEntry time scales multiply animation time independently.
   */
  @assignmentClone
  timeScale = 1;

  /**
   * The spacing between z layers in world units.
   */
  @assignmentClone
  zSpacing = 0.001;

  @assignmentClone
  private _tintBlack = false;

  /**
   * Whether to enable tint black feature for dark color tinting.
   *
   * @remarks Should be enabled when using "Tint Black" feature in Spine editor.
   */
  get tintBlack(): boolean {
    return this._tintBlack;
  }

  set tintBlack(value: boolean) {
    if (this._tintBlack !== value) {
      this._tintBlack = value;
      this._needResizeBuffer = true;
      if (value) {
        this.shaderData.enableMacro("RENDERER_TINT_BLACK");
      } else {
        this.shaderData.disableMacro("RENDERER_TINT_BLACK");
      }
    }
  }

  /**
   * Default state for spine animation.
   * Contains the default animation name to be played, whether this animation should loop, the default skin name.
   */
  @deepClone
  readonly defaultConfig: SpineAnimationDefaultConfig = new SpineAnimationDefaultConfig();

  /** @internal */
  @ignoreClone
  _primitive: Primitive;
  /** @internal */
  @ignoreClone
  _subPrimitives: SubPrimitive[] = [];
  /** @internal */
  @ignoreClone
  _indexBuffer: Buffer;
  /** @internal */
  @ignoreClone
  _vertexBuffer: Buffer;
  /** @internal */
  @ignoreClone
  _needResizeBuffer = false;
  /** @internal */
  @ignoreClone
  _resource: SpineResource | null = null;
  /** @internal */
  @ignoreClone
  _localBounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );

  @ignoreClone
  private _slotMaterials = new Map<number, Material>();
  @ignoreClone
  private _slotMaterialsDirty = false;
  @ignoreClone
  private _geometry = new SpineGeometry(this._slotMaterials);
  @ignoreClone
  private _batchShaderData: ShaderData[] = [];
  @ignoreClone
  private _skeleton: ISpineSkeleton;
  @ignoreClone
  private _state: ISpineAnimationState;
  @ignoreClone
  private _runtime: ISpineRuntime;
  @ignoreClone
  private _physics: SpinePhysicsSupport | null = null;
  @ignoreClone
  private _publicSkeleton: SpineSkeleton | null = null;
  @ignoreClone
  private _publicState: SpineAnimationState | null = null;

  /** Physics support for the bound skeleton, or null before an asset is assigned. */
  get physics(): SpinePhysicsSupport | null {
    return this._physics;
  }

  /** @internal */
  _setRuntime(runtime: ISpineRuntime): void {
    this._runtime = runtime;
  }

  /**
   * The animation playback state of this renderer.
   * Manage, blend, and transition between multiple simultaneous animations effectively.
   */
  get state(): SpineAnimationState {
    if (!this._publicState) throw new Error("No Spine resource is bound to this renderer.");
    return this._publicState;
  }

  /**
   * The skeleton pose of this renderer.
   * Manipulate bone positions, rotations, scaling
   * and change spine attachment to customize character appearances dynamically during runtime.
   */
  get skeleton(): SpineSkeleton {
    if (!this._publicSkeleton) throw new Error("No Spine resource is bound to this renderer.");
    return this._publicSkeleton;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    const defaults = SpineAnimationRenderer._defaultMaterials;
    let material = defaults.get(this.engine);
    if (!material || material.destroyed || material.pendingDestroy) {
      material = new SpineMaterial(this.engine);
      defaults.set(this.engine, material);
    }
    this.setMaterial(material);
    const primitive = new Primitive(this.engine);
    this._primitive = primitive;
    this._primitive._addReferCount(1);
    primitive.addVertexElement(SpineAnimationRenderer._positionVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._lightColorVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._uvVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._darkColorVertexElement);
  }

  /** Set the default material used by slots without an override. */
  override setMaterial(material: Material | null): void;
  /** Set a renderer material by index. Spine uses index 0 as its default material. */
  override setMaterial(index: number, material: Material | null): void;
  /** Override a slot's material, or pass null to restore the renderer's default material. */
  override setMaterial(slot: SpineSlot, material: Material | null): void;
  override setMaterial(
    indexOrSlotOrMaterial: number | SpineSlot | Material | null,
    material: Material | null = null
  ): void {
    if (indexOrSlotOrMaterial instanceof SpineSlot) {
      const index = this._getSlotIndex(indexOrSlotOrMaterial);
      const previous = this._slotMaterials.get(index);
      if (previous === material || (!previous && !material)) return;
      if (previous) this._addResourceReferCount(previous, -1);
      if (material) {
        this._slotMaterials.set(index, material);
        this._addResourceReferCount(material, 1);
      } else {
        this._slotMaterials.delete(index);
      }
      this._slotMaterialsDirty = true;
    } else if (typeof indexOrSlotOrMaterial === "number") {
      super.setMaterial(indexOrSlotOrMaterial, material);
    } else {
      super.setMaterial(indexOrSlotOrMaterial);
    }
  }

  override getMaterial(): Material | null;
  override getMaterial(index: number): Material | null;
  /** Get a slot's effective material, including the renderer's default when no override is set. */
  override getMaterial(slot: SpineSlot): Material | null;
  override getMaterial(indexOrSlot: number | SpineSlot = 0): Material | null {
    return indexOrSlot instanceof SpineSlot
      ? (this._slotMaterials.get(this._getSlotIndex(indexOrSlot)) ?? super.getMaterial())
      : super.getMaterial(indexOrSlot);
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    this._applyDefaultConfig();
  }

  /**
   * @internal
   */
  override update(delta: number): void {
    const { _publicState: state, _skeleton: skeleton, _runtime: runtime } = this;
    if (!state || !skeleton) return;
    state._advance(skeleton, delta * this.timeScale);
    if (!this._isCurrentState(state)) return;
    this.onBeforeApply.invoke(this);
    if (!this._isCurrentState(state)) return;
    state._apply(skeleton);
    if (!this._isCurrentState(state)) return;
    this.onUpdateLocal.invoke(this);
    if (!this._isCurrentState(state)) return;
    if (this.onUpdateWorld.listenerCount > 0) {
      runtime.updateWorldTransform(skeleton, false);
      this.onUpdateWorld.invoke(this);
      if (!this._isCurrentState(state)) return;
    }
    runtime.updateWorldTransform(skeleton, true);
    this.onUpdateComplete.invoke(this);
    if (!this._isCurrentState(state)) return;
    this._buildGeometry();
  }

  private _isCurrentState(state: SpineAnimationState): boolean {
    // A playback or pose callback may end this binding by switching resources or destroying the renderer.
    return !this.destroyed && this._publicState === state;
  }

  /**
   * @internal
   */
  override _render(context: any): void {
    const { _primitive, _subPrimitives, _batchShaderData } = this;
    // Material selection may change after animation update, including through inherited material APIs.
    if (this._skeleton && (this._slotMaterialsDirty || this._geometry.defaultMaterial !== this.getMaterial())) {
      this._buildGeometry();
    }
    const engine = this.engine;
    const priority = this.priority;
    const distanceForSort = this._distanceForSort;
    const renderElementPool = engine._renderElementPool;
    const renderPipeline = context.camera._renderPipeline;
    for (let i = 0, n = _subPrimitives.length; i < n; i++) {
      let material = this._geometry.batches[i].material;
      if (!material) continue;
      if (material.destroyed || material.shader.destroyed) {
        material = engine._basicResources.meshMagentaMaterial;
      }
      const renderElement = renderElementPool.get();
      renderElement.set(this, material, _primitive, _subPrimitives[i], undefined, undefined, _batchShaderData[i]);
      renderElement.priority = priority;
      renderElement.distanceForSort = distanceForSort;
      renderElement.subDistancePriority = i;
      renderPipeline.pushRenderElement(context, renderElement);
    }
  }

  /**
   * @internal
   */
  override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this._localBounds, this.entity.transform.worldMatrix, worldBounds);
  }

  /**
   * @internal
   */
  _setSkeleton(skeleton: ISpineSkeleton, data: SpineSkeletonData) {
    this._skeleton = skeleton;
    this._publicSkeleton = SpineSkeleton._create(skeleton, data);
    this._physics = SpinePhysics._create(this._runtime.getPhysics(skeleton));
  }

  /**
   * @internal
   */
  _setState(state: ISpineAnimationState, data: SpineAnimationStateData) {
    this._state = state;
    this._publicState = SpineAnimationState._create(state, data, this._runtime);
  }

  /**
   * @internal
   */
  override _onClone(target: SpineAnimationRenderer): void {
    target.setMaterials(this._materials);
    // Each instance binds fresh playback and pose objects to the shared resource data.
    target.resource = this._resource;
    for (const [index, material] of this._slotMaterials) {
      target.setMaterial(target.skeleton.slots[index], material);
    }
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    this.onBeforeApply.removeAll();
    this.onUpdateLocal.removeAll();
    this.onUpdateWorld.removeAll();
    this.onUpdateComplete.removeAll();
    this._publicState?._dispose();
    this._clearSlotMaterials();
    this._geometry = null;
    this._clearBatchTextures(0);
    this._batchShaderData.length = 0;
    this._subPrimitives.length = 0;
    const primitive = this._primitive;
    if (primitive) {
      primitive._addReferCount(-1);
      primitive.destroy();
      this._primitive = null;
    }
    // destroy() is refCount-guarded; the primitive released its buffer references above.
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._vertexBuffer = null;
    this._indexBuffer = null;
    if (this._resource) this._addResourceReferCount(this._resource, -1);
    this._resource = null;
    this._runtime = null;
    this._physics = null;
    this._skeleton = null;
    this._state = null;
    this._publicSkeleton = null;
    this._publicState = null;
    super._onDestroy();
  }

  private _uploadGeometry(): void {
    const geometry = this._geometry;
    const { vertices, indices, batches, batchCount, vertexCount, indexCount, bounds, vertexStride } = geometry;
    const subPrimitives = this._subPrimitives;
    for (let i = 0; i < batchCount; i++) {
      const batch = batches[i];
      const primitive = subPrimitives[i] ?? (subPrimitives[i] = new SubPrimitive());
      primitive.start = batch.start;
      primitive.count = batch.count;
      const data =
        this._batchShaderData[i] ?? (this._batchShaderData[i] = new ShaderData(ShaderDataGroup.RenderElement));
      data.setTexture(SpineAnimationRenderer._textureProperty, batch.texture);
      this._setBatchBlend(data, batch.blendMode);
    }
    this._clearBatchTextures(batchCount);
    subPrimitives.length = batchCount;
    if (!vertexCount) {
      this._localBounds.min.set(0, 0, 0);
      this._localBounds.max.set(0, 0, 0);
      return;
    }
    this._localBounds.copyFrom(bounds);
    if (
      this._needResizeBuffer ||
      this._vertexBuffer?.byteLength !== vertices.byteLength ||
      this._indexBuffer?.byteLength !== indices.byteLength
    ) {
      const oldVertexBuffer = this._vertexBuffer;
      const oldIndexBuffer = this._indexBuffer;
      this._vertexBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Dynamic);
      this._indexBuffer = new Buffer(this.engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Dynamic);
      this._primitive.setVertexBufferBinding(0, new VertexBufferBinding(this._vertexBuffer, vertexStride * 4));
      this._primitive.setIndexBufferBinding(new IndexBufferBinding(this._indexBuffer, IndexFormat.UInt16));
      oldVertexBuffer?.destroy();
      oldIndexBuffer?.destroy();
      this._needResizeBuffer = false;
    } else {
      this._vertexBuffer.setData(vertices, 0, 0, vertexCount * vertexStride);
      this._indexBuffer.setData(indices, 0, 0, indexCount);
    }
  }

  private _getSlotIndex(slot: SpineSlot): number {
    const index = this._publicSkeleton?.slots.indexOf(slot) ?? -1;
    if (index < 0) throw new Error("The Spine slot does not belong to this renderer's current skeleton.");
    return index;
  }

  private _clearSlotMaterials(): void {
    for (const material of this._slotMaterials.values()) this._addResourceReferCount(material, -1);
    this._slotMaterials.clear();
    this._slotMaterialsDirty = false;
  }

  private _buildGeometry(): void {
    const geometry = this._geometry;
    geometry.reset(this.zSpacing, this.tintBlack, this.getMaterial());
    this._runtime.buildGeometry(this._skeleton, geometry);
    this._uploadGeometry();
    this._slotMaterialsDirty = false;
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  private _clearBatchTextures(start: number): void {
    for (let i = start; i < this._batchShaderData.length; i++) {
      this._batchShaderData[i].setTexture(SpineAnimationRenderer._textureProperty, null);
    }
  }

  private _setBatchBlend(data: ShaderData, blendMode: SpineBlendMode): void {
    const { One, OneMinusSourceAlpha, DestinationColor, OneMinusSourceColor } = BlendFactor;
    let sourceColor = One;
    let destinationColor = OneMinusSourceAlpha;
    let destinationAlpha = OneMinusSourceAlpha;
    switch (blendMode) {
      case SpineBlendMode.Additive:
        destinationColor = destinationAlpha = One;
        break;
      case SpineBlendMode.Multiply:
        sourceColor = DestinationColor;
        break;
      case SpineBlendMode.Screen:
        sourceColor = One;
        destinationColor = OneMinusSourceColor;
        break;
    }
    data.setInt(SpineAnimationRenderer._sourceColorProperty, sourceColor);
    data.setInt(SpineAnimationRenderer._destinationColorProperty, destinationColor);
    data.setInt(SpineAnimationRenderer._sourceAlphaProperty, One);
    data.setInt(SpineAnimationRenderer._destinationAlphaProperty, destinationAlpha);
  }

  private _applyDefaultConfig(): void {
    const { _publicSkeleton: skeleton, _publicState: state } = this;
    if (skeleton && state) {
      const { animationName, skinName, loop } = this.defaultConfig;
      if (skinName !== "default") {
        skeleton.setSkinByName(skinName);
        skeleton.setToSetupPose();
      }
      if (animationName) {
        state.setAnimation(0, animationName, loop);
      }
    }
  }

  /**
   * Spine resource of this renderer, or null when unbound.
   */
  get resource(): SpineResource | null {
    return this._resource;
  }

  /**
   * Bind a Spine resource, or assign null to clear its pose and playback.
   *
   * @param value - The resource to use, or null to unbind
   */
  set resource(value: SpineResource | null) {
    if (this._resource === value) return;
    this._publicState?._dispose();
    this._clearSlotMaterials();
    if (this._resource) this._addResourceReferCount(this._resource, -1);
    this._resource = value;
    this._state = null;
    this._skeleton = null;
    this._runtime = null;
    this._physics = null;
    this._publicSkeleton = null;
    this._publicState = null;
    this._subPrimitives.length = 0;
    this._geometry.reset(this.zSpacing, this.tintBlack, this.getMaterial());
    this._clearBatchTextures(0);
    this._localBounds.min.set(0, 0, 0);
    this._localBounds.max.set(0, 0, 0);
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    if (!value) return;
    this._addResourceReferCount(value, 1);
    const { skeletonData, stateData, _runtime: runtime } = value;
    this._setRuntime(runtime);
    this._setSkeleton(runtime.createSkeleton(skeletonData._native), skeletonData);
    this._setState(runtime.createAnimationState(stateData._native), stateData);
    this._applyDefaultConfig();
  }
}

/**
 * Default state for spine animation.
 * Contains the default animation name to be played, whether this animation should loop,
 * the default skin name, and the default scale of the skeleton.
 */
export class SpineAnimationDefaultConfig {
  /**
   * Creates an instance of default config
   */
  constructor(
    /**
     * Whether the default animation should loop @defaultValue `true. The default animation should loop`
     */
    public loop: boolean = true,

    /**
     * The name of the default animation @defaultValue `null. Do not play any animation by default`
     */
    public animationName: string | null = null,

    /**
     * The name of the default skin @defaultValue `default`
     */
    public skinName: string = "default"
  ) {}
}
