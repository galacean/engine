import { Color } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { BlendFactor } from "../shader/enums/BlendFactor";
import { BlendOperation } from "../shader/enums/BlendOperation";
import { CullMode } from "../shader/enums/CullMode";
import { Shader } from "../shader/Shader";
import { Texture2D } from "../texture/Texture2D";
import { AlphaMode } from "./enums/AlphaMode";
import { RenderQueueType } from "./enums/RenderQueueType";
import { Material } from "./Material";

/**
 * Unlit Material.
 */
export class UnlitMaterial extends Material {
  /**
   * Base color.
   */
  get baseColor(): Color {
    return this._baseColor;
  }

  set baseColor(value: Color) {
    this._baseColor = value;
    this.shaderData.setColor("u_baseColor", value);
  }

  /**
   * Base color texture.
   */
  get baseColorTexture(): Texture2D {
    return this._baseColorTexture;
  }

  set baseColorTexture(value: Texture2D) {
    this._baseColorTexture = value;

    if (value) {
      this.shaderData.enableMacro("O3_BASECOLOR_TEXTURE");
      this.shaderData.setTexture("u_baseColorTexture", value);
    } else {
      this.shaderData.disableMacro("O3_BASECOLOR_TEXTURE");
    }
  }

  /**
   * Transparent mode.
   */
  get alphaMode(): AlphaMode {
    return this._alphaMode;
  }

  set alphaMode(v: AlphaMode) {
    const target = this.renderState.blendState.targetBlendState;
    const depthState = this.renderState.depthState;

    switch (v) {
      case AlphaMode.Opaque:
      case AlphaMode.CutOff:
        {
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.One;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.Zero;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = true;
          this.renderQueueType = RenderQueueType.Opaque;
        }
        break;
      case AlphaMode.Blend:
        {
          target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
          target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
          target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
          depthState.writeEnabled = false;
          this.renderQueueType = RenderQueueType.Transparent;
        }
        break;
    }
  }

  /**
   * Whether to render both sides.
   * @remarks Only the front side is rendered by default
   */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(v: boolean) {
    if (v) {
      this.renderState.rasterState.cullMode = CullMode.Off;
    } else {
      this.renderState.rasterState.cullMode = CullMode.Back;
    }
  }

  private _baseColor: Color = new Color(1, 1, 1, 1);
  private _baseColorTexture: Texture2D;
  private _alphaMode: AlphaMode = AlphaMode.Opaque;
  private _doubleSided: boolean = false;

  /**
   * Create a unlit material instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, Shader.find("unlit"));
    this.shaderData.enableMacro("OMIT_NORMAL");

    this.baseColor = this._baseColor;
  }

  /**
   * @override
   */
  clone(): UnlitMaterial {
    var dest = new UnlitMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
