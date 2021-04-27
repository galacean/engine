import { BoundingBox, Color, Vector3 } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Material, RenderQueueType } from "../../material";
import { Renderer } from "../../Renderer";
import { SpriteElement } from "../../RenderPipeline/SpriteElement";
import { BlendFactor, BlendOperation, CompareFunction, CullMode, Shader } from "../../shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { UpdateFlag } from "../../UpdateFlag";
import { SpriteMaskInteraction } from "../enums/SpriteMaskInteraction";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";
import "./SpriteMaterial";

/**
 * Renders a Sprite for 2D graphics.
 */
export class SpriteRenderer extends Renderer {
  private static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_texture");
  private static _tempVec3: Vector3 = new Vector3();

  @deepClone
  private _positions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  @assignmentClone
  private _sprite: Sprite = null;
  @deepClone
  private _color: Color = new Color(1, 1, 1, 1);
  @assignmentClone
  private _flipX: boolean = false;
  @assignmentClone
  private _flipY: boolean = false;
  @assignmentClone
  private _cacheFlipX: boolean = false;
  @assignmentClone
  private _cacheFlipY: boolean = false;
  @ignoreClone
  private _dirtyFlag: number = DirtyFlag.All;
  @ignoreClone
  private _isWorldMatrixDirty: UpdateFlag;
  @assignmentClone
  private _maskInteraction: SpriteMaskInteraction = SpriteMaskInteraction.None;
  @assignmentClone
  private _maskLayer: number = SpriteMaskLayer.Layer0;

  /**
   * The Sprite to render.
   */
  get sprite(): Sprite {
    return this._sprite;
  }

  set sprite(value: Sprite | null) {
    if (this._sprite !== value) {
      this._sprite = value;
      this._setDirtyFlagTrue(DirtyFlag.Sprite);
    }
  }

  /**
   * Rendering color for the Sprite graphic.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      value.cloneTo(this._color);
    }
  }

  /**
   * Flips the sprite on the X axis.
   */
  get flipX(): boolean {
    return this._flipX;
  }

  set flipX(value: boolean) {
    if (this._flipX !== value) {
      this._flipX = value;
      this._setDirtyFlagTrue(DirtyFlag.Flip);
    }
  }

  /**
   * Flips the sprite on the Y axis.
   */
  get flipY(): boolean {
    return this._flipY;
  }

  set flipY(value: boolean) {
    if (this._flipY !== value) {
      this._flipY = value;
      this._setDirtyFlagTrue(DirtyFlag.Flip);
    }
  }

  /**
   * Interacts with the masks.
   */
  get maskInteraction(): SpriteMaskInteraction {
    return this._maskInteraction;
  }

  set maskInteraction(value: SpriteMaskInteraction) {
    if (this._maskInteraction !== value) {
      this._maskInteraction = value;
      this._setDirtyFlagTrue(DirtyFlag.MaskInteraction);
    }
  }

  /**
   * The mask layer the sprite renderer belongs to.
   */
  get maskLayer(): number {
    return this._maskLayer;
  }

  set maskLayer(value: number) {
    this._maskLayer = value;
  }

  /**
   * Create a sprite renderer instance.
   * @param entity - Entity to which the sprite renderer belongs
   */
  constructor(entity: Entity) {
    super(entity);
    this._isWorldMatrixDirty = entity.transform.registerWorldChangeFlag();
    this.setMaterial(this._createMaterial());
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    const { sprite } = this;
    if (!sprite) {
      return;
    }
    const { texture } = sprite;
    if (!texture) {
      return;
    }

    const { _positions } = this;
    const { transform } = this.entity;

    // Update sprite data.
    const localDirty = sprite._updateMeshData();

    if (this._isWorldMatrixDirty.flag || localDirty || this._isContainDirtyFlag(DirtyFlag.Sprite)) {
      const localPositions = sprite._positions;
      const localVertexPos = SpriteRenderer._tempVec3;
      const worldMatrix = transform.worldMatrix;
      const { flipX, flipY } = this;

      for (let i = 0, n = _positions.length; i < n; i++) {
        const curVertexPos = localPositions[i];
        localVertexPos.setValue(flipX ? -curVertexPos.x : curVertexPos.x, flipY ? -curVertexPos.y : curVertexPos.y, 0);
        Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
      }

      this._setDirtyFlagFalse(DirtyFlag.Flip);
      this._setDirtyFlagFalse(DirtyFlag.Sprite);
      this._isWorldMatrixDirty.flag = false;
      this._cacheFlipX = flipX;
      this._cacheFlipY = flipY;
    } else if (this._isContainDirtyFlag(DirtyFlag.Flip)) {
      const { flipX, flipY } = this;
      const flipXChange = this._cacheFlipX !== flipX;
      const flipYChange = this._cacheFlipY !== flipY;

      if (flipXChange || flipYChange) {
        const { x, y } = transform.worldPosition;

        for (let i = 0, n = _positions.length; i < n; i++) {
          const curPos = _positions[i];

          if (flipXChange) {
            curPos.x = x * 2 - curPos.x;
          }
          if (flipYChange) {
            curPos.y = y * 2 - curPos.y;
          }
        }
      }

      this._setDirtyFlagFalse(DirtyFlag.Flip);
      this._cacheFlipX = flipX;
      this._cacheFlipY = flipY;
    }

    if (this._isContainDirtyFlag(DirtyFlag.MaskInteraction)) {
      this._updateStencilState();
      this._setDirtyFlagFalse(DirtyFlag.MaskInteraction);
    }

    this.shaderData.setTexture(SpriteRenderer._textureProperty, texture);
    const material = this.getMaterial();

    const spriteElement = SpriteElement.getFromPool();
    spriteElement.setValue(this, _positions, sprite._uv, sprite._triangles, this.color, material, camera);
    camera._renderPipeline.pushPrimitive(spriteElement);
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._isWorldMatrixDirty.destroy();
    super._onDestroy();
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number): void {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number): void {
    this._dirtyFlag &= ~type;
  }

  private _createMaterial(): Material {
    const material = new Material(this.engine, Shader.find("Sprite"));
    const target = material.renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
    const renderState = material.renderState;
    renderState.depthState.writeEnabled = false;
    renderState.rasterState.cullMode = CullMode.Off;
    material.renderQueueType = RenderQueueType.Transparent;

    return material;
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const sprite = this._sprite;
    if (sprite) {
      const localBounds = sprite.bounds;
      const worldMatrix = this._entity.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
    } else {
      worldBounds.min.setValue(0, 0, 0);
      worldBounds.max.setValue(0, 0, 0);
    }
  }

  private _updateStencilState(): void {
    // Update stencil.
    const material = this.getInstanceMaterial();
    const stencilState = material.renderState.stencilState;
    const maskInteraction = this._maskInteraction;

    if (maskInteraction === SpriteMaskInteraction.None) {
      stencilState.enabled = false;
      stencilState.writeMask = 0xff;
      stencilState.referenceValue = 0;
      stencilState.compareFunctionFront = stencilState.compareFunctionBack = CompareFunction.Always;
    } else {
      stencilState.enabled = true;
      stencilState.writeMask = 0x00;
      stencilState.referenceValue = 1;
      const compare =
        maskInteraction === SpriteMaskInteraction.VisibleInsideMask
          ? CompareFunction.LessEqual
          : CompareFunction.Greater;
      stencilState.compareFunctionFront = compare;
      stencilState.compareFunctionBack = compare;
    }
  }
}

enum DirtyFlag {
  Flip = 0x1,
  Sprite = 0x2,
  All = 0x3,
  MaskInteraction = 0x4
}
