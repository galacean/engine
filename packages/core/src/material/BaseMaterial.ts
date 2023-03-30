import { Engine } from "../Engine";
import { BlendFactor, BlendOperation, CullMode, Shader } from "../shader";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { ShaderMacro } from "../shader/ShaderMacro";
import { RenderState } from "../shader/state/RenderState";
import { BlendMode } from "./enums/BlendMode";
import { RenderFace } from "./enums/RenderFace";
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
  protected static _transparentMacro: ShaderMacro = Shader.getMacroByName("OASIS_TRANSPARENT");

  private static _alphaCutoffProp = Shader.getPropertyByName("u_alphaCutoff");
  private static _alphaCutoffMacro: ShaderMacro = Shader.getMacroByName("ALPHA_CUTOFF");

  private _renderFace: RenderFace = RenderFace.Front;
  private _isTransparent: boolean = false;
  private _blendMode: BlendMode = BlendMode.Normal;

  /**
   * Shader used by the material.
   */
  get shader(): Shader {
    return this._shader;
  }

  set shader(value: Shader) {
    this._shader = value;

    const renderStates = this._renderStates;
    const lastStatesCount = renderStates.length;
    const passCount = value.passes.length;

    if (lastStatesCount < passCount) {
      for (let i = lastStatesCount; i < passCount; i++) {
        renderStates.push(new RenderState());
        this.setBlendMode(i, BlendMode.Normal);
      }
    } else {
      renderStates.length = passCount;
    }
  }

  /**
   * Whethor transparent of first shader pass render state.
   */
  get isTransparent(): boolean {
    return this._isTransparent;
  }

  set isTransparent(value: boolean) {
    if (value !== this._isTransparent) {
      this.setIsTransparent(0, value);
      this._isTransparent = value;
    }
  }

  /**
   * Blend mode of first shader pass render state.
   * @remarks Only take effect when `isTransparent` is `true`.
   */
  get blendMode(): BlendMode {
    return this._blendMode;
  }

  set blendMode(value: BlendMode) {
    if (value !== this._blendMode) {
      this.setBlendMode(0, value);
      this._blendMode = value;
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
    const { shaderData } = this;
    if (shaderData.getFloat(BaseMaterial._alphaCutoffProp) !== value) {
      if (value) {
        shaderData.enableMacro(BaseMaterial._alphaCutoffMacro);
      } else {
        shaderData.disableMacro(BaseMaterial._alphaCutoffMacro);
      }

      const { renderStates } = this;
      for (let i = 0, n = renderStates.length; i < n; i++) {
        const renderState = renderStates[i];
        if (value > 0) {
          renderState.renderQueueType = renderState.blendState.targetBlendState.enabled
            ? RenderQueueType.Transparent
            : RenderQueueType.AlphaTest;
        } else {
          renderState.renderQueueType = renderState.blendState.targetBlendState.enabled
            ? RenderQueueType.Transparent
            : RenderQueueType.Opaque;
        }
      }

      shaderData.setFloat(BaseMaterial._alphaCutoffProp, value);
    }
  }

  /**
   * Face for render of first shader pass render state.
   */
  get renderFace(): RenderFace {
    return this._renderFace;
  }

  set renderFace(value: RenderFace) {
    if (value !== this._renderFace) {
      this.setRenderFace(0, value);
      this._renderFace = value;
    }
  }

  /**
   * Create a BaseMaterial instance.
   * @param engine - Engine to which the material belongs
   * @param shader - Shader used by the material
   */
  constructor(engine: Engine, shader: Shader) {
    super(engine, shader);
    this.shaderData.setFloat(BaseMaterial._alphaCutoffProp, 0);
  }

  /**
   * Set if is transparent of the shader pass render state.
   * @param passIndex - Shader pass index
   * @param isTransparent - If is transparent
   */
  setIsTransparent(passIndex: number, isTransparent: boolean): void {
    const { renderStates } = this;
    if (renderStates.length < passIndex) {
      throw "Pass should less than pass count.";
    }
    const renderState = renderStates[passIndex];

    if (isTransparent) {
      renderState.blendState.targetBlendState.enabled = true;
      renderState.depthState.writeEnabled = false;
      renderState.renderQueueType = RenderQueueType.Transparent;
      this.shaderData.enableMacro(BaseMaterial._transparentMacro);
    } else {
      renderState.blendState.targetBlendState.enabled = false;
      renderState.depthState.writeEnabled = true;
      renderState.renderQueueType = this.shaderData.getFloat(BaseMaterial._alphaCutoffProp)
        ? RenderQueueType.AlphaTest
        : RenderQueueType.Opaque;
      this.shaderData.disableMacro(BaseMaterial._transparentMacro);
    }
  }

  /**
   * Set the blend mode of shader pass render state.
   * @param passIndex - Shader pass index
   * @param blendMode - Blend mode
   */
  setBlendMode(passIndex: number, blendMode: BlendMode): void {
    const { renderStates } = this;
    if (renderStates.length < passIndex) {
      throw "Pass should less than pass count.";
    }
    const { targetBlendState: target } = renderStates[passIndex].blendState;

    switch (blendMode) {
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
   * Set the render face of shader pass render state.
   * @param passIndex - Shader pass index
   * @param renderFace - Render face
   */
  setRenderFace(passIndex: number, renderFace: RenderFace): void {
    const { renderStates } = this;
    if (renderStates.length < passIndex) {
      throw "Pass should less than pass count.";
    }

    switch (renderFace) {
      case RenderFace.Front:
        renderStates[passIndex].rasterState.cullMode = CullMode.Back;
        break;
      case RenderFace.Back:
        renderStates[passIndex].rasterState.cullMode = CullMode.Front;
        break;
      case RenderFace.Double:
        renderStates[passIndex].rasterState.cullMode = CullMode.Off;
        break;
    }
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
