import {
  VertexMergeBatcher,
  Color,
  DependentMode,
  Entity,
  EntityModifyFlags,
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
import type { IMaskRenderable, PrimitiveChunkManager, RenderElement } from "@galacean/engine";
import { Utils } from "../Utils";
import { UIClipScope } from "./UIClipScope";
import { UIHitResult } from "../input/UIHitResult";
import { IGraphics } from "../interface/IGraphics";
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
  _clipScope = UIClipScope.empty;
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
    return (
      VertexMergeBatcher.canBatchSprite(preElement, curElement) &&
      this._clipScope.canBatch(preElement.component, curElement.component)
    );
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
  override _prepareRender(context, canvas = this._getRootCanvas()!): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
    }

    const clip = this._clipScope;
    if (!clip.fitsStencil(this._maskInteraction)) return;
    if (clip.hasInside) {
      this.shaderData.enableMacro(UIRenderer._rectClipMacro);
      this.shaderData.setVector4(UIRenderer._rectClipRectProperty, clip.insideRect);
      this.shaderData.setVector4(UIRenderer._rectClipAxisXProperty, clip.axisX);
      this.shaderData.setVector4(UIRenderer._rectClipAxisYProperty, clip.axisY);
    } else {
      this.shaderData.disableMacro(UIRenderer._rectClipMacro);
    }
    this._render(context, canvas._renderElements, canvas.referenceResolutionPerUnit);

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
    this._clipScope = UIClipScope.empty;
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

  protected override _render(context, elements?: RenderElement[], referenceResolutionPerUnit?: number): void {
    super._render(context);
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, out: UIHitResult, maxDistance: number, minDistance: number = 0): boolean {
    if (!this._clipScope.fitsStencil(this._maskInteraction)) {
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
        this._clipScope.contains(hitPointWorld, ray, minDistance, maxDistance, this._maskInteraction)
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

  protected override _onDestroy(): void {
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }
    super._onDestroy();
    //@ts-ignore
    this._color._onValueChanged = null;
    this._color = null!;
    this._clipScope = UIClipScope.empty;
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum UIRendererUpdateFlags {
  Color = 0x2
}
