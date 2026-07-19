import type { AnimationState, Skeleton } from "@esotericsoftware/spine-core";
import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  DataObject,
  Entity,
  ignoreClone,
  IndexBufferBinding,
  IndexFormat,
  Material,
  Primitive,
  Renderer,
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
import { getSpineRuntime } from "../runtime/SpineRuntimeRegistry";
import type { ISpineRenderTarget } from "../runtime/ISpineRenderTarget";

/**
 * Spine animation renderer, capable of rendering spine animations and providing functions for animation and skeleton manipulation.
 */
export class SpineAnimationRenderer extends Renderer implements ISpineRenderTarget {
  private static _positionVertexElement = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
  private static _lightColorVertexElement = new VertexElement("LIGHT_COLOR", 12, VertexElementFormat.Vector4, 0);
  private static _uvVertexElement = new VertexElement("TEXCOORD_0", 28, VertexElementFormat.Vector2, 0);
  private static _darkColorVertexElement = new VertexElement("DARK_COLOR", 36, VertexElementFormat.Vector3, 0);

  /** @internal */
  static _materialCacheMap = new Map<string, SpineMaterial>();

  /**
   * The spacing between z layers in world units.
   */
  zSpacing = 0.001;

  /**
   * Whether to use premultiplied alpha mode for rendering.
   * When enabled, vertex color values are multiplied by the alpha channel.
   * @remarks
 If this option is enabled, the Spine editor must export textures with "Premultiply Alpha" checked.
   */
  premultipliedAlpha = false;

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
  private _skeleton: Skeleton;
  @ignoreClone
  private _state: AnimationState;

  /**
   * The Spine.AnimationState object of this SpineAnimationRenderer.
   * Manage, blend, and transition between multiple simultaneous animations effectively.
   */
  get state(): AnimationState {
    return this._state;
  }

  /**
   * The Spine.Skeleton object of this SpineAnimationRenderer.
   * Manipulate bone positions, rotations, scaling
   * and change spine attachment to customize character appearances dynamically during runtime.
   */
  get skeleton(): Skeleton {
    return this._skeleton;
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
  // @ts-ignore
  override _onEnable(): void {
    this._applyDefaultConfig();
  }

  /**
   * @internal
   */
  override update(delta: number): void {
    const { _state: state, _skeleton: skeleton } = this;
    if (!state || !skeleton) return;
    const runtime = getSpineRuntime();
    runtime.updateState(skeleton, state, delta);
    runtime.buildPrimitive(skeleton, this);
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /**
   * @internal
   */
  // @ts-ignore
  override _render(context: any): void {
    const { _primitive, _subPrimitives, _materials: materials } = this;
    if (!_subPrimitives) return;
    // Engine 2.0 render-element model: one RenderElement per sub-primitive (no sub-element pool).
    const engine = this.engine as any;
    const priority = this.priority;
    const distanceForSort = (this as any)._distanceForSort;
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
  // @ts-ignore
  override _updateBounds(worldBounds: BoundingBox): void {
    BoundingBox.transform(this._localBounds, this.entity.transform.worldMatrix, worldBounds);
  }

  /**
   * @internal
   */
  _setSkeleton(skeleton: Skeleton) {
    this._skeleton = skeleton;
  }

  /**
   * @internal
   */
  _setState(state: AnimationState) {
    this._state = state;
  }

  /**
   * @internal
   */
  // @ts-ignore
  override _cloneTo(target: SpineAnimationRenderer): void {
    // A renderer added manually and never bound to a resource has no skeleton/state to clone.
    if (!this._skeleton || !this._state) return;
    const runtime = getSpineRuntime();
    // Clones share the source's immutable SkeletonData and AnimationStateData (mix config),
    // so mix times configured on the resource propagate to every instance; only the
    // per-instance Skeleton / AnimationState are fresh.
    const skeleton = runtime.createSkeleton(this._skeleton.data);
    const state = runtime.createAnimationState(this._state.data);
    target._setSkeleton(skeleton);
    target._setState(state);
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    this._clearMaterialCache();
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
    this._resource = null;
    this._skeleton = null;
    this._state = null;
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
    if (!cached) {
      cached = new SpineMaterial(engine);
      cached.isGCIgnored = true;
      cached._cacheKey = key;
      SpineAnimationRenderer._materialCacheMap.set(key, cached);
    }
    cached._setBlendMode(blendMode, premultipliedAlpha);
    cached._setTexture(texture);
    cached._setTintBlack(tintBlack);
    cached._setPremultipliedAlpha(premultipliedAlpha);
    return cached;
  }

  private _clearMaterialCache(): void {
    const materialCache = SpineAnimationRenderer._materialCacheMap;
    const materials = this._materials;
    for (let i = 0, len = materials.length; i < len; i += 1) {
      const material = materials[i];
      // `setMaterial` is public API, so entries may be user materials or null holes; a cached
      // SpineMaterial is removed by the exact key it was registered under (recomputing the key
      // from the renderer's current state would miss materials cached under older settings).
      if (material instanceof SpineMaterial) {
        materialCache.delete(material._cacheKey);
      }
    }
  }

  private _applyDefaultConfig(): void {
    const { skeleton, state } = this;
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
    if (!value) {
      this._state = null;
      this._skeleton = null;
      this._resource = null;
      return;
    }
    this._resource = value;
    const { skeletonData, stateData } = value;
    const runtime = getSpineRuntime();
    const skeleton = runtime.createSkeleton(skeletonData);
    const state = runtime.createAnimationState(stateData);
    this._setSkeleton(skeleton);
    this._setState(state);
    this._applyDefaultConfig();
  }
}

/**
 * @internal
 */
export enum RendererUpdateFlags {
  /** Include world position and world bounds. */
  WorldVolume = 0x1
}

/**
 * Default state for spine animation.
 * Contains the default animation name to be played, whether this animation should loop,
 * the default skin name, and the default scale of the skeleton.
 */
export class SpineAnimationDefaultConfig extends DataObject {
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
  ) {
    super();
  }
}
