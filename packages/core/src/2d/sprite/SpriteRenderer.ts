import { Color, Vector3 } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Material, RenderQueueType } from "../../material";
import { Renderer } from "../../Renderer";
import { BlendFactor, BlendOperation, CullMode, Shader } from "../../shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { UpdateFlag } from "../../UpdateFlag";
import { Sprite } from "./Sprite";
import "./SpriteMaterial";

/**
 * 2d sprite renderer.
 */
export class SpriteRenderer extends Renderer {
  private static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_texture");
  private static _tempVec3: Vector3 = new Vector3();
  private static _defaultMaterial: Material = null;

  /** The array containing sprite mesh vertex positions in world space */
  private _positions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  /** The Sprite to render. */
  private _sprite: Sprite = null;
  /** Rendering color for the Sprite graphic. */
  private _color: Color = new Color(1, 1, 1, 1);
  /** Flips the sprite on the X axis. */
  private _flipX: boolean = false;
  /** Flips the sprite on the Y axis. */
  private _flipY: boolean = false;
  /** The dirty flag to determine whether flip vertices. */
  private _dirtyFlag: number = DirtyFlag.All;
  @ignoreClone
  private _isWorldMatrixDirty: UpdateFlag;

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
      this._setDirtyFlagTrue(DirtyFlag.FlipX);
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
      this._setDirtyFlagTrue(DirtyFlag.FlipY);
    }
  }

  /**
   * Create a sprite renderer instance.
   * @param entity - Entity to which the sprite renderer belongs
   */
  constructor(entity: Entity) {
    super(entity);
    this._isWorldMatrixDirty = entity.transform.registerWorldChangeFlag();
  }

  /**
   * Push the render data of the sprite to render queue.
   * @param camera - Camera which is rendering
   */
  _render(camera: Camera): void {
    const { sprite } = this;
    if (!sprite) {
      return;
    }

    const { _positions } = this;
    const { transform } = this.entity;

    // Update sprite data.
    const needUpdate = sprite._updateMeshData();

    if (this._isWorldMatrixDirty.flag || needUpdate || this._isContainDirtyFlag(DirtyFlag.Sprite)) {
      // Update vertices position in world space.
      const localPositions = sprite._positions;
      const localPosZ = transform.position.z;
      const localVertexPos = SpriteRenderer._tempVec3;
      const worldMatrix = transform.worldMatrix;
      for (let i = 0; i < 4; i++) {
        const curVertexPos = localPositions[i];
        localVertexPos.setValue(
          this.flipX ? -curVertexPos.x : curVertexPos.x,
          this.flipY ? -curVertexPos.y : curVertexPos.y,
          localPosZ
        );
        Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
      }

      this._setDirtyFlagFalse(DirtyFlag.Flip);
      this._setDirtyFlagFalse(DirtyFlag.Sprite);
      this._isWorldMatrixDirty.flag = false;
    } else if (this._isContainDirtyFlag(DirtyFlag.Flip)) {
      const flipX = this._isContainDirtyFlag(DirtyFlag.FlipX);
      const flipY = this._isContainDirtyFlag(DirtyFlag.FlipY);
      const { x, y } = transform.worldPosition;

      for (let i = 0, len = _positions.length; i < len; ++i) {
        const curPos = _positions[i];

        if (flipX) {
          curPos.x = x * 2 - curPos.x;
        }

        if (flipY) {
          curPos.y = y * 2 - curPos.y;
        }
      }

      this._setDirtyFlagFalse(DirtyFlag.Flip);
    }

    // @ts-ignore
    this.shaderData.setTexture(SpriteRenderer._textureProperty, sprite.texture);
    const material = this.getMaterial() || this._getDefaultMaterial();

    camera._renderPipeline.pushSprite(this, _positions, sprite._uv, sprite._triangles, this.color, material, camera);
  }

  /**
   * @internal
   */
  _onDestroy() {
    this._isWorldMatrixDirty.destroy();
    super._onDestroy();
  }

  private _isContainDirtyFlag(type: number): boolean {
    return (this._dirtyFlag & type) != 0;
  }

  private _setDirtyFlagTrue(type: number) {
    this._dirtyFlag |= type;
  }

  private _setDirtyFlagFalse(type: number) {
    this._dirtyFlag &= ~type;
  }

  private _getDefaultMaterial() {
    if (!SpriteRenderer._defaultMaterial) {
      // Create default material
      const material = (SpriteRenderer._defaultMaterial = new Material(this.scene.engine, Shader.find("Sprite")));
      const target = material.renderState.blendState.targetBlendState;
      target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
      target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
      material.renderState.depthState.writeEnabled = false;
      material.renderQueueType = RenderQueueType.Transparent;
      material.renderState.rasterState.cullMode = CullMode.Off;
    }

    return SpriteRenderer._defaultMaterial;
  }
}

enum DirtyFlag {
  FlipX = 0x1,
  FlipY = 0x2,
  Flip = 0x3,
  Sprite = 0x4,
  All = 0x7
}
