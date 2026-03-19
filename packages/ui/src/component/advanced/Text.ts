import {
  BoundingBox,
  Entity,
  Material,
  RenderContext,
  RenderQueueFlags,
  ShaderData,
  ShaderDataGroup,
  TextRenderable,
  TextRenderableFlags,
  ignoreClone
} from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * UI component used to render text.
 */
export class Text extends TextRenderable(UIRenderer) {
  constructor(entity: Entity) {
    super(entity);
    this._initTextRenderable();
    this.raycastEnabled = false;
  }

  // ===== Abstract implementations =====

  override _getTextWidth(): number {
    return (<UITransform>this._transformEntity.transform).size.x;
  }

  override _getTextHeight(): number {
    return (<UITransform>this._transformEntity.transform).size.y;
  }

  override _getTextPivotX(): number {
    return (<UITransform>this._transformEntity.transform).pivot.x;
  }

  override _getTextPivotY(): number {
    return (<UITransform>this._transformEntity.transform).pivot.y;
  }

  override _getTextReferenceResolutionPerUnit(): number | undefined {
    return this._getRootCanvas()?.referenceResolutionPerUnit;
  }

  override _submitText(context: RenderContext, material: Material): void {
    const canvas = this._getRootCanvas();
    if (!canvas) return;

    const engine = context.camera.engine;
    const textSubRenderElementPool = engine._textSubRenderElementPool;
    const renderElement = canvas._renderElement;
    const textChunks = this._getTextChunks();
    const textureProperty = this._getTextTextureProperty();
    const isOverlay = canvas._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay;
    for (let i = 0, n = textChunks.length; i < n; ++i) {
      const { subChunk, texture } = textChunks[i];
      const subRenderElement = textSubRenderElementPool.get();
      subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);
      // @ts-ignore
      subRenderElement.shaderData ||= new ShaderData(ShaderDataGroup.RenderElement);
      subRenderElement.shaderData.setTexture(textureProperty, texture);
      if (isOverlay) {
        subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
        subRenderElement.renderQueueFlags = RenderQueueFlags.All;
      }
      renderElement.addSubRenderElement(subRenderElement);
    }
  }

  // ===== Override defaults =====

  override _getTextAlpha(): number {
    return this._getGlobalAlpha();
  }

  override _isTextHostInvisible(): boolean {
    return !this._getRootCanvas();
  }

  // ===== Text-specific =====

  /**
   * The mask layer the text belongs to.
   */
  get maskLayer(): number {
    return this._maskLayer;
  }

  set maskLayer(value: number) {
    this._maskLayer = value;
  }

  /**
   * @internal
   */
  _onRootCanvasModify(flag: RootCanvasModifyFlags): void {
    if (flag === RootCanvasModifyFlags.ReferenceResolutionPerUnit) {
      this._setDirtyFlagTrue(TextRenderableFlags.LocalPositionBounds);
    }
  }

  /**
   * @internal
   */
  // @ts-ignore
  override _cloneTo(target: Text): void {
    // @ts-ignore
    super._cloneTo(target);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const transform = <UITransform>this._transformEntity.transform;
    const { x: width, y: height } = transform.size;
    const { x: pivotX, y: pivotY } = transform.pivot;
    worldBounds.min.set(-width * pivotX, -height * pivotY, 0);
    worldBounds.max.set(width * (1 - pivotX), height * (1 - pivotY), 0);
    BoundingBox.transform(worldBounds, this._transformEntity.transform.worldMatrix, worldBounds);
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size || type & UITransformModifyFlags.Pivot) {
      this._setDirtyFlagTrue(TextRenderableFlags.LocalPositionBounds);
    }
    super._onTransformChanged(type);
  }
}
