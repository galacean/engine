import { Vector3 } from "@oasis-engine/math";
import { Camera } from "../../Camera";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";
import { Material } from "../../material/Material";
import { Renderer } from "../../Renderer";
import { SpriteMaskElement } from "../../RenderPipeline/SpriteMaskElement";
import { ColorWriteMask } from "../../shader/enums/ColorWriteMask";
import { CullMode } from "../../shader/enums/CullMode";
import { Shader } from "../../shader/Shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { UpdateFlag } from "../../UpdateFlag";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends Renderer {
  /** @internal */
  static _textureProperty: ShaderProperty = Shader.getPropertyByName("u_maskTexture");
  /** @internal */
  static _alphaCutoffProperty: ShaderProperty = Shader.getPropertyByName("u_alphaCutoff");

  private static _tempVec3: Vector3 = new Vector3();

  @deepClone
  private _positions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  @ignoreClone
  private _isSpriteDirty: boolean = true;
  @ignoreClone
  private _worldMatrixDirtyFlag: UpdateFlag;
  @assignmentClone
  private _sprite: Sprite = null;
  @assignmentClone
  private _alphaCutoff: number = 0.5;
  /** The mask layers the sprite mask influence to. */
  @assignmentClone
  private influenceLayers: number = SpriteMaskLayer.Everything;

  /**
   * The Sprite used to define the mask.
   */
  get sprite(): Sprite {
    return this._sprite;
  }

  set sprite(value: Sprite) {
    if (this._sprite !== value) {
      this._sprite = value;
      this._isSpriteDirty = true;
    }
  }

  /**
   * The minimum alpha value used by the mask to select the area of influence defined over the mask's sprite. Value between 0 and 1.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(value: number) {
    if (this._alphaCutoff !== value) {
      this._alphaCutoff = value;
      this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._worldMatrixDirtyFlag = entity.transform.registerWorldChangeFlag();
    this.setMaterial(this._createMaterial());
    this.shaderData.setFloat(SpriteMask._alphaCutoffProperty, this._alphaCutoff);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onEnable(): void {
    this.engine.spriteMaskManager.addMask(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onDisable(): void {
    this.engine.spriteMaskManager.removeMask(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onDestroy(): void {
    this._worldMatrixDirtyFlag.destroy();
    super._onDestroy();
  }

  /**
   * @override
   * @inheritdoc
   */
  _render(camera: Camera): void {}

  /**
   * @internal
   */
  _getElement(): SpriteMaskElement {
    const sprite = this.sprite;
    if (!sprite) {
      return null;
    }
    const texture = sprite.texture;
    if (!texture) {
      return null;
    }

    const positions = this._positions;
    const transform = this.entity.transform;

    // Update sprite data.
    const localDirty = sprite._updateMeshData();

    if (this._worldMatrixDirtyFlag.flag || localDirty || this._isSpriteDirty) {
      const localPositions = sprite._positions;
      const localVertexPos = SpriteMask._tempVec3;
      const worldMatrix = transform.worldMatrix;

      for (let i = 0, n = positions.length; i < n; i++) {
        const curVertexPos = localPositions[i];
        localVertexPos.setValue(curVertexPos.x, curVertexPos.y, 0);
        Vector3.transformToVec3(localVertexPos, worldMatrix, positions[i]);
      }

      this._isSpriteDirty = false;
      this._worldMatrixDirtyFlag.flag = false;
    }

    this.shaderData.setTexture(SpriteMask._textureProperty, texture);
    const spriteMaskElementPool = this._engine._spriteMaskElementPool;
    const spriteMaskElement = spriteMaskElementPool.getFromPool();
    spriteMaskElement.setValue(this, positions, sprite._uv, sprite._triangles, this.getMaterial());
    return spriteMaskElement;
  }

  private _createMaterial(): Material {
    const material = new Material(this.engine, Shader.find("SpriteMask"));
    const renderState = material.renderState;
    renderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.None;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.stencilState.enabled = true;
    renderState.depthState.enabled = false;
    return material;
  }
}
