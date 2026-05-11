import { Engine } from "../Engine";
import { BlendFactor, CullMode, Shader, ShaderProperty } from "../shader";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { ShaderMacro } from "../shader/ShaderMacro";
import { BlendMode } from "./enums/BlendMode";
import { RenderFace } from "./enums/RenderFace";
import { Material } from "./Material";

export class BaseMaterial extends Material {
  /** @internal */
  static _shadowCasterRenderQueueProp = ShaderProperty.getByName("material_ShadowCasterRenderQueue");
  /** @internal */
  static _depthOnlyRenderQueueProp = ShaderProperty.getByName("material_DepthOnlyRenderQueue");

  protected static _baseTextureMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE");
  protected static _normalTextureMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_HAS_NORMALTEXTURE");
  protected static _emissiveTextureMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_HAS_EMISSIVETEXTURE");
  protected static _transparentMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_IS_TRANSPARENT");

  protected static _baseColorProp: ShaderProperty = ShaderProperty.getByName("material_BaseColor");
  protected static _baseTextureProp: ShaderProperty = ShaderProperty.getByName("material_BaseTexture");
  protected static _tilingOffsetProp: ShaderProperty = ShaderProperty.getByName("material_TilingOffset");
  protected static _normalTextureProp: ShaderProperty = ShaderProperty.getByName("material_NormalTexture");
  protected static _normalIntensityProp: ShaderProperty = ShaderProperty.getByName("material_NormalIntensity");
  protected static _emissiveColorProp: ShaderProperty = ShaderProperty.getByName("material_EmissiveColor");
  protected static _emissiveTextureProp: ShaderProperty = ShaderProperty.getByName("material_EmissiveTexture");

  protected static _alphaCutoffProp: ShaderProperty = ShaderProperty.getByName("material_AlphaCutoff");
  private static _alphaCutoffMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_IS_ALPHA_CUTOFF");

  private static _blendEnabledProp: ShaderProperty = ShaderProperty.getByName("blendEnabled");
  private static _depthWriteEnabledProp: ShaderProperty = ShaderProperty.getByName("depthWriteEnabled");
  private static _renderQueueTypeProp: ShaderProperty = ShaderProperty.getByName("renderQueueType");
  private static _sourceColorBlendFactorProp: ShaderProperty = ShaderProperty.getByName("sourceColorBlendFactor");
  private static _destinationColorBlendFactorProp: ShaderProperty =
    ShaderProperty.getByName("destinationColorBlendFactor");
  private static _sourceAlphaBlendFactorProp: ShaderProperty = ShaderProperty.getByName("sourceAlphaBlendFactor");
  private static _destinationAlphaBlendFactorProp: ShaderProperty =
    ShaderProperty.getByName("destinationAlphaBlendFactor");
  private static _rasterStateCullModeProp: ShaderProperty = ShaderProperty.getByName("rasterStateCullMode");

  private _renderFace: RenderFace = RenderFace.Front;
  protected _isTransparent: boolean = false;
  private _blendMode: BlendMode = BlendMode.Normal;

  /**
   * Whether transparent of first shader pass render state.
   */
  get isTransparent(): boolean {
    return this._isTransparent;
  }

  set isTransparent(value: boolean) {
    this._seIsTransparent(value);
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
      this.setBlendMode(value);
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
    this._setAlphaCutoff(value);
  }

  /**
   * Face for render of first shader pass render state.
   */
  get renderFace(): RenderFace {
    return this._renderFace;
  }

