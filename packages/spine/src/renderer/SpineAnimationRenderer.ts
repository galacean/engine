import type { ISpineAnimationState, ISpineSkeleton } from "@galacean/engine-design";
import { SpineSkeleton } from "../SpineSkeleton";
import { SpineAnimationState } from "../SpineAnimationState";
import { SpinePhysics } from "../SpinePhysics";
import type { SpinePhysicsSupport } from "../SpinePhysics";
import type { SpineSkeletonData } from "../SpineSkeletonData";
import type { SpineAnimationStateData } from "../SpineAnimationStateData";
import type { ISpineRuntime } from "../runtime/ISpineRuntime";
import {
  assignmentClone,
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  deepClone,
  Entity,
  ignoreClone,
  IndexBufferBinding,
  IndexFormat,
  Material,
  Primitive,
  Renderer,
  RendererUpdateFlags,
  SubPrimitive,
  Texture2D,
  Vector3,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { SpineResource } from "../loader/SpineResource";
import { SpineMaterial } from "./SpineMaterial";
import { SpineBlendMode } from "../enums/SpineBlendMode";
import { SpineVertexStride } from "../SpineConstant";

/**
 * Spine animation renderer, capable of rendering spine animations and providing functions for animation and skeleton manipulation.
 */
export class SpineAnimationRenderer extends Renderer {
  private static _positionVertexElement = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
  private static _lightColorVertexElement = new VertexElement("LIGHT_COLOR", 12, VertexElementFormat.Vector4, 0);
  private static _uvVertexElement = new VertexElement("TEXCOORD_0", 28, VertexElementFormat.Vector2, 0);
  private static _darkColorVertexElement = new VertexElement("DARK_COLOR", 36, VertexElementFormat.Vector3, 0);

  /** @internal */
  static _materialCacheMap = new Map<string, SpineMaterial>();

  /**
   * The spacing between z layers in world units.
   */
  @assignmentClone
  zSpacing = 0.001;

  /**
   * Whether to use premultiplied alpha mode for rendering.
   * When enabled, vertex color values are multiplied by the alpha channel.
   * @remarks
 If this option is enabled, the Spine editor must export textures with "Premultiply Alpha" checked.
   */
  @assignmentClone
  premultipliedAlpha = false;

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
  _vertices = new Float32Array();
  /** @internal */
  @ignoreClone
  _indices = new Uint16Array();
  /** @internal */
  @ignoreClone
  _needResizeBuffer = false;
  /** @internal */
  @ignoreClone
  _vertexCount = 0;
  /** @internal */
  @ignoreClone
  _resource: SpineResource;
  /** @internal */
  @ignoreClone
  _localBounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );

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
    const primitive = new Primitive(this.engine);
    this._primitive = primitive;
    this._primitive._addReferCount(1);
    primitive.addVertexElement(SpineAnimationRenderer._positionVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._lightColorVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._uvVertexElement);
    primitive.addVertexElement(SpineAnimationRenderer._darkColorVertexElement);
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
    const { _state: state, _skeleton: skeleton } = this;
    if (!state || !skeleton) return;
    const runtime = this._runtime;
    runtime.updateState(skeleton, state, delta);
    runtime.buildPrimitive(skeleton, this);
    // Release materials for draw segments that disappeared after a skin/attachment change.
    if (this._materials.length > this._subPrimitives.length) {
      this.setMaterials(this._materials.slice(0, this._subPrimitives.length));
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /**
   * @internal
   */
  override _render(context: any): void {
    const { _primitive, _subPrimitives, _materials: materials } = this;
    if (!_subPrimitives) return;
    const engine = this.engine;
    const priority = this.priority;
    const distanceForSort = this._distanceForSort;
    const renderElementPool = engine._renderElementPool;
    const renderPipeline = context.camera._renderPipeline;
    for (let i = 0, n = _subPrimitives.length; i < n; i++) {
      let material = materials[i];
      if (!material) {
        continue;
      }
      if (material.destroyed || material.shader.destroyed) {
        material = engine._basicResources.meshMagentaMaterial;
      }
      const renderElement = renderElementPool.get();
      renderElement.set(this, material, _primitive, _subPrimitives[i]);
      renderElement.priority = priority;
      renderElement.distanceForSort = distanceForSort;
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
    this._publicState = SpineAnimationState._create(state, data);
  }

  /**
   * @internal
   */
  override _onClone(target: SpineAnimationRenderer): void {
    super._onClone(target);
    // A renderer added manually and never bound to a resource has no skeleton/state to clone.
    if (!this._skeleton || !this._state) return;
    const runtime = this._runtime;
    // Clones share the source's SkeletonData and AnimationStateData (mix config),
    // so mix times configured on the resource propagate to every instance; only the
    // per-instance ISpineSkeleton / ISpineAnimationState are fresh.
    const skeleton = runtime.createSkeleton(this._skeleton.data);
    const state = runtime.createAnimationState(this._state.data);
    target._setRuntime(runtime);
    target._resource = this._resource;
    target._resource?._addReferCount(1);
    target._setSkeleton(skeleton, this._publicSkeleton.data);
    target._setState(state, this._publicState.data);
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    this._publicState?._dispose();
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
    this._resource?._addReferCount(-1);
    this._resource = null;
    this._runtime = null;
    this._physics = null;
    this._skeleton = null;
    this._state = null;
    this._publicSkeleton = null;
    this._publicState = null;
    super._onDestroy();
  }

  /**
   * @internal
   */
  _createAndBindBuffer(vertexCount: number): void {
    const { engine: _engine, _primitive } = this;
    const oldVertexBuffer = this._vertexBuffer;
    const oldIndexBuffer = this._indexBuffer;
    this._vertexCount = vertexCount;
    const stride = this.tintBlack ? SpineVertexStride.withTint : SpineVertexStride.withoutTint;
    this._vertices = new Float32Array(vertexCount * stride);
    this._indices = new Uint16Array(vertexCount);
    const vertexStride = stride << 2;
    const vertexBuffer = new Buffer(_engine, BufferBindFlag.VertexBuffer, this._vertices, BufferUsage.Dynamic);
    const indexBuffer = new Buffer(_engine, BufferBindFlag.IndexBuffer, this._indices, BufferUsage.Dynamic);
    this._indexBuffer = indexBuffer;
    this._vertexBuffer = vertexBuffer;
    const vertexBufferBinding = new VertexBufferBinding(vertexBuffer, vertexStride);
    this._primitive.setVertexBufferBinding(0, vertexBufferBinding);
    const indexBufferBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    _primitive.setIndexBufferBinding(indexBufferBinding);
    // Rebinding released the primitive's references to the old buffers; destroy() is
    // refCount-guarded, so this frees their GPU resources without waiting for gc().
    oldVertexBuffer?.destroy();
    oldIndexBuffer?.destroy();
  }

  /**
   * @internal
   */
  _addSubPrimitive(subPrimitive: SubPrimitive): void {
    this._subPrimitives.push(subPrimitive);
  }

  /**
   * @internal
   */
  _clearSubPrimitives(): void {
    this._subPrimitives.length = 0;
  }

  /**
   * @internal
   */
  _getMaterial(texture: Texture2D, blendMode: SpineBlendMode): Material {
    const engine = this.engine;
    const premultipliedAlpha = this.premultipliedAlpha;
    const tintBlack = this.tintBlack;

    // tintBlack must be part of the key: it toggles a per-material macro, so renderers that
    // differ only in tintBlack cannot share a material.
    const key = `${texture.instanceId}_${blendMode}_${premultipliedAlpha ? 1 : 0}_${tintBlack ? 1 : 0}`;
    let cached = SpineAnimationRenderer._materialCacheMap.get(key);
    if (!cached || cached.destroyed || cached.pendingDestroy) {
      cached = new SpineMaterial(engine);
      // Renderer material references protect live entries. Unused variants participate in normal GC.
      const material = cached;
      cached._onCacheDestroy = () => {
        const cache = SpineAnimationRenderer._materialCacheMap;
        if (cache.get(key) === material) cache.delete(key);
      };
      cached._cacheKey = key;
      SpineAnimationRenderer._materialCacheMap.set(key, cached);
    }
    cached._setBlendMode(blendMode, premultipliedAlpha);
    cached._setTexture(texture);
    cached._setTintBlack(tintBlack);
    cached._setPremultipliedAlpha(premultipliedAlpha);
    return cached;
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
   * * @deprecated This property is deprecated and will be removed in future releases.
   * Spine resource of current spine animation.
   */
  get resource(): SpineResource {
    return this._resource;
  }

  /**
   * * @deprecated This property is deprecated and will be removed in future releases.
   * Sets the Spine resource for the current animation. This property allows switching to a different `SpineResource`.
   *
   * @param value - The new `SpineResource` to be used for the current animation
   */
  set resource(value: SpineResource) {
    if (this._resource === value) return;
    this._publicState?._dispose();
    this._resource?._addReferCount(-1);
    this._resource = value;
    this._state = null;
    this._skeleton = null;
    this._runtime = null;
    this._physics = null;
    this._publicSkeleton = null;
    this._publicState = null;
    this._clearSubPrimitives();
    this.setMaterials([]);
    this._localBounds.min.set(0, 0, 0);
    this._localBounds.max.set(0, 0, 0);
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    if (!value) return;
    value._addReferCount(1);
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
