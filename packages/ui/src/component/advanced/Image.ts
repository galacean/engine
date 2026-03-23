import {
  BoundingBox,
  Entity,
  Material,
  RenderContext,
  RenderQueueFlags,
  RendererUpdateFlags,
  SpriteDrawMode,
  SpriteRenderable,
  SpriteRenderableFlags,
  SubPrimitiveChunk,
  Texture2D,
  ignoreClone
} from "@galacean/engine";
import type { Vector2 } from "@galacean/engine";
import { CanvasRenderMode } from "../../enums/CanvasRenderMode";
import { RootCanvasModifyFlags } from "../UICanvas";
import { UIRenderer } from "../UIRenderer";
import { UITransform, UITransformModifyFlags } from "../UITransform";

/**
 * UI element that renders an image.
 */
export class Image extends SpriteRenderable(UIRenderer) {
  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._initSpriteRenderable(UIRenderer._textureProperty);
  }

  // ===== Abstract implementations =====

  /** @internal */
  _getSpriteColor() {
    return this._color;
  }

  /** @internal */
  override _getDefaultSpriteMaterial(): Material {
    // @ts-ignore
    return this._engine._getUIDefaultMaterial();
  }

  /** @internal */
  override _submitSpriteRenderElement(
    context: RenderContext,
    material: Material,
    subChunk: SubPrimitiveChunk,
    texture: Texture2D
  ): void {
    const canvas = this._getRootCanvas();
    if (!canvas) return;

    const engine = context.camera.engine;
    const subRenderElement = engine._subRenderElementPool.get();
    subRenderElement.set(this, material, subChunk.chunk.primitive, subChunk.subMesh, texture, subChunk);

    if (canvas._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay) {
      subRenderElement.shaderPasses = material.shader.subShaders[0].passes;
      subRenderElement.renderQueueFlags = RenderQueueFlags.All;
    }

    // Set UI stencil depth for hierarchy-based masking
    const stencilDepth = this._uiStencilDepth;
    if (stencilDepth > 0) {
      subRenderElement.uiStencilDepth = stencilDepth;
      subRenderElement.uiStencilOp = 0; // test (read stencil)
    }

    canvas._renderElement.addSubRenderElement(subRenderElement);
  }

  /** @internal */
  override _getSpriteWidth(): number {
    return (<UITransform>this._transformEntity.transform).size.x;
  }

  /** @internal */
  override _getSpriteHeight(): number {
    return (<UITransform>this._transformEntity.transform).size.y;
  }

  /** @internal */
  override _getSpritePivot(): Vector2 {
    return (<UITransform>this._transformEntity.transform).pivot;
  }

  // ===== Override defaults =====

  override _getSpriteAlpha(): number {
    return this._getGlobalAlpha();
  }

  override _getReferenceResolutionPerUnit(): number | undefined {
    return this._getRootCanvas()?.referenceResolutionPerUnit;
  }

  // ===== Image-specific =====

  /**
   * @internal
   */
  _onRootCanvasModify(flag: RootCanvasModifyFlags): void {
    if (flag & RootCanvasModifyFlags.ReferenceResolutionPerUnit) {
      const drawMode = this.drawMode;
      if (drawMode === SpriteDrawMode.Tiled) {
        this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
      } else if (drawMode === SpriteDrawMode.Sliced) {
        this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
      }
    }
  }

  /**
   * @internal
   */
  // @ts-ignore
  _cloneTo(target: Image): void {
    // @ts-ignore
    super._cloneTo(target);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const rootCanvas = this._getRootCanvas();
    if (this.sprite && rootCanvas) {
      super._updateBounds(worldBounds);
    } else {
      const { worldPosition } = this._transformEntity.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  @ignoreClone
  protected override _onTransformChanged(type: number): void {
    if (type & UITransformModifyFlags.Size && this.drawMode === SpriteDrawMode.Tiled) {
      this._dirtyUpdateFlag |= SpriteRenderableFlags.All;
    }
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }
}
