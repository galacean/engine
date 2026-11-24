import {
  VertexMergeBatcher,
  Color,
  DependentMode,
  Entity,
  EntityModifyFlags,
  Logger,
  SpriteMaskUtils,
  Ray,
  Renderer,
  RendererUpdateFlags,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderProperty,
  SpriteMaskInteraction,
  Vector3,
  Vector4,
  dependentComponents,
  ignoreClone
} from "@galacean/engine";
import type { IMaskRenderable, PrimitiveChunkManager } from "@galacean/engine";
import { Utils } from "../Utils";
import { RectMaskMode } from "../enums/RectMaskMode";
import { UIHitResult } from "../input/UIHitResult";
import { IGraphics } from "../interface/IGraphics";
import { RectMask2D } from "./advanced/RectMask2D";
import { EntityUIModifyFlags, UICanvas } from "./UICanvas";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UITransform } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer implements IGraphics {
  /** @internal */
  static _tempVec30: Vector3 = new Vector3();
  /** @internal */
  static _tempVec31: Vector3 = new Vector3();
  /** @internal */
  static _tempNormal: Vector3 = new Vector3();
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_UITexture");
  /** @internal */
  static _rectClipRectProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipRect");
  /** @internal */
  static _rectClipAxisXProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipAxisX");
  /** @internal */
  static _rectClipAxisYProperty: ShaderProperty = ShaderProperty.getByName("renderer_UIRectClipAxisY");
  /** @internal */
  static _rectClipMacro: ShaderMacro = ShaderMacro.getByName("RENDERER_ENABLE_UI_RECT_CLIP");
  /** @internal */
  static _tempRect: Vector4 = new Vector4();

  /**
   * Custom boundary for raycast detection.
   * @remarks this is based on `this.entity.transform`.
   */
  raycastPadding: Vector4 = new Vector4(0, 0, 0, 0);
  /** @internal */
  _rootCanvas: UICanvas | null;
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
  _group: UIGroup | null;
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
  override _uiMasks: IMaskRenderable[] = [];
  /** @internal */
  @ignoreClone
  _rectMasks: RectMask2D[] = [];
  /** @internal */
  @ignoreClone
  _rectMaskRect: Vector4 = new Vector4();
  /** @internal */
  @ignoreClone
  _rectMaskEnabled: boolean = false;
  /** @internal Root canvas local XY rectangles excluded through stencil. */
  @ignoreClone
  override _uiMaskOutsideRects: Vector4[] = [];
  /** @internal */
  @ignoreClone
  override _uiMaskAxisX: Vector4 = new Vector4(1, 0, 0, 0);
  /** @internal */
  @ignoreClone
  override _uiMaskAxisY: Vector4 = new Vector4(0, 1, 0, 0);

  @ignoreClone
  private _isMaskOverflow: boolean = false;
  private _raycastEnabled: boolean = true;
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
   * Visibility relative to the intersection of ancestor UI Masks. Defaults to VisibleInsideMask.
   * With no ancestor Mask, the renderer is unaffected. RectMask2D clipping is independent.
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
    this._maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    this._dirtyUpdateFlag = RendererUpdateFlags.WorldVolume | UIRendererUpdateFlags.Color;
    this._onColorChanged = this._onColorChanged.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChanged;
    this._groupListener = this._groupListener.bind(this);
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
  }

  /**
   * @internal
   */
  override _canBatch(preElement, curElement): boolean {
    return VertexMergeBatcher.canBatchSprite(preElement, curElement);
  }

  /**
   * @internal
   */
  override _batch(preElement, curElement): void {
    VertexMergeBatcher.batch(preElement, curElement);
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context, onlyMVP: boolean): void {
    // @ts-ignore
    this._updateWorldSpaceTransformShaderData(context, onlyMVP);
  }

  /**
   * @internal
   */
  override _prepareRender(context): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
    }

    this._updateRectMaskClipState();
    if (this._isMaskOverflow) {
      return;
    }
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
  override _onEnableInScene(): void {
    this._overrideUpdate && this.scene!._componentsManager.addOnUpdateRenderers(this);
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
    Utils.setRootCanvasDirty(this);
    Utils.setGroupDirty(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._overrideUpdate && this.scene!._componentsManager.removeOnUpdateRenderers(this);
    this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
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
  _getRootCanvas(): UICanvas | null {
    this._isRootCanvasDirty && Utils.setRootCanvas(this, Utils.searchRootCanvasInParents(this));
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _getGroup(): UIGroup | null {
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
        entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
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
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManagerUI;
  }

  /**
   * @internal
   */
  _getUIMask(): IMaskRenderable | null {
    return null;
  }

  /** @internal */
  _setMasks(masks: IMaskRenderable[], count: number): void {
    this._uiMasks.length = count;
    for (let i = 0; i < count; i++) {
      this._uiMasks[i] = masks[i];
    }
  }

  /** @internal */
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
  _raycast(ray: Ray, out: UIHitResult, maxDistance: number, minDistance: number = 0): boolean {
    this._updateRectMaskClipState();
    if (this._isMaskOverflow) {
      return false;
    }
    const transform = <UITransform>this._transformEntity!.transform;
    const normal = UIRenderer._tempNormal;
    const localPosition = UIRenderer._tempVec31;
    const curDistance = SpriteMaskUtils.intersectRayXYPlane(
      ray,
      transform.worldMatrix,
      minDistance,
      maxDistance,
      localPosition,
      normal
    );
    if (curDistance !== null) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      if (
        this._hitTest(localPosition) &&
        this._isRaycastVisibleByRectMask(hitPointWorld) &&
        this._isRaycastVisibleByMask(ray, maxDistance, minDistance)
      ) {
        out.component = this;
        out.distance = Math.abs(curDistance);
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
    const uiTransform = <UITransform>this._transformEntity!.transform;
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

  private _isRaycastVisibleByMask(ray: Ray, maxDistance: number, minDistance: number): boolean {
    const maskInteraction = this._maskInteraction;
    if (maskInteraction === SpriteMaskInteraction.None) {
      return true;
    }
    const masks = this._uiMasks;
    if (masks.length === 0) return true;
    let inside = true;
    for (let i = 0; i < masks.length; i++) {
      if (!masks[i]._containsRay(ray, maxDistance, minDistance)) {
        inside = false;
        break;
      }
    }
    return maskInteraction === SpriteMaskInteraction.VisibleOutsideMask ? !inside : inside;
  }

  private _isRaycastVisibleByRectMask(hitPointWorld: Vector3): boolean {
    // _raycast rebuilds these constraints before testing, so picking and rendering consume
    // the same merged Inside rectangle and Outside rectangles, including mode/size changes.
    if (!this._rectMaskEnabled && this._uiMaskOutsideRects.length === 0) {
      return true;
    }
    const axisX = this._uiMaskAxisX;
    const axisY = this._uiMaskAxisY;
    const x = hitPointWorld.x * axisX.x + hitPointWorld.y * axisX.y + hitPointWorld.z * axisX.z + axisX.w;
    const y = hitPointWorld.x * axisY.x + hitPointWorld.y * axisY.y + hitPointWorld.z * axisY.z + axisY.w;
    const inside = this._rectMaskRect;
    if (this._rectMaskEnabled && (x < inside.x || y < inside.y || x > inside.z || y > inside.w)) return false;
    for (const rect of this._uiMaskOutsideRects) {
      if (x >= rect.x && y >= rect.y && x <= rect.z && y <= rect.w) return false;
    }
    return true;
  }

  protected _updateRectMaskClipState(): void {
    let minX = Number.NEGATIVE_INFINITY;
    let minY = Number.NEGATIVE_INFINITY;
    let maxX = Number.POSITIVE_INFINITY;
    let maxY = Number.POSITIVE_INFINITY;
    let insideEnabled = false;
    let outsideCount = 0;
    const rect = UIRenderer._tempRect;
    const outsideRects = this._uiMaskOutsideRects;
    const axisX = this._uiMaskAxisX;
    const axisY = this._uiMaskAxisY;
    const rectMasks = this._rectMasks;
    if (rectMasks.length > 0) {
      const rootCanvas = this._getRootCanvas();
      let hasCanvasSpace: boolean;
      if (rootCanvas) {
        hasCanvasSpace = rootCanvas._getWorldToLocalXY(axisX, axisY);
      } else {
        axisX.set(1, 0, 0, 0);
        axisY.set(0, 1, 0, 0);
        hasCanvasSpace = true;
      }
      for (const mask of rectMasks) {
        if (!mask.enabled || !mask.entity.isActiveInHierarchy) continue;
        const valid = hasCanvasSpace && mask._getCanvasRect(axisX, axisY, rect) && rect.x < rect.z && rect.y < rect.w;
        if (mask.mode === RectMaskMode.Outside) {
          // Empty holes impose no constraint and require no stencil draw.
          if (valid) {
            (outsideRects[outsideCount] ||= new Vector4()).copyFrom(rect);
            outsideCount++;
          }
        } else {
          insideEnabled = true;
          if (!valid) rect.set(1, 1, 0, 0);
          minX = Math.max(minX, rect.x);
          minY = Math.max(minY, rect.y);
          maxX = Math.min(maxX, rect.z);
          maxY = Math.min(maxY, rect.w);
        }
      }
    }
    outsideRects.length = outsideCount;
    const spriteCount = this._maskInteraction === SpriteMaskInteraction.None ? 0 : this._uiMasks.length;
    if (spriteCount + outsideCount > 8) {
      Logger.warn(
        "UI masks support at most 8 stencil ancestors (Mask and nonempty RectMask2D Outside). RectMask2D Inside does not use stencil."
      );
      outsideRects.length = 0;
      this._rectMaskEnabled = false;
      this._isMaskOverflow = true;
      this.shaderData.disableMacro(UIRenderer._rectClipMacro);
      return;
    }
    this._isMaskOverflow = false;
    if (!insideEnabled || minX >= maxX || minY >= maxY) {
      minX = minY = 1;
      maxX = maxY = 0;
    }
    this._rectMaskRect.set(minX, minY, maxX, maxY);
    this._rectMaskEnabled = insideEnabled;
    if (insideEnabled) {
      this.shaderData.enableMacro(UIRenderer._rectClipMacro);
      this.shaderData.setVector4(UIRenderer._rectClipRectProperty, this._rectMaskRect);
      this.shaderData.setVector4(UIRenderer._rectClipAxisXProperty, axisX);
      this.shaderData.setVector4(UIRenderer._rectClipAxisYProperty, axisY);
    } else {
      this.shaderData.disableMacro(UIRenderer._rectClipMacro);
    }
  }

  protected override _onDestroy(): void {
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
    super._onDestroy();
    //@ts-ignore
    this._color._onValueChanged = null;
    this._color = null!;
    this._uiMasks.length = 0;
    this._rectMasks = null!;
    this._uiMaskOutsideRects.length = 0;
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum UIRendererUpdateFlags {
  Color = 0x2
}
