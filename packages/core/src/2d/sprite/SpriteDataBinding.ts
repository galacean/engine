import { ShaderProperty } from "../../shader/ShaderProperty";
import { ShaderData } from "../../shader/ShaderData";
import { SpriteModifyFlags } from "../enums/SpriteModifyFlags";
import { Sprite } from "./Sprite";

/**
 * Minimal host interface required by SpriteDataBinding.
 * Both Renderer and UIRenderer satisfy this.
 */
export interface ISpriteDataBindingOwner {
  shaderData: ShaderData;
  _addResourceReferCount(resource: any, count: number): void;
}

/**
 * Manages sprite reference lifecycle: ref counting, change listener registration,
 * and texture shader property binding.
 *
 * Shared by SpriteRenderable (SpriteRenderer/Image) and future SpriteMaskRenderable (SpriteMask/UIMask).
 * Does NOT own _subChunk or dirty flags — those stay on the host for ISpriteRenderer compatibility.
 */
export class SpriteDataBinding {
  private _sprite: Sprite = null;
  private _owner: ISpriteDataBindingOwner;
  private _textureProperty: ShaderProperty;
  private _onSpriteChanged: (type: SpriteModifyFlags | null) => void;

  /**
   * The current sprite.
   */
  get sprite(): Sprite | null {
    return this._sprite;
  }

  set sprite(value: Sprite | null) {
    const lastSprite = this._sprite;
    if (lastSprite !== value) {
      if (lastSprite) {
        this._owner._addResourceReferCount(lastSprite, -1);
        lastSprite._updateFlagManager.removeListener(this._handleSpritePropertyChange);
      }
      if (value) {
        this._owner._addResourceReferCount(value, 1);
        value._updateFlagManager.addListener(this._handleSpritePropertyChange);
        this._owner.shaderData.setTexture(this._textureProperty, value.texture);
      } else {
        this._owner.shaderData.setTexture(this._textureProperty, null);
      }
      this._sprite = value;
      // Notify: sprite instance changed (null = full change, not a specific property)
      this._onSpriteChanged(null);
    }
  }

  /**
   * @param owner - The renderer that owns this core
   * @param textureProperty - Shader property for texture binding
   * @param onSpriteChanged - Callback for sprite changes. `null` type = sprite instance replaced; otherwise specific property changed.
   *                          texture and destroy are handled internally and NOT forwarded.
   */
  constructor(
    owner: ISpriteDataBindingOwner,
    textureProperty: ShaderProperty,
    onSpriteChanged: (type: SpriteModifyFlags | null) => void
  ) {
    this._owner = owner;
    this._textureProperty = textureProperty;
    this._onSpriteChanged = onSpriteChanged;
    this._handleSpritePropertyChange = this._handleSpritePropertyChange.bind(this);
  }

  /**
   * Clone sprite reference to target core. Triggers target's setter (ref counting + listener).
   */
  cloneTo(target: SpriteDataBinding): void {
    target.sprite = this._sprite;
  }

  /**
   * Release sprite reference and listeners. Call from host's _onDestroy.
   */
  destroy(): void {
    const sprite = this._sprite;
    if (sprite) {
      this._owner._addResourceReferCount(sprite, -1);
      sprite._updateFlagManager.removeListener(this._handleSpritePropertyChange);
    }
    this._sprite = null;
    this._owner = null;
    this._onSpriteChanged = null;
  }

  /**
   * Listener for sprite property changes. Handles texture/destroy internally,
   * forwards all other changes to the behavior layer via callback.
   */
  private _handleSpritePropertyChange(type: SpriteModifyFlags): void {
    switch (type) {
      case SpriteModifyFlags.texture:
        this._owner.shaderData.setTexture(this._textureProperty, this._sprite.texture);
        break;
      case SpriteModifyFlags.destroy:
        this.sprite = null;
        break;
      default:
        this._onSpriteChanged(type);
        break;
    }
  }
}
