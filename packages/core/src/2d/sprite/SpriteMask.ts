import { Vector3 } from "@oasis-engine/math";
import { assignmentClone, deepClone, ignoreClone } from "../../clone/CloneManager";
import { Component } from "../../Component";
import { Entity } from "../../Entity";
import { Material } from "../../material";
import { SpriteMaskElement } from "../../RenderPipeline/SpriteMaskElement";
import { SpriteMaskManager } from "../../RenderPipeline/SpriteMaskManager";
import { ColorWriteMask, CullMode, Shader } from "../../shader";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { UpdateFlag } from "../../UpdateFlag";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";
import "./SpriteMaskMaterial";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends Component {
  static textureProperty: ShaderProperty = Shader.getPropertyByName("u_maskTexture");
  static alphaCutoffProperty: ShaderProperty = Shader.getPropertyByName("u_alphaCutoff");
  private static _tempVec3: Vector3 = new Vector3();

  @deepClone
  private _material: Material = null;
  @deepClone
  private _positions: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  @ignoreClone
  private _isSpriteDirty: boolean = true;
  @ignoreClone
  private _isWorldMatrixDirty: UpdateFlag;
  @assignmentClone
  private _sprite: Sprite = null;
  @assignmentClone
  private _alphaCutoff: number = 1.0;
  @assignmentClone
  private _influenceLayers: number = SpriteMaskLayer.Everything;

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
    this._alphaCutoff = value;
  }

  /**
   * The mask layers the sprite mask influence to.
   */
  get influenceLayers(): number {
    return this._influenceLayers;
  }

  set influenceLayers(value: number) {
    this._influenceLayers = value;
  }

  get material(): Material {
    return this._material;
  }

  /**
   * Create a sprite mask instance.
   * @param entity - Entity to which the sprite mask belongs
   */
  constructor(entity: Entity) {
    super(entity);
    this._isWorldMatrixDirty = entity.transform.registerWorldChangeFlag();
    this._material = this._createMaterial();
  }

  _onEnable(): void {
    const manager = SpriteMaskManager.getInstance(this.engine);
    manager.addMask(this);
  }

  _onDisable(): void {
    const manager = SpriteMaskManager.getInstance(this.engine);
    manager.removeMask(this);
  }

  getElement(): SpriteMaskElement {
    const sprite = this.sprite;
    if (!sprite) {
      return null;
    }
    const texture = sprite.texture;
    if (!texture) {
      return null;
    }

    const { _positions } = this;
    const { transform } = this.entity;

    // Update sprite data.
    const localDirty = sprite._updateMeshData();

    if (this._isWorldMatrixDirty.flag || localDirty || this._isSpriteDirty) {
      const localPositions = sprite._positions;
      const localVertexPos = SpriteMask._tempVec3;
      const worldMatrix = transform.worldMatrix;

      for (let i = 0, n = _positions.length; i < n; i++) {
        const curVertexPos = localPositions[i];
        localVertexPos.setValue(curVertexPos.x, curVertexPos.y, 0);
        Vector3.transformToVec3(localVertexPos, worldMatrix, _positions[i]);
      }

      this._isSpriteDirty = false;
      this._isWorldMatrixDirty.flag = false;
    }

    const material = this._material;
    const shaderData = material.shaderData;
    shaderData.setTexture(SpriteMask.textureProperty, texture);
    shaderData.setFloat(SpriteMask.alphaCutoffProperty, this.alphaCutoff);

    const spriteMaskElement = SpriteMaskElement.getFromPool();
    spriteMaskElement.setValue(this, _positions, sprite._uv, sprite._triangles, material);
    return spriteMaskElement;
  }

  _createMaterial(): Material {
    const material = new Material(this.engine, Shader.find("SpriteMask"));
    const renderState = material.renderState;
    renderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.None;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.stencilState.enabled = true;
    renderState.depthState.enabled = false;
    return material;
  }
}
