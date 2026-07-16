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
   * The hit area is the skeleton's world bounds, excluding regions clipped away by
   * ancestor `RectMask2D`s.
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
    // Deferred hosting changes (a canvas enabled on an ancestor, a demoted root canvas)
    // must resolve before this frame builds vertices and renders.
    this._settleHosting();
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
    // Start world-registered, then resolve: _refreshHosting hands the registration to the
    // canvas when an enabled root canvas is found above.
    // @ts-ignore
    super._onEnableInScene();
    this._refreshHosting();
  }

  /**
   * @internal
   */
  // @ts-ignore
  override _onDisableInScene(): void {
    if (this._hostedByUICanvas) {
      // @ts-ignore
      this._overrideUpdate && this.scene._componentsManager.removeOnUpdateRenderers(this);
      // The mixin method exists only when the ui package is loaded — without it there are
      // no canvases to notify. It stamps the current hierarchy counter by default.
      (this.entity as any)._updateUIHierarchyVersion?.();
      this._hostedByUICanvas = false;
      this.shaderData.disableMacro(SpineAnimationRenderer._uiRectClipMacro);
      this._rectMasks.length = 0;
    } else {
      // @ts-ignore
      super._onDisableInScene();
    }
    this._cleanRootCanvas();
    this._cleanGroup();
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
    let priority: number;
    let distanceForSort: number;
    let renderElements: any[] = null;
    let renderPipeline: any = null;
    if (rootCanvas) {
      if (this.globalAlpha <= 0) {
        return;
      }
      priority = rootCanvas.sortOrder;
      distanceForSort = rootCanvas._sortDistance;
      renderElements = rootCanvas._renderElements;
    } else if (this._hostedByUICanvas) {
      // Hosting is mid-transition (the canvas demoted after this frame's settle) — skip.
      return;
    } else {
      priority = this.priority;
      distanceForSort = (this as any)._distanceForSort;
      renderPipeline = context.camera._renderPipeline;
    }
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
      // (which assigns subShader elsewhere); the camera passes overwrite this assignment.
      renderElement.subShader = material.shader.subShaders[0];
      renderElement.priority = priority;
      renderElement.distanceForSort = distanceForSort;
      renderElements ? renderElements.push(renderElement) : renderPipeline.pushRenderElement(context, renderElement);
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
      this._refreshHosting();
    }
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): IUIGroup {
    if (this._isGroupDirty) {
      this._isGroupDirty = false;
      const rootCanvas = this._getRootCanvas();
      const group = rootCanvas ? this._searchGroupInParents(rootCanvas) : null;
      this._registerGroup(group);
      if (rootCanvas) {
        this._registerListeners(
          this.entity,
          group?.entity ?? rootCanvas.entity.parent,
          this._groupListener,
          this._groupListeningEntities
        );
      } else {
        this._unRegisterListeners(this._groupListener, this._groupListeningEntities);
      }
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
      case EntityModifyFlags.Child:
        (param as any)._updateUIHierarchyVersion?.();
        break;
      case EntityUIModifyFlags.CanvasEnableInScene:
        // The enabling canvas has not claimed root status at dispatch time, so a search now
        // would miss it — defer resolution to the pre-update settle.
        this._setRootCanvasDirty();
        this._setGroupDirty();
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
      this._setGroupDirty();
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
   * Hosted hit-testing against the skeleton's world bounds; regions clipped away by
   * ancestor `RectMask2D`s are not hittable.
   */
  _raycast(ray: Ray, out: IUIHitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const curDistance = ray.intersectBox(this.bounds);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPoint = ray.getPoint(curDistance, SpineAnimationRenderer._tempHitPoint);
      if (!this._isRaycastVisibleByRectMask(hitPoint)) {
        return false;
      }
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

  private _settleHosting(): void {
    // The divergence check catches half-resolved states: a canvas-side walk may assign
    // _rootCanvas without switching the registration (it only knows the IUIElement contract).
    if (this._isRootCanvasDirty || !!this._rootCanvas !== this._hostedByUICanvas) {
      this._refreshHosting();
    }
  }

  private _refreshHosting(): void {
    const rootCanvas = this._searchRootCanvasInParents();
    const hosted = !!rootCanvas;
    if (hosted !== this._hostedByUICanvas) {
      this._hostedByUICanvas = hosted;
      // @ts-ignore
      const componentsManager = this.scene._componentsManager;
      const shaderData = this.shaderData;
      if (hosted) {
        componentsManager.removeRenderer(this);
        shaderData.enableMacro(SpineAnimationRenderer._uiRectClipMacro);
      } else {
        componentsManager.addRenderer(this);
        shaderData.disableMacro(SpineAnimationRenderer._uiRectClipMacro);
        this._rectMasks.length = 0;
      }
    }
    // Settle the canvas registration and listener scope even without a flip: a world→world
    // reparent introduces ancestors that must be listened to, and the canvas walk and the
    // camera pipeline both consume this state — nothing may stay half-resolved.
    this._isRootCanvasDirty = false;
    this._registerRootCanvas(rootCanvas);
    this._registerListeners(
      this.entity,
      rootCanvas?.entity.parent ?? null,
      this._rootCanvasListener,
      this._rootCanvasListeningEntities
    );
    if (hosted) {
      this._setGroupDirty();
      // The mixin method exists whenever a canvas can exist (it ships with the ui package);
      // stamping makes the hosting canvas re-walk and order this renderer in.
      (this.entity as any)._updateUIHierarchyVersion?.();
    } else {
      this._cleanGroup();
    }
  }

  private _isRaycastVisibleByRectMask(hitPointWorld: Vector3): boolean {
    const rectMasks = this._rectMasks;
    for (let i = 0, n = rectMasks.length; i < n; i++) {
      const rectMask = rectMasks[i];
      if (!rectMask.enabled || !rectMask.entity.isActiveInHierarchy) {
        continue;
      }
      if (!rectMask._containsWorldPoint(hitPointWorld)) {
        return false;
      }
    }
    return true;
  }

  private _searchRootCanvasInParents(): IUICanvas {
    let entity = this.entity;
    while (entity) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && (component as unknown as IUICanvas)._isRootCanvas === true) {
          return component as unknown as IUICanvas;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  private _searchGroupInParents(rootCanvas: IUICanvas): IUIGroup {
    let entity = this.entity;
    const rootCanvasParent = rootCanvas.entity.parent;
    while (entity && entity !== rootCanvasParent) {
      // @ts-ignore
      const components = entity._components;
      for (let i = 0, n = components.length; i < n; i++) {
        const component = components[i];
        if (component.enabled && (component as unknown as IUIGroup)._isUIGroup === true) {
          return component as unknown as IUIGroup;
        }
      }
      entity = entity.parent;
    }
    return null;
  }

  private _setRootCanvasDirty(): void {
    if (this._isRootCanvasDirty) return;
    this._isRootCanvasDirty = true;
    this._registerRootCanvas(null);
  }

  private _setGroupDirty(): void {
    if (this._isGroupDirty) return;
    this._isGroupDirty = true;
    this._registerGroup(null);
  }

  private _cleanRootCanvas(): void {
    this._registerRootCanvas(null);
    this._unRegisterListeners(this._rootCanvasListener, this._rootCanvasListeningEntities);
  }

  private _cleanGroup(): void {
    this._registerGroup(null);
    this._unRegisterListeners(this._groupListener, this._groupListeningEntities);
  }

  private _registerRootCanvas(canvas: IUICanvas): void {
    const preCanvas = this._rootCanvas;
    if (preCanvas !== canvas) {
      if (preCanvas) {
        const replaced = preCanvas._disorderedElements.deleteByIndex(this._indexInRootCanvas);
        replaced && (replaced._indexInRootCanvas = this._indexInRootCanvas);
        this._indexInRootCanvas = -1;
      }
      if (canvas) {
        const disorderedElements = canvas._disorderedElements;
        this._indexInRootCanvas = disorderedElements.length;
        disorderedElements.add(this);
      }
      this._rootCanvas = canvas;
    }
  }

  private _registerGroup(group: IUIGroup): void {
    const preGroup = this._group;
    if (preGroup !== group) {
      if (preGroup) {
        const replaced = preGroup._disorderedElements.deleteByIndex(this._indexInGroup);
        replaced && (replaced._indexInGroup = this._indexInGroup);
        this._indexInGroup = -1;
      }
      if (group) {
        const disorderedElements = group._disorderedElements;
        this._indexInGroup = disorderedElements.length;
        disorderedElements.add(this);
      }
      this._group = group;
    }
  }

  private _registerListeners(
    entity: Entity,
    root: Entity,
    listener: (flag: number, param?: any) => void,
    listeningEntities: Entity[]
  ): void {
    let count = 0;
    while (entity && entity !== root) {
      const preEntity = listeningEntities[count];
      if (preEntity !== entity) {
        // @ts-ignore
        preEntity?._unRegisterModifyListener(listener);
        listeningEntities[count] = entity;
        // @ts-ignore
        entity._registerModifyListener(listener);
      }
      entity = entity.parent;
      count++;
    }
    // A shorter chain drops tail entries — they must release the listener, or the bound
    // component stays reachable from (and invocable by) entities it no longer tracks.
    for (let i = count, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(listener);
    }
    listeningEntities.length = count;
  }

  private _unRegisterListeners(listener: (flag: number, param?: any) => void, listeningEntities: Entity[]): void {
    for (let i = 0, n = listeningEntities.length; i < n; i++) {
      // @ts-ignore
      listeningEntities[i]._unRegisterModifyListener(listener);
    }
    listeningEntities.length = 0;
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
