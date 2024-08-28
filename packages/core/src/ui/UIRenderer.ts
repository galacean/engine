import { BoundingBox, Ray, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { PrimitiveChunkManager } from "../RenderPipeline/PrimitiveChunkManager";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SubPrimitiveChunk } from "../RenderPipeline/SubPrimitiveChunk";
import { Renderer } from "../Renderer";
import { TransformModifyFlags } from "../Transform";
import { ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { ShaderProperty } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { CanvasGroup } from "./CanvasGroup";
import { UICanvas } from "./UICanvas";
import { UITransform } from "./UITransform";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UIRenderer extends Renderer {
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_UITexture");
  /** @internal */
  @ignoreClone
  _uiCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _uiGroup: CanvasGroup;
  /** @internal */
  @ignoreClone
  _subChunk: SubPrimitiveChunk;

  protected _alpha: number = 1;
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
    this._componentType = ComponentType.UIRenderer;
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
    const componentsManager = this.scene._componentsManager;
    if (this._overrideUpdate) {
      componentsManager.addOnUpdateRenderers(this);
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
  }

  /**
   * @internal
   */
  _setAlpha(alpha: number): void {
    if (this._alpha !== alpha) {
      this._alpha = alpha;
      this._dirtyUpdateFlag |= UIRendererUpdateFlags.Alpha;
    }
  }

  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager {
    return this.engine._batcherManager.primitiveChunkManagerUI;
  }

  /** @internal */
  _raycast(ray: Ray, camera?: Camera): boolean {
    const { max, min } = this._localBounds;
    if (max.z === min.z) {
      // 面片
    }
    return false;
  }

  protected override _onDestroy(): void {
    if (this._subChunk) {
      this._getChunkManager().freeSubChunk(this._subChunk);
      this._subChunk = null;
    }

    super._onDestroy();
  }

  protected override _onTransformChanged(flag: TransformModifyFlags): void {}
}

/**
 * @remarks Extends `RendererUpdateFlag`.
 */
export enum UIRendererUpdateFlags {
  Alpha = 0x8
}
