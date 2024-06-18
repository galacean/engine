import { Color, MathUtil, Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Material } from "../../material";
import { Shader, ShaderMacro, ShaderPass, ShaderProperty } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { Texture2D } from "../../texture";
import { PostProcessEffect } from "../PostProcessEffect";

export class BloomEffect extends PostProcessEffect {
  static readonly SHADER_NAME = "postProcessEffect-bloom";

  private static _hqMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_HQ");
  // x: threshold (gamma), y: threshold knee, z: scatter, w:intensity
  private static _bloomParams = ShaderProperty.getByName("material_BloomParams");
  private static _tintProp = ShaderProperty.getByName("material_BloomTint");

  private _material: Material;
  private _threshold: number;
  private _scatter: number;
  private _intensity: number;
  private _highQualityFiltering = false;

  /**
   * Set the level of brightness to filter out pixels under this level.
   * @remarks This value is expressed in gamma-space.
   */

  get threshold(): number {
    return this._threshold;
  }

  set threshold(value: number) {
    if (value !== this._threshold) {
      this._threshold = value;
      const threshold = Color.gammaToLinearSpace(value);
      const thresholdKnee = threshold * 0.5; // Hardcoded soft knee
      const params = this._material.shaderData.getVector4(BloomEffect._bloomParams);
      params.x = threshold;
      params.y = thresholdKnee;
    }
  }

  /**
   * Controls the strength of the bloom effect.
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    if (value !== this._intensity) {
      this._intensity = value;
      const params = this._material.shaderData.getVector4(BloomEffect._bloomParams);
      params.w = value;
    }
  }

  /**
   * Controls the radius of the bloom effect.
   */
  get scatter(): number {
    return this._scatter;
  }

  set scatter(value: number) {
    if (value !== this._scatter) {
      this._scatter = value;
      const params = this._material.shaderData.getVector4(BloomEffect._bloomParams);
      const scatter = MathUtil.lerp(0.05, 0.95, value);
      params.z = scatter;
    }
  }

  /**
   * Specifies the tint of the bloom effect.
   */
  get tint(): Color {
    return this._material.shaderData.getColor(BloomEffect._tintProp);
  }

  set tint(value: Color) {
    const tintColor = this._material.shaderData.getColor(BloomEffect._tintProp);
    if (value !== tintColor) {
      tintColor.copyFrom(value);
    }
  }

  /**
   * Controls whether to use bicubic sampling instead of bilinear sampling for the upSampling passes.
   * @remarks This is slightly more expensive but helps getting smoother visuals.
   */

  get highQualityFiltering(): boolean {
    return this._highQualityFiltering;
  }

  set highQualityFiltering(value: boolean) {
    if (value !== this._highQualityFiltering) {
      this._highQualityFiltering = value;
      if (value) {
        this._material.shaderData.enableMacro(BloomEffect._hqMacro);
      } else {
        this._material.shaderData.disableMacro(BloomEffect._hqMacro);
      }
    }
  }

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  dirtTexture: Texture2D;

  /**
   * Controls the strength of the lens dirt.
   */
  dirtIntensity = 0;

  constructor(engine: Engine) {
    super(engine);
    this._material = new Material(engine, Shader.find(BloomEffect.SHADER_NAME));
    const depthState = this._material.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    const shaderData = this._material.shaderData;
    shaderData.setVector4(BloomEffect._bloomParams, new Vector4());
    shaderData.setColor(BloomEffect._tintProp, new Color(1, 1, 1, 1));

    this.threshold = 0.9;
    this.scatter = 0.7;
    this.intensity = 1;
  }

  override onRender(context: RenderContext): void {
    PipelineUtils.blitTexture(
      this.engine,
      <Texture2D>context.srcRT.getColorTexture(0),
      context.destRT,
      undefined,
      undefined,
      this._material
    );
  }
}

const fragPrefilter = `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;
  uniform vec4 material_BloomParams;  // x: threshold (gamma), y: threshold knee, z: scatter, w: intensity
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

  #define HALF_MAX  65504.0 // (2 - 2^-10) * 2^15
  #define Threshold      material_BloomParams.x
  #define ThresholdKnee  material_BloomParams.y

  float max3(float a, float b, float c){
      return max(max(a, b), c);
  }

  vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
  }

  vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
  }

  vec4 sampleTexture(sampler2D tex, vec2 uv){
    vec4 color = texture2D(tex, uv);

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      color = gammaToLinear(color);
    #endif 

    return color;
  }

  void main(){
    #ifdef BLOOM_HQ
      vec2 texelSize = renderer_texelSize.xy;
      mediump vec4 A = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, -1.0));
      mediump vec4 B = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, -1.0));
      mediump vec4 C = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, -1.0));
      mediump vec4 D = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, -0.5));
      mediump vec4 E = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, -0.5));
      mediump vec4 F = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 0.0));
      mediump vec4 G = sampleTexture(renderer_BlitTexture, v_uv);
      mediump vec4 H = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 0.0));
      mediump vec4 I = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, 0.5));
      mediump vec4 J = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, 0.5));
      mediump vec4 K = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 1.0));
      mediump vec4 L = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, 1.0));
      mediump vec4 M = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 1.0));

      mediump vec2 scale = vec2(0.5, 0.125);
      mediump vec2 div = (1.0 / 4.0) * scale;

      mediump vec4 samplerColor = (D + E + I + J) * div.x;
      samplerColor += (A + B + G + F) * div.y;
      samplerColor += (B + C + H + G) * div.y;
      samplerColor += (F + G + L + K) * div.y;
      samplerColor += (G + H + M + L) * div.y;
    #else
      mediump vec4 samplerColor = sampleTexture(renderer_BlitTexture, v_uv);
    #endif

    mediump vec3 color = samplerColor.rgb;

    // User controlled clamp to limit crazy high broken spec
    color = min(color, HALF_MAX);

    // Thresholding
    mediump float brightness = max3(color.r, color.g, color.b);
    mediump float softness = clamp(brightness - Threshold + ThresholdKnee, 0.0, 2.0 * ThresholdKnee);
    softness = (softness * softness) / (4.0 * ThresholdKnee + 1e-4);
    mediump float multiplier = max(brightness - Threshold, softness) / max(brightness, 1e-4);
    color *= multiplier;

    // Clamp colors to positive once in prefilter. Encode can have a sqrt, and sqrt(-x) == NaN. Up/Downsample passes would then spread the NaN.
    color = max(color, 0.0);

    gl_FragColor = vec4(color, samplerColor.a);
    
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif
  }
`;

const fragBlurH = `
  varying vec2 v_uv;
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

  void main(){

  }
`;

const fragBlurV = `
`;

const fragUpsample = `
`;

const fragUber = `
`;

Shader.create(BloomEffect.SHADER_NAME, [
  new ShaderPass("Bloom Prefilter", blitVs, fragPrefilter),
  new ShaderPass("Bloom Blur Horizontal", blitVs, fragBlurH),
  new ShaderPass("Bloom Blur Vertical", blitVs, fragBlurV),
  new ShaderPass("Bloom Upsample", blitVs, fragUpsample),
  new ShaderPass("Bloom Uber", blitVs, fragUber)
]);
