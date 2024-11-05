import { Color, Matrix, Plane, Ray, Vector3, Vector4 } from "@galacean/engine-math";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity, EntityModifyFlags } from "../Entity";
import { PrimitiveChunkManager } from "../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../RenderPipeline/SubPrimitiveChunk";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { HitResult } from "../physics";
import { ShaderProperty } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { UICanvas } from "./UICanvas";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UITransform } from "./UITransform";
import { UIUtils } from "./UIUtils";
import { IUIGraphics } from "./interface/IUIGraphics";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export abstract class UIRenderer extends Renderer implements IUIGraphics {
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

  @ignoreClone
  depth: number = 0;
  @deepClone
  raycastPadding: Vector4 = new Vector4(0, 0, 0, 0);

  /** @internal */
  @ignoreClone
  _parents: Entity[] = [];
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _subChunk: SubPrimitiveChunk;

  @ignoreClone
  private _raycastEnable: boolean = true;
  @ignoreClone
  protected _alpha: number = 1;
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

  get raycastEnable(): boolean {
    return this._raycastEnable;
  }

  set raycastEnable(val: boolean) {
    if (this._raycastEnable !== val) {
      this._raycastEnable = val;
      this.entity._onUIInteractiveChange(val);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._componentType = ComponentType.UIRenderer;
    this._dirtyUpdateFlag = RendererUpdateFlags.AllBounds | UIRendererUpdateFlags.Color;
    this._onEntityModify = this._onEntityModify.bind(this);
    this._onColorChange = this._onColorChange.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChange;
  }

  /**
   * @internal
   */
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    // super._updateTransformShaderData(context, onlyMVP, true);
    const worldMatrix = this.entity.transform.worldMatrix;
    if (onlyMVP) {
      this._updateProjectionRelatedShaderData(context, worldMatrix, true);
    } else {
      this._updateWorldViewRelatedShaderData(context, worldMatrix, true);
    }
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._update(context);
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
    this._overrideUpdate && this.scene._componentsManager.addOnUpdateRenderers(this);
    const entity = this._entity;
    UIUtils.registerElementToCanvas(this, UIUtils.getRootCanvasInParent(entity));
    UIUtils.registerElementToGroup(this, UIUtils.getGroupInParents(entity));
    UIUtils.registerEntityListener(this);
    entity._onUIInteractiveChange(this.raycastEnable);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._overrideUpdate && this.scene._componentsManager.removeOnUpdateRenderers(this);
    UIUtils.registerElementToCanvas(this, null);
    UIUtils.registerElementToGroup(this, null);
    UIUtils.unRegisterEntityListener(this);
    this._entity._onUIInteractiveChange(false);
  }

  /**
   * @internal
   */
  @ignoreClone
  _onEntityModify(flag: EntityModifyFlags): void {
    switch (flag) {
      case EntityModifyFlags.SiblingIndex:
        this._rootCanvas && (this._rootCanvas._hierarchyDirty = true);
        break;
      case EntityModifyFlags.UICanvasEnableInScene:
      case EntityModifyFlags.Parent:
        const rootCanvas = UIUtils.getRootCanvasInParent(this._entity);
        rootCanvas && (rootCanvas._hierarchyDirty = true);
        UIUtils.registerElementToCanvas(this, rootCanvas);
        UIUtils.registerEntityListener(this);
      case EntityModifyFlags.UIGroupEnableInScene:
        UIUtils.registerElementToGroup(this, UIUtils.getGroupInParents(this._entity));
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.Alpha) {
      this._alpha = this._group._globalAlpha;
      this._dirtyUpdateFlag |= UIRendererUpdateFlags.Color;
    }
  }

  @ignoreClone
  private _onColorChange(): void {
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
  _raycast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const plane = UIRenderer._tempPlane;
    const transform = this._transform;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      const worldMatrixInv = UIRenderer._tempMat;
      Matrix.invert(transform.worldMatrix, worldMatrixInv);
      const localPosition = UIRenderer._tempVec31;
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, localPosition);
      if (this._hitTest(localPosition)) {
        out.distance = curDistance;
        out.entity = this._entity;
        out.component = this;
        out.normal.copyFrom(normal);
        out.point.copyFrom(hitPointWorld);
        return true;
      }
    }
    return false;
  }

  protected _hitTest(localPosition: Vector3): boolean {
    const { x, y } = localPosition;
    const uiTransform = <UITransform>this._transform;
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
    this._color = null;
  }
}

/**
 * @remarks Extends `RendererUpdateFlags`.
 */
export enum UIRendererUpdateFlags {
  Color = 0x10
}