  set renderFace(value: RenderFace) {
    if (value !== this._renderFace) {
      this.setRenderFace(value);
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

    const { shaderData } = this;
    shaderData.setFloat(BaseMaterial._alphaCutoffProp, 0);
    shaderData.setFloat(BaseMaterial._shadowCasterRenderQueueProp, RenderQueueType.Opaque);
    shaderData.setFloat(BaseMaterial._depthOnlyRenderQueueProp, RenderQueueType.Opaque);

    this.setIsTransparent(false);
    this.setRenderFace(RenderFace.Front);
    this.setBlendMode(BlendMode.Normal);
  }

  /**
   * Set if is transparent of the shader pass render state.
   * @param isTransparent - If is transparent
   */
  setIsTransparent(isTransparent: boolean): void {
    const { shaderData } = this;

    if (isTransparent) {
      shaderData.setInt(BaseMaterial._blendEnabledProp, 1);
      shaderData.setInt(BaseMaterial._depthWriteEnabledProp, 0);
      shaderData.setInt(BaseMaterial._renderQueueTypeProp, RenderQueueType.Transparent);
      shaderData.enableMacro(BaseMaterial._transparentMacro);
    } else {
      shaderData.setInt(BaseMaterial._blendEnabledProp, 0);
      shaderData.setInt(BaseMaterial._depthWriteEnabledProp, 1);
      shaderData.setInt(
        BaseMaterial._renderQueueTypeProp,
        shaderData.getFloat(BaseMaterial._alphaCutoffProp) ? RenderQueueType.AlphaTest : RenderQueueType.Opaque
      );
      shaderData.disableMacro(BaseMaterial._transparentMacro);
    }
  }

  /**
   * Set the blend mode of shader pass render state.
   * @param blendMode - Blend mode
   */
  setBlendMode(blendMode: BlendMode): void {
    const { shaderData } = this;

    switch (blendMode) {
      case BlendMode.Normal:
        shaderData.setInt(BaseMaterial._sourceColorBlendFactorProp, BlendFactor.SourceAlpha);
        shaderData.setInt(BaseMaterial._destinationColorBlendFactorProp, BlendFactor.OneMinusSourceAlpha);
        shaderData.setInt(BaseMaterial._sourceAlphaBlendFactorProp, BlendFactor.One);
        shaderData.setInt(BaseMaterial._destinationAlphaBlendFactorProp, BlendFactor.OneMinusSourceAlpha);
        break;
      case BlendMode.Additive:
        shaderData.setInt(BaseMaterial._sourceColorBlendFactorProp, BlendFactor.SourceAlpha);
        shaderData.setInt(BaseMaterial._destinationColorBlendFactorProp, BlendFactor.One);
        shaderData.setInt(BaseMaterial._sourceAlphaBlendFactorProp, BlendFactor.Zero);
        shaderData.setInt(BaseMaterial._destinationAlphaBlendFactorProp, BlendFactor.One);
        break;
    }
  }

  /**
   * Set the render face of shader pass render state.
   * @param renderFace - Render face
   */
  setRenderFace(renderFace: RenderFace): void {
    const { shaderData } = this;

    switch (renderFace) {
      case RenderFace.Front:
        shaderData.setInt(BaseMaterial._rasterStateCullModeProp, CullMode.Back);
        break;
      case RenderFace.Back:
        shaderData.setInt(BaseMaterial._rasterStateCullModeProp, CullMode.Front);
        break;
      case RenderFace.Double:
        shaderData.setInt(BaseMaterial._rasterStateCullModeProp, CullMode.Off);
        break;
    }
  }

  /**
   * Clone and return the instance.
   */
  override clone(): BaseMaterial {
    const dest = new BaseMaterial(this._engine, this.shader);
    this._cloneToAndModifyName(dest);
    return dest;
  }

  /**
   * Clone to the target material.
   * @param target - target material
   */
  override cloneTo(target: BaseMaterial): void {
    super.cloneTo(target);
    target._renderFace = this._renderFace;
    target._isTransparent = this._isTransparent;
    target._blendMode = this._blendMode;
  }

  protected _seIsTransparent(value: boolean): void {
    if (value !== this._isTransparent) {
      // Forward pass
      this.setIsTransparent(value);

      // Shadow caster pass and depth only pass
      const { shaderData } = this;
      if (value) {
        // Shadow caster render queue, use alpha test queue to simulate transparent shadow
        shaderData.setFloat(BaseMaterial._shadowCasterRenderQueueProp, RenderQueueType.AlphaTest);
        // Depth only render queue
        shaderData.setFloat(BaseMaterial._depthOnlyRenderQueueProp, RenderQueueType.Transparent);
      } else {
        const alphaCutoff = shaderData.getFloat(BaseMaterial._alphaCutoffProp);
        const renderQueueType = alphaCutoff ? RenderQueueType.AlphaTest : RenderQueueType.Opaque;
        // Shadow caster render queue
        shaderData.setFloat(BaseMaterial._shadowCasterRenderQueueProp, renderQueueType);
        // Depth only render queue
        shaderData.setFloat(BaseMaterial._depthOnlyRenderQueueProp, renderQueueType);
      }

      this._isTransparent = value;
    }
  }

  protected _setAlphaCutoff(value: number): void {
    const { shaderData, _isTransparent: isTransparent } = this;

    if (shaderData.getFloat(BaseMaterial._alphaCutoffProp) !== value) {
      if (value) {
        shaderData.enableMacro(BaseMaterial._alphaCutoffMacro);

        // Forward render queue
        const forwardQueue = isTransparent ? RenderQueueType.Transparent : RenderQueueType.AlphaTest;
        shaderData.setInt(BaseMaterial._renderQueueTypeProp, forwardQueue);
        // Shadow caster render queue
        shaderData.setFloat(BaseMaterial._shadowCasterRenderQueueProp, RenderQueueType.AlphaTest);
        // Depth only render queue
        shaderData.setFloat(BaseMaterial._depthOnlyRenderQueueProp, forwardQueue);
      } else {
        shaderData.disableMacro(BaseMaterial._alphaCutoffMacro);

        // Forward render queue
        const forwardQueue = isTransparent ? RenderQueueType.Transparent : RenderQueueType.Opaque;
        shaderData.setInt(BaseMaterial._renderQueueTypeProp, forwardQueue);
        // Shadow caster render queue
        const shadowCasterQueue = isTransparent ? RenderQueueType.AlphaTest : RenderQueueType.Opaque;
        shaderData.setFloat(BaseMaterial._shadowCasterRenderQueueProp, shadowCasterQueue);
        // Depth only render queue
        shaderData.setFloat(BaseMaterial._depthOnlyRenderQueueProp, forwardQueue);
      }

      shaderData.setFloat(BaseMaterial._alphaCutoffProp, value);
    }
  }
}
