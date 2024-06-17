import { BoundingBox, Matrix, Ray, Vector2, Vector4 } from "@galacean/engine-math";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { DynamicGeometryDataManager } from "../RenderPipeline/DynamicGeometryDataManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { UICanvas } from "./UICanvas";
import { UITransform, UITransformModifyFlags } from "./UITransform";
import { Camera } from "../Camera";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer {
  private static _uiCanvas: UICanvas[] = [];

  protected _canvas: UICanvas;
  protected _uiTransform: UITransform;
  protected _localBounds: BoundingBox = new BoundingBox();
  protected _rayCastTarget: boolean = true;
  protected _rayCastPadding: Vector4 = new Vector4(0, 0, 0, 0);

  get canvas(): UICanvas {
    return this._canvas;
  }

  set canvas(val: UICanvas) {
    if (this._canvas !== val) {
      this._canvas = val;
    }
  }

  get rayCastTarget(): boolean {
    return this._rayCastTarget;
  }

  set rayCastTarget(value: boolean) {
    this._rayCastTarget = value;
  }

  get rayCastPadding(): Vector4 {
    return this._rayCastPadding;
  }

  set rayCastPadding(value: Vector4) {
    if (this._rayCastPadding !== value) {
      this._rayCastPadding.copyFrom(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._uiTransform = entity.getComponent(UITransform);
  }

  /**
   * @internal
   */
  override _updateShaderData(context: RenderContext, onlyMVP: boolean): void {
    if (onlyMVP) {
      // @ts-ignore
      this._updateMVPShaderData(context, Matrix._identity);
    } else {
      // @ts-ignore
      this._updateTransformShaderData(context, Matrix._identity);
    }
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    this._updateShaderData(context, true);
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
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    this._uiTransform._updateFlagManager.addListener(this._onTransformChanged);
    const uiCanvas = this._entity.getComponentsIncludeParent(UICanvas, UIRenderer._uiCanvas);
    for (let i = uiCanvas.length - 1; i >= 0; i--) {
      const canvas = uiCanvas[i];
      if (canvas.enabled) {
        this._canvas = canvas;
        break;
      }
    }
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    this._uiTransform._updateFlagManager.removeListener(this._onTransformChanged);
  }

  override _onParentChange(seniority: number): void {
    const uiCanvas = this._entity.getComponentsIncludeParent(UICanvas, UIRenderer._uiCanvas);
    for (let i = uiCanvas.length - 1; i >= 0; i--) {
      const canvas = uiCanvas[i];
      if (canvas.enabled) {
        this._canvas = canvas;
        break;
      }
    }
  }

  /** @internal */
  _raycast(ray: Ray, camera?: Camera): boolean {
    const { max, min } = this._localBounds;
    if (max.z === min.z) {
      // 面片
    }
    return false;
  }

  /**
   * @internal
   */
  _getChunkManager(): DynamicGeometryDataManager {
    return this.engine._batcherManager._dynamicGeometryDataManager2D;
  }

  protected _onUITransformChanged(flag: UITransformModifyFlags): void {}
}
