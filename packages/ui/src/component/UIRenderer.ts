import {
  VertexMergeBatcher,
  Color,
  DependentMode,
  Entity,
  EntityModifyFlags,
  Matrix,
  Plane,
  Ray,
  Renderer,
  RendererUpdateFlags,
  ShaderMacroCollection,
  ShaderProperty,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  UIElementUtils,
  Vector3,
  Vector4,
  assignmentClone,
  deepClone,
  dependentComponents,
  ignoreClone,
  Vector2
} from "@galacean/engine";
import { Utils } from "../Utils";
import { UIHitResult } from "../input/UIHitResult";
import type { IUIRenderer } from "@galacean/engine";
import { RectMask2D } from "./advanced/RectMask2D";
import { EntityUIModifyFlags, UICanvas } from "./UICanvas";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UITransform } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer implements IUIRenderer {
  /** @internal */
  static _tempVec20: Vector2 = new Vector2();
  /** @internal */
  static _tempVec30: Vector3 = new Vector3();
  /** @internal */
  static _tempVec31: Vector3 = new Vector3();
  /** @internal */
  static _tempMat: Matrix = new Matrix();
  /** @internal */
  static _tempPlane: Plane = new Plane();
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_UITexture");
  /** @internal */
  static _tempRect: Vector4 = new Vector4();

  /** @internal Marker checked by the `UICanvas` walk (`IUIRenderer`). */
  @ignoreClone
  _isUIRenderer = true;
  /**
   * Custom boundary for raycast detection.
   * @remarks this is based on `this.entity.transform`.
   */
  @deepClone
  raycastPadding: Vector4 = new Vector4(0, 0, 0, 0);
  /** @internal */
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _isRootCanvasDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _rootCanvasListeningEntities: Entity[] = [];
  /** @internal */
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _isGroupDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _subChunk;
  /** @internal */
  @ignoreClone
  _rectMasks: RectMask2D[] = [];
  /** @internal */
  @ignoreClone
  _rectMaskRect: Vector4 = new Vector4();
  /** @internal */
  @ignoreClone
  _rectMaskEnabled: boolean = false;
  /** @internal */
  @ignoreClone
  _rectMaskSoftness: Vector4 = new Vector4();
  /** @internal */
  @ignoreClone
  _rectMaskHardClip: boolean = false;

  @assignmentClone
  private _raycastEnabled: boolean = false;
  @deepClone
  protected _color: Color = new Color(1, 1, 1, 1);

  /**
   * Rendering color for the ui renderer.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
    }
  }

  /**
   * The mask layer the ui renderer belongs to.
   */
  get maskLayer(): SpriteMaskLayer {
    return this._maskLayer;
  }

  set maskLayer(value: SpriteMaskLayer) {
    this._maskLayer = value;
  }

  /**
   * Interacts with the masks.
   */
  get maskInteraction(): SpriteMaskInteraction {
    return this._maskInteraction;
  }

  set maskInteraction(value: SpriteMaskInteraction) {
    if (this._maskInteraction !== value) {
      this._maskInteraction = value;
    }
  }

  /**
   * Whether this renderer be picked up by raycast.
   */
  get raycastEnabled(): boolean {
    return this._raycastEnabled;
  }

  set raycastEnabled(value: boolean) {
    this._raycastEnabled = value;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._dirtyUpdateFlag = RendererUpdateFlags.WorldVolume | UIRendererUpdateFlags.Color;
    this._onColorChanged = this._onColorChanged.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged;
    this._groupListener = this._groupListener.bind(this);
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
    this.shaderData.setFloat(Utils._rectClipEnabledProperty, 0);
    this.shaderData.setVector4(Utils._rectClipSoftnessProperty, this._rectMaskSoftness);
    this.shaderData.setFloat(Utils._rectClipHardClipProperty, 0);
  }

  // @ts-ignore
  override _canBatch(preElement, curElement): boolean {
    return VertexMergeBatcher.canBatchSprite(preElement, curElement);
  }

  // @ts-ignore
  override _batch(preElement, curElement): void {
    VertexMergeBatcher.batch(preElement, curElement);
  }

  // @ts-ignore
  override _updateTransformShaderData(context, onlyMVP: boolean): void {
    // @ts-ignore
    this._updateWorldSpaceTransformShaderData(context, onlyMVP);
  }

  // @ts-ignore
  override _prepareRender(context): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
    }

    this._render(context);

    // union camera global macro and renderer macro.
    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      // @ts-ignore
      this.shaderData._macroCollection,
      //@ts-ignore
      this._globalShaderMacro
    );
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    // @ts-ignore
    this._overrideUpdate && this.scene._componentsManager.addOnUpdateRenderers(this);
    this.entity._updateUIHierarchyVersion(UIElementUtils._hierarchyCounter);
    Utils.setRootCanvasDirty(this);
    Utils.setGroupDirty(this);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    this._overrideUpdate && this.scene._componentsManager.removeOnUpdateRenderers(this);
    this.entity._updateUIHierarchyVersion(UIElementUtils._hierarchyCounter);
    Utils.cleanRootCanvas(this);
    Utils.cleanGroup(this);
  }

  /**
   * @internal
   */
  _getGlobalAlpha(): number {
    return this._getGroup()?._getGlobalAlpha() ?? 1;
  }

  /**
   * @internal
   */
  _getRootCanvas(): UICanvas {
    this._isRootCanvasDirty && Utils.setRootCanvas(this, Utils.searchRootCanvasInParents(this));
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): UIGroup {
    this._isGroupDirty && Utils.setGroup(this, Utils.searchGroupInParents(this));
    return this._group;
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.GroupEnableInScene) {
      Utils.setGroupDirty(this);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _rootCanvasListener(flag: number, entity: Entity): void {
    switch (flag) {
      case EntityModifyFlags.Parent:
        Utils.setRootCanvasDirty(this);
        Utils.setGroupDirty(this);
      case EntityModifyFlags.Child:
        entity._updateUIHierarchyVersion(UIElementUtils._hierarchyCounter);
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  _onGroupModify(flags: GroupModifyFlags): void {
    if (flags & GroupModifyFlags.GlobalAlpha) {
      this._dirtyUpdateFlag |= UIRendererUpdateFlags.Color;
    }
  }

  @ignoreClone
  private _onColorChanged(): void {
    this._dirtyUpdateFlag |= UIRendererUpdateFlags.Color;
  }

  /**
   * @internal
   */
  _getChunkManager() {
    // @ts-ignore
    return this.engine._batcherManager.primitiveChunkManagerUI;
  }

  /**
   * @internal
   */
  _setRectMasks(rectMasks: RectMask2D[], count: number): void {
    const targetMasks = this._rectMasks;
    targetMasks.length = count;
    for (let i = 0; i < count; i++) {
      targetMasks[i] = rectMasks[i];
    }
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, out: UIHitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const plane = UIRenderer._tempPlane;
    const transform = <UITransform>this._transformEntity.transform;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      const worldMatrixInv = UIRenderer._tempMat;
      Matrix.invert(transform.worldMatrix, worldMatrixInv);
      const localPosition = UIRenderer._tempVec31;
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, localPosition);
      if (
        this._hitTest(localPosition) &&
        this._isRaycastVisibleByRectMask(hitPointWorld) &&
        this._isRaycastVisibleByMask(hitPointWorld)
      ) {
        out.component = this;
        out.distance = curDistance;
        out.entity = this.entity;
        out.normal.copyFrom(normal);
        out.point.copyFrom(hitPointWorld);
        return true;
      }
    }
    return false;
  }

  protected _hitTest(localPosition: Vector3): boolean {
    const { x, y } = localPosition;
    const uiTransform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = uiTransform.size;
    const { x: pivotX, y: pivotY } = uiTransform.pivot;
    const { x: paddingLeft, y: paddingBottom, z: paddingRight, w: paddingTop } = this.raycastPadding;
    return (
      x >= -width * pivotX + paddingLeft &&
      x <= width * (1 - pivotX) - paddingRight &&
      y >= -height * pivotY + paddingTop &&
      y <= height * (1 - pivotY) - paddingBottom
    );
  }

  private _isRaycastVisibleByMask(hitPointWorld: Vector3): boolean {
    const maskInteraction = this._maskInteraction;
    if (maskInteraction === SpriteMaskInteraction.None) {
      return true;
    }
    // @ts-ignore
    return this.scene._maskManager.isVisibleByMask(maskInteraction, this._maskLayer, hitPointWorld);
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

  protected override _onDestroy(): void {
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
    super._onDestroy();
    //@ts-ignore
    this._color._onValueChanged = null;
    this._color = null;
    this._rectMasks = null;
    this._rectMaskSoftness = null;
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum UIRendererUpdateFlags {
  Color = 0x2
}
