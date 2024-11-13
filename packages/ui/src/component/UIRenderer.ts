import {
  BatchUtils,
  Color,
  ComponentType,
  DependentMode,
  Entity,
  EntityModifyFlags,
  HitResult,
  Matrix,
  Plane,
  Ray,
  Renderer,
  RendererUpdateFlags,
  ShaderMacroCollection,
  ShaderProperty,
  Vector3,
  Vector4,
  deepClone,
  dependentComponents,
  ignoreClone
} from "@galacean/engine";
import { Utils } from "../Utils";
import { IGraphics } from "../interface/IGraphics";
import { EntityUIModifyFlags, UICanvas } from "./UICanvas";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UITransform } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export abstract class UIRenderer extends Renderer implements IGraphics {
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

  @deepClone
  raycastPadding: Vector4 = new Vector4(0, 0, 0, 0);

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
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _subChunk;
  /** @internal */
  @ignoreClone
  _elementDirty: number = UIElementDirtyFlag.None;
  /** @internal */
  @ignoreClone
  _canvasListeningEntities: Entity[] = [];
  /** @internal */
  @ignoreClone
  _groupListeningEntities: Entity[] = [];
  /**@internal */
  @ignoreClone
  _onUIUpdateIndex: number = 0;

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
    this._raycastEnable = val;
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._componentType = ComponentType.UIRenderer;
    this._dirtyUpdateFlag = RendererUpdateFlags.AllBounds | UIRendererUpdateFlags.Color;
    this._onColorChange = this._onColorChange.bind(this);
    //@ts-ignore
    this._color._onValueChanged = this._onColorChange;
    this._groupListener = this._groupListener.bind(this);
    this._canvasListener = this._canvasListener.bind(this);
  }

  // @ts-ignore
  override _canBatch(elementA, elementB): boolean {
    return BatchUtils.canBatchSprite(elementA, elementB);
  }

  // @ts-ignore
  override _batch(elementA, elementB?): void {
    BatchUtils.batchFor2D(elementA, elementB);
  }

  // @ts-ignore
  override _updateTransformShaderData(context, onlyMVP: boolean, batched: boolean): void {
    // @ts-ignore
    super._updateTransformShaderData(context, onlyMVP, true);
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
    const componentsManager = this.scene._componentsManager;
    this._overrideUpdate && componentsManager.addOnUpdateRenderers(this);
    componentsManager.addOnUpdateUIElement(this);
    Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Canvas | UIElementDirtyFlag.Group);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    // @ts-ignore
    const componentsManager = this.scene._componentsManager;
    this._overrideUpdate && componentsManager.removeOnUpdateRenderers(this);
    componentsManager.removeOnUpdateUIElement(this);
    Utils.registerElementToCanvas(this, null, false, true);
    Utils.unRegisterListener(this._canvasListeningEntities, this._canvasListener);
    Utils.registerElementToGroup(this, null);
    Utils.unRegisterListener(this._groupListeningEntities, this._groupListener);
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Canvas)) {
      Utils.registerElementToCanvas(this, Utils.getRootCanvasInParents(this.entity), true, true);
      Utils.setDirtyFlagFalse(this, UIElementDirtyFlag.Canvas);
    }
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Group)) {
      if (this._rootCanvas) {
        Utils.registerElementToGroup(this, Utils.getGroupInParents(this.entity), true);
      } else {
        Utils.unRegisterListener(this._groupListeningEntities, this._groupListener);
      }
      Utils.setDirtyFlagFalse(this, UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _groupListener(flag: number): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Group)) return;
    if (flag === EntityModifyFlags.Parent || flag === EntityUIModifyFlags.UIGroupEnableInScene) {
      Utils.registerElementToGroup(this, null);
      Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _canvasListener(flag: number): void {
    if (Utils.isContainDirtyFlag(this, UIElementDirtyFlag.Canvas)) return;
    if (flag === EntityModifyFlags.SiblingIndex) {
      const rootCanvas = this._rootCanvas;
      rootCanvas && (rootCanvas._hierarchyDirty = true);
    } else if (flag === EntityModifyFlags.Parent) {
      Utils.registerElementToCanvas(this, null, false, true);
      Utils.registerElementToGroup(this, null);
      Utils.setDirtyFlagTrue(this, UIElementDirtyFlag.Canvas | UIElementDirtyFlag.Group);
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.Alpha) {
      this._alpha = this._group?._globalAlpha || 1;
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
  _getChunkManager() {
    // @ts-ignore
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
        out.entity = this.entity;
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

export enum UIElementDirtyFlag {
  None = 0x0,
  Canvas = 0x1,
  Group = 0x2
}
