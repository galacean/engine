import { Matrix } from "@galacean/engine-math";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { DynamicGeometryDataManager } from "../RenderPipeline/DynamicGeometryDataManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { UICanvas } from "./UICanvas";
import { UITransform, UITransformModifyFlags } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer {
  protected _canvas: UICanvas;
  protected _uiTransform: UITransform;

  get canvas(): UICanvas {
    return this._canvas;
  }

  set canvas(val: UICanvas) {
    if (this._canvas !== val) {
      this._canvas = val;
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
    let { _entity: entity } = this;
    while (entity.parent) {
      entity = entity.parent;
    }
    this._canvas = entity._isRoot ? entity.getComponent(UICanvas) : null;
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
    let { _entity: entity } = this;
    while (entity.parent) {
      entity = entity.parent;
    }
    this._canvas = entity._isRoot ? entity.getComponent(UICanvas) : null;
  }

  /**
   * @internal
   */
  _getChunkManager(): DynamicGeometryDataManager {
    return this.engine._batcherManager._dynamicGeometryDataManager2D;
  }

  protected _onUITransformChanged(flag: UITransformModifyFlags): void {}
}
