import { BoundingBox, Ray, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { PrimitiveChunkManager } from "../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer } from "../Renderer";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { UITransform, UITransformModifyFlags } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer {
  protected _uiTransform: UITransform;
  protected _localBounds: BoundingBox = new BoundingBox();
  protected _rayCastTarget: boolean = true;
  protected _rayCastPadding: Vector4 = new Vector4(0, 0, 0, 0);

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
  override _updateTransformShaderData(context: RenderContext, onlyMVP: boolean, batched: boolean): void {
    //@todo: Always update world positions to buffer, should opt
    super._updateTransformShaderData(context, onlyMVP, true);
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    // Update once per frame per renderer, not influenced by batched
    if (this._renderFrameCount !== this.engine.time.frameCount) {
      this._updateRendererShaderData(context);
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
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
    }
    this._uiTransform._updateFlagManager.addListener(this._onUITransformChanged);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.removeOnUpdateRenderers(this);
    }
    this._uiTransform._updateFlagManager.removeListener(this._onUITransformChanged);
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
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManager2D;
  }

  protected _onUITransformChanged(flag: UITransformModifyFlags): void {}
}
