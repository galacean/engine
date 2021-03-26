import { BlendFactor, BlendOperation, CullMode, Shader } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { BlendMode } from "./enums/BlendMode";
import { RenderFace } from "./enums/RenderFace";
import { RenderQueueType } from "./enums/RenderQueueType";
import { Material } from "./Material";

export class BaseMaterial extends Material {
  private static _alphaCutoffMacro: ShaderMacro = Shader.getMacroByName("ALPHA_CUTOFF");
  private static _blendMacro: ShaderMacro = Shader.getMacroByName("ALPHA_BLEND");

  private _isTransparent: boolean = false;
  private _alphaCutoff: number = 0;
  private _renderFace: RenderFace = RenderFace.Front;
  private _blendMode: BlendMode = BlendMode.Normal;

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

    const {
      depthState,
      blendState: { targetBlendState }
    } = this.renderState;

    if (value) {
      this.shaderData.enableMacro(BaseMaterial._blendMacro);
      targetBlendState.enabled = true;
      this.blendMode = this._blendMode;
      depthState.writeEnabled = false;
      this.renderQueueType = RenderQueueType.Transparent;
    } else {
      this.shaderData.disableMacro(BaseMaterial._blendMacro);
      targetBlendState.enabled = false;
      depthState.writeEnabled = true;
      this.renderQueueType = this._alphaCutoff ? RenderQueueType.AlphaTest : RenderQueueType.Opaque;
    }
  }

  /**
   * Alpha cutoff value.
   * @remarks
   * Fragments with alpha channel lower than cutoff value will be discarded.
   * `0` means no fragment will be discarded.
   */
  get alphaCutoff(): number {
    return this._alphaCutoff;
  }

  set alphaCutoff(value: number) {
    if (value === this._alphaCutoff) return;
    this._alphaCutoff = value;

    if (value > 0) {
      this.shaderData.enableMacro(BaseMaterial._alphaCutoffMacro);
      this.renderQueueType = this._isTransparent ? RenderQueueType.Transparent : RenderQueueType.AlphaTest;
    } else {
      this.shaderData.disableMacro(BaseMaterial._alphaCutoffMacro);
      this.renderQueueType = this._isTransparent ? RenderQueueType.Transparent : RenderQueueType.Opaque;
    }

    this.shaderData.setFloat("u_alphaCutoff", value);
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
        target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
        target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
        break;
      case BlendMode.Additive:
        target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
        target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.One;
        target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
        break;
    }
  }
}
