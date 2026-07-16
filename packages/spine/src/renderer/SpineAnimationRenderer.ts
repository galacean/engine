import type { AnimationState, Skeleton } from "@esotericsoftware/spine-core";
import {
  assignmentClone,
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  deepClone,
  Entity,
  EntityModifyFlags,
  EntityUIModifyFlags,
  ignoreClone,
  IndexBufferBinding,
  IndexFormat,
  Material,
  Primitive,
  Ray,
  Renderer,
  ShaderMacro,
  ShaderProperty,
  SubPrimitive,
  Texture2D,
  UIElementUtils,
  Vector3,
  Vector4,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import type { IUICanvas, IUIGroup, IUIHitResult, IUIRenderer } from "@galacean/engine";
import { SpineResource } from "../loader/SpineResource";
import { SpineMaterial } from "./SpineMaterial";
import { SpineBlendMode } from "../enums/SpineBlendMode";
import { SpineVertexStride } from "../SpineConstant";
import { getSpineRuntime } from "../runtime/SpineRuntimeRegistry";
import type { ISpineRenderTarget } from "../runtime/ISpineRenderTarget";

/**
 * Spine animation renderer, capable of rendering spine animations and providing functions for animation and skeleton manipulation.
 *
 * @remarks
 * Renders in world space through the camera pipeline, or — when placed under a root `UICanvas` —
 * is hosted by the canvas (implements the engine's `IUIRenderer` contract): collected and
 * ordered with the other UI elements, faded by `UIGroup` alpha and clipped by `RectMask2D`.
 * The skeleton renders at the entity's transform scale in both spaces.
 */
export class SpineAnimationRenderer extends Renderer implements ISpineRenderTarget, IUIRenderer {
  private static _positionVertexElement = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
  private static _lightColorVertexElement = new VertexElement("LIGHT_COLOR", 12, VertexElementFormat.Vector4, 0);
  private static _uvVertexElement = new VertexElement("TEXCOORD_0", 28, VertexElementFormat.Vector2, 0);
  private static _darkColorVertexElement = new VertexElement("DARK_COLOR", 36, VertexElementFormat.Vector3, 0);
  private static _uiRectClipMacro = ShaderMacro.getByName("RENDERER_UI_RECT_CLIP");
  private static _rectClipEnabledProperty = ShaderProperty.getByName("renderer_UIRectClipEnabled");
  private static _rectClipSoftnessProperty = ShaderProperty.getByName("renderer_UIRectClipSoftness");
  private static _rectClipHardClipProperty = ShaderProperty.getByName("renderer_UIRectClipHardClip");
  private static _tempHitPoint = new Vector3();

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

  /**
   * Whether this renderer can be picked up by UI raycasts while hosted inside a `UICanvas`.
   * The hit area is the skeleton's world bounds.
   */
  @assignmentClone
  raycastEnabled = false;

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

  /** @internal Marker checked by the `UICanvas` walk (`IUIRenderer`). */
  @ignoreClone
  _isUIRenderer = true;
  /** @internal */
  @ignoreClone
  _rootCanvas: IUICanvas = null;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas = -1;
  /** @internal */
  @ignoreClone
  _rootCanvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _isRootCanvasDirty = false;
  /** @internal */
  @ignoreClone
  _group: IUIGroup = null;
  /** @internal */
  @ignoreClone
  _indexInGroup = -1;
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _isGroupDirty = false;
  /** @internal */
  @ignoreClone
  _rectMasks: any[] = [];
  /** @internal */
  @ignoreClone
  _rectMaskRect = new Vector4();
  /** @internal */
  @ignoreClone
  _rectMaskSoftness = new Vector4();
  /** @internal */
  @ignoreClone
  _rectMaskEnabled = false;
  /** @internal */
  @ignoreClone
  _rectMaskHardClip = false;

  @ignoreClone
  private _hostedByUICanvas = false;
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
   * The host-level alpha (UI group alpha while hosted), folded into vertex colors by the
   * generator on every rebuild.
   */
  get globalAlpha(): number {
    return this._hostedByUICanvas ? (this._getGroup()?._getGlobalAlpha() ?? 1) : 1;
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
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
    this._groupListener = this._groupListener.bind(this);
    const shaderData = this.shaderData;
    shaderData.setFloat(SpineAnimationRenderer._rectClipEnabledProperty, 0);
    shaderData.setVector4(SpineAnimationRenderer._rectClipSoftnessProperty, this._rectMaskSoftness);
    shaderData.setFloat(SpineAnimationRenderer._rectClipHardClipProperty, 0);
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
   * Registration switches with the hierarchy: in world space the renderer joins the camera
   * pipeline's renderer list; under a root canvas the canvas collects it instead.
   */
  // @ts-ignore
  override _onEnableInScene(): void {
    // @ts-ignore
    const componentsManager = this.scene._componentsManager;
    // @ts-ignore
    this._overrideUpdate && componentsManager.addOnUpdateRenderers(this);
    const rootCanvas = UIElementUtils.searchRootCanvasInParents(this.entity);
    this._setHostedByUICanvas(!!rootCanvas, componentsManager, false);
    if (rootCanvas) {
      // The mixin method exists only when the ui package is loaded — without it there are
      // no canvases to notify.
      (this.entity as any)._updateUIHierarchyVersion?.(UIElementUtils._hierarchyCounter);
      UIElementUtils.setRootCanvasDirty(this);
      UIElementUtils.setGroupDirty(this);
    } else {
      componentsManager.addRenderer(this);
      // Listen to the whole parent chain so moving under a canvas re-homes the renderer.
      UIElementUtils.setRootCanvas(this, null, this.entity);
    }
  }

  /**
   * @internal
   */
  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    const componentsManager = this.scene._componentsManager;
    // @ts-ignore
    this._overrideUpdate && componentsManager.removeOnUpdateRenderers(this);
    if (this._hostedByUICanvas) {
      (this.entity as any)._updateUIHierarchyVersion?.(UIElementUtils._hierarchyCounter);
    } else {
      componentsManager.removeRenderer(this);
    }
    UIElementUtils.cleanRootCanvas(this);
    UIElementUtils.cleanGroup(this);
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
    const renderElementPool = engine._renderElementPool;
    const rootCanvas = this._hostedByUICanvas ? (this._getRootCanvas() as IUICanvas) : null;
    if (rootCanvas) {
      if (this.globalAlpha <= 0) {
        return;
      }
      const priority = rootCanvas.sortOrder;
      const distanceForSort = rootCanvas._sortDistance;
      const renderElements = rootCanvas._renderElements;
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
        // The overlay pass renders canvas elements without the pipeline's pushRenderElement
        // (which assigns subShader elsewhere); camera-mode canvases overwrite this later.
        renderElement.subShader = material.shader.subShaders[0];
        renderElement.priority = priority;
        renderElement.distanceForSort = distanceForSort;
        renderElements.push(renderElement);
      }
    } else {
      const priority = this.priority;
      const distanceForSort = (this as any)._distanceForSort;
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
  _getRootCanvas(): IUICanvas {
    if (this._isRootCanvasDirty) {
      UIElementUtils.setRootCanvas(this, UIElementUtils.searchRootCanvasInParents(this.entity), this.entity);
    }
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): IUIGroup {
    if (this._isGroupDirty) {
      const rootCanvas = this._getRootCanvas();
      const group = rootCanvas ? UIElementUtils.searchGroupInParents(this.entity, rootCanvas) : null;
      UIElementUtils.setGroup(this, group, this.entity);
    }
    return this._group;
  }

  /**
   * @internal
   * Vertex colors fully rebuild every frame and read the group alpha then, so group
   * notifications need no bookkeeping here.
   */
  _onGroupModify(): void {}

  /**
   * @internal
   */
  @ignoreClone
  _rootCanvasListener(flag: number, param: any): void {
    switch (flag) {
      case EntityModifyFlags.Parent:
        this._refreshHosting();
        UIElementUtils.setRootCanvasDirty(this);
        UIElementUtils.setGroupDirty(this);
      case EntityModifyFlags.Child:
        (param as any)._updateUIHierarchyVersion?.(UIElementUtils._hierarchyCounter);
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.GroupEnableInScene) {
      UIElementUtils.setGroupDirty(this);
    }
  }

  /**
   * @internal
   */
  _setRectMasks(rectMasks: any[], count: number): void {
    const targetMasks = this._rectMasks;
    targetMasks.length = count;
    for (let i = 0; i < count; i++) {
      targetMasks[i] = rectMasks[i];
    }
  }

  /**
   * @internal
   * Hosted hit-testing against the skeleton's world bounds.
   */
  _raycast(ray: Ray, out: IUIHitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const curDistance = ray.intersectBox(this.bounds);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPoint = ray.getPoint(curDistance, SpineAnimationRenderer._tempHitPoint);
      out.component = this;
      out.distance = curDistance;
      out.entity = this.entity;
      out.normal.copyFrom(this.entity.transform.worldForward);
      out.point.copyFrom(hitPoint);
      return true;
    }
    return false;
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

  private _setHostedByUICanvas(hosted: boolean, componentsManager: any, switchRegistration: boolean): void {
    if (this._hostedByUICanvas === hosted && switchRegistration) return;
    this._hostedByUICanvas = hosted;
    if (switchRegistration) {
      if (hosted) {
        componentsManager.removeRenderer(this);
      } else {
        componentsManager.addRenderer(this);
      }
    }
    if (hosted) {
      this.shaderData.enableMacro(SpineAnimationRenderer._uiRectClipMacro);
    } else {
      this.shaderData.disableMacro(SpineAnimationRenderer._uiRectClipMacro);
    }
  }

  private _refreshHosting(): void {
    const rootCanvas = UIElementUtils.searchRootCanvasInParents(this.entity);
    const hosted = !!rootCanvas;
    if (hosted !== this._hostedByUICanvas) {
      // @ts-ignore
      const componentsManager = this.scene._componentsManager;
      this._setHostedByUICanvas(hosted, componentsManager, true);
      if (hosted) {
        (this.entity as any)._updateUIHierarchyVersion?.(UIElementUtils._hierarchyCounter);
      } else {
        // Re-arm whole-chain listeners (the canvas-scoped range no longer covers the new parents).
        UIElementUtils.setRootCanvas(this, null, this.entity);
        UIElementUtils.cleanGroup(this);
        this._rectMasks.length = 0;
      }
    }
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
