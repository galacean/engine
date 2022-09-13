import { Engine } from "../Engine";
import { BlendFactor, BlendOperation, CullMode, Shader } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { BlendMode } from "./enums/BlendMode";
import { RenderFace } from "./enums/RenderFace";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { Material } from "./Material";

export class BaseMaterial extends Material {
  protected static _baseColorProp = Shader.getPropertyByName("u_baseColor");
  protected static _baseTextureProp = Shader.getPropertyByName("u_baseTexture");
  protected static _baseTextureMacro: ShaderMacro = Shader.getMacroByName("BASETEXTURE");
  protected static _tilingOffsetProp = Shader.getPropertyByName("u_tilingOffset");
  protected static _normalTextureProp = Shader.getPropertyByName("u_normalTexture");
  protected static _normalIntensityProp = Shader.getPropertyByName("u_normalIntensity");
  protected static _normalTextureMacro: ShaderMacro = Shader.getMacroByName("NORMALTEXTURE");
  protected static _emissiveColorProp = Shader.getPropertyByName("u_emissiveColor");
  protected static _emissiveTextureProp = Shader.getPropertyByName("u_emissiveTexture");
  protected static _emissiveTextureMacro: ShaderMacro = Shader.getMacroByName("EMISSIVETEXTURE");

  private static _alphaCutoffProp = Shader.getPropertyByName("u_alphaCutoff");
  private static _alphaCutoffMacro: ShaderMacro = Shader.getMacroByName("ALPHA_CUTOFF");

  private _renderFace: RenderFace = RenderFace.Front;
  private _isTransparent: boolean = false;
  private _blendMode: BlendMode;

  /**
   * Is this material transparent.
   * @remarks
   * If material is transparent, transparent blend mode will be affected by `blendMode`, default is `BlendMode.Normal`.
   */
  get isTransparent(): boolean {
    return this._isTransparent;
  }

  set isTransparent(value: boolean) {
    if (value === this._isTransparent) return;
    this._isTransparent = value;

    const renderState = this.renderState;
    if (value) {
      renderState.blendState.targetBlendState.enabled = true;
      renderState.depthState.writeEnabled = false;
      renderState.renderQueueType = RenderQueueType.Transparent;
    } else {
      renderState.blendState.targetBlendState.enabled = false;
      renderState.depthState.writeEnabled = true;
      renderState.renderQueueType = this.shaderData.getFloat(BaseMaterial._alphaCutoffProp)
        ? RenderQueueType.AlphaTest
        : RenderQueueType.Opaque;
    }
  }

  /**
   * Alpha cutoff value.
   * @remarks
   * Fragments with alpha channel lower than cutoff value will be discarded.
   * `0` means no fragment will be discarded.
   */
  get alphaCutoff(): number {
    return this.shaderData.getFloat(BaseMaterial._alphaCutoffProp);
  }

  set alphaCutoff(value: number) {
    this.shaderData.setFloat(BaseMaterial._alphaCutoffProp, value);

    if (value > 0) {
      this.shaderData.enableMacro(BaseMaterial._alphaCutoffMacro);
      this.renderState.renderQueueType = this._isTransparent ? RenderQueueType.Transparent : RenderQueueType.AlphaTest;
    } else {
      this.shaderData.disableMacro(BaseMaterial._alphaCutoffMacro);
      this.renderState.renderQueueType = this._isTransparent ? RenderQueueType.Transparent : RenderQueueType.Opaque;
    }
  }

  /**
   * Set which face for render.
   */
  get renderFace(): RenderFace {
    return this._renderFace;
  }

  set renderFace(value: RenderFace) {
    if (value === this._renderFace) return;
    this._renderFace = value;

    switch (value) {
      case RenderFace.Front:
        this.renderState.rasterState.cullMode = CullMode.Back;
        break;
      case RenderFace.Back:
        this.renderState.rasterState.cullMode = CullMode.Front;
        break;
      case RenderFace.Double:
        this.renderState.rasterState.cullMode = CullMode.Off;
        break;
    }
  }

  /**
   * Alpha blend mode.
   * @remarks
   * Only take effect when `isTransparent` is `true`.
   */
  get blendMode(): BlendMode {
    return this._blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value === this._blendMode) return;
    this._blendMode = value;

    const {
      blendState: { targetBlendState: target }
    } = this.renderState;

    switch (value) {
      case BlendMode.Normal:
        target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
        target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        target.sourceAlphaBlendFactor = BlendFactor.One;
        target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
        break;
      case BlendMode.Additive:
        target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
        target.destinationColorBlendFactor = BlendFactor.One;
        target.sourceAlphaBlendFactor = BlendFactor.One;
        target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
        break;
    }
  }

  /**
   * Create a BaseMaterial instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, shader: Shader) {
    super(engine, shader);
    this.blendMode = BlendMode.Normal;
    this.shaderData.setFloat(BaseMaterial._alphaCutoffProp, 0);
  }

  /**
   * @override
   * Clone and return the instance.
   */
  clone(): BaseMaterial {
    const dest = new BaseMaterial(this._engine, this.shader);
    this.cloneTo(dest);
    return dest;
  }

  /**
   * @override
   * Clone to the target material.
   * @param target - target material
   */
  cloneTo(target: BaseMaterial): void {
    super.cloneTo(target);
    target._renderFace = this._renderFace;
    target._isTransparent = this._isTransparent;
    target._blendMode = this._blendMode;
  }
}
