import { Matrix, Plane, Ray, Vector3, Vector4 } from "@galacean/engine-math";
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
import { UITransform, UITransformModifyFlags } from "./UITransform";
import { UIUtils } from "./UIUtils";
import { IUIElement } from "./interface/IUIElement";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer implements IUIElement {
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
  /** @internal */
  @ignoreClone
  _runtimeRaycastEnable: boolean = true;

  @ignoreClone
  private _raycastEnable: boolean = true;
  @ignoreClone
  protected _alpha: number = 1;

  get raycastEnable(): boolean {
    return this._raycastEnable;
  }

  set raycastEnable(val: boolean) {
    if (this._raycastEnable !== val) {
      this._raycastEnable = val;
      const runtimeRaycastEnable = val && (!this._group || this._group._getGlobalRaycastEnable());
      if (this._runtimeRaycastEnable !== runtimeRaycastEnable) {
        this._runtimeRaycastEnable = runtimeRaycastEnable;
        this.entity._onUIInteractiveChange(runtimeRaycastEnable);
      }
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._componentType = ComponentType.UIRenderer;
    this._onEntityModify = this._onEntityModify.bind(this);
    this._onGroupModify = this._onGroupModify.bind(this);
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
    UIUtils.registerUIToCanvas(this, UIUtils.getRootCanvasInParent(entity));
    UIUtils.registerUIToGroup(this, UIUtils.getGroupInParents(entity));
    UIUtils.registerEntityListener(this);
    entity._onUIInteractiveChange(this._runtimeRaycastEnable);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._overrideUpdate && this.scene._componentsManager.removeOnUpdateRenderers(this);
    UIUtils.registerUIToCanvas(this, null);
    UIUtils.registerUIToGroup(this, null);
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
      case EntityModifyFlags.Parent:
        const rootCanvas = UIUtils.getRootCanvasInParent(this._entity);
        rootCanvas && (rootCanvas._hierarchyDirty = true);
        UIUtils.registerUIToCanvas(this, rootCanvas);
        UIUtils.registerEntityListener(this);
      case EntityModifyFlags.UIGroupEnableInScene:
        UIUtils.registerUIToGroup(this, UIUtils.getGroupInParents(this._entity));
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.RaycastEnable) {
      const runtimeRaycastEnable = this.raycastEnable && this._group._getGlobalRaycastEnable();
      if (this._runtimeRaycastEnable !== runtimeRaycastEnable) {
        this._runtimeRaycastEnable = runtimeRaycastEnable;
        this.entity._onUIInteractiveChange(runtimeRaycastEnable);
      }
    }
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
    const entity = this._entity;
    const plane = UIRenderer._tempPlane;
    const transform = entity.transform;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      const worldMatrixInv = UIRenderer._tempMat;
      Matrix.invert(this.entity.transform.worldMatrix, worldMatrixInv);
      const localPosition = UIRenderer._tempVec31;
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, localPosition);
      if (this._hitTest(localPosition)) {
        out.distance = curDistance;
        out.entity = entity;
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
  }

  protected override _onTransformChanged(flag: UITransformModifyFlags): void {
    switch (flag) {
      case UITransformModifyFlags.Size:
      case UITransformModifyFlags.Pivot:
        this._dirtyUpdateFlag |= RendererUpdateFlags.AllBounds;
        break;
      default:
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldBounds;
        break;
    }
  }
}
