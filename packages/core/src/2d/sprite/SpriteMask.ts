import { assignmentClone, ignoreClone } from "../../clone/CloneManager";
import { Component } from "../../Component";
import { Material } from "../../material";
import { SpriteMaskManager } from "../../RenderPipeline/SpriteMaskManager";
import { Shader } from "../../shader";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Sprite } from "./Sprite";

/**
 * A component for masking Sprites.
 */
export class SpriteMask extends Component {
  private static _material: Material = null;

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

  _onEnable(): void {
    const manager = SpriteMaskManager.instance;
    manager.addMask(this);
  }

  _onDisable(): void {
    const manager = SpriteMaskManager.instance;
    manager.removeMask(this);
  }

  getMaterial(): Material {
    if (!SpriteMask._material) {
      // Create default material
      const material = (SpriteMask._material = new Material(this.scene.engine, Shader.find("SpriteMask")));
      // const target = material.renderState.blendState.targetBlendState;
      // target.enabled = true;
      // target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
      // target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
      // target.sourceAlphaBlendFactor = BlendFactor.One;
      // target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      // target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
      // material.renderState.depthState.writeEnabled = false;
      // material.renderQueueType = RenderQueueType.Transparent;
      // material.renderState.rasterState.cullMode = CullMode.Off;
    }

    return SpriteMask._material;
  }
}
