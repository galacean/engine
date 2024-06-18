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
  private static _dirtMacro: ShaderMacro = ShaderMacro.getByName("BLOOM_DIRT");
  // x: threshold (linear), y: threshold knee, z: scatter, w: intensity
  private static _bloomParams = ShaderProperty.getByName("material_BloomParams");
  private static _tintProp = ShaderProperty.getByName("material_BloomTint");
  private static _bloomTextureProp = ShaderProperty.getByName("material_BloomTexture");
  private static _dirtTextureProp = ShaderProperty.getByName("material_BloomDirtTexture");
  private static _dirtIntensityProp = ShaderProperty.getByName("material_BloomDirtIntensity");
  private static _dirtTilingOffsetProp = ShaderProperty.getByName("material_BloomDirtTilingOffset");
  private static _lowMipTextureProp = ShaderProperty.getByName("material_lowMipTexture");
  // x: 1/width, y: 1/height, z: width, w: height
  private static _lowMipTexelSizeProp = ShaderProperty.getByName("material_lowMipTexelSize");

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
   * Specifies the tint of the bloom effect.
   */
  get tint(): Color {
    return this._material.shaderData.getColor(BloomEffect._tintProp);
  }

  set tint(value: Color) {
    const tint = this._material.shaderData.getColor(BloomEffect._tintProp);
    if (value !== tint) {
      tint.copyFrom(value);
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
    this._highQualityFiltering = value;
    if (value) {
      this._material.shaderData.enableMacro(BloomEffect._hqMacro);
    } else {
      this._material.shaderData.disableMacro(BloomEffect._hqMacro);
    }
  }

  /**
   * Specifies a Texture to add smudges or dust to the bloom effect.
   */
  get dirtTexture(): Texture2D {
    return <Texture2D>this._material.shaderData.getTexture(BloomEffect._dirtTextureProp);
  }

  set dirtTexture(value: Texture2D) {
    this._material.shaderData.setTexture(BloomEffect._dirtTextureProp, value);
    if (value) {
      this._material.shaderData.enableMacro(BloomEffect._dirtMacro);
    } else {
      this._material.shaderData.disableMacro(BloomEffect._dirtMacro);
    }
  }

  /**
   * Controls the strength of the lens dirt.
   */
  get dirtIntensity(): number {
    return this._material.shaderData.getFloat(BloomEffect._dirtIntensityProp);
  }

  set dirtIntensity(value: number) {
    this._material.shaderData.setFloat(BloomEffect._dirtIntensityProp, value);
  }

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
    this.dirtIntensity = 1;
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

const fragCommonFunction = `
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

  vec2 BSpline3MiddleLeft(vec2 x){
    return 0.16666667 + x * (0.5 + x * (0.5 - x * 0.5));
  }

  vec2 BSpline3MiddleRight(vec2 x){
      return 0.66666667 + x * (-1.0 + 0.5 * x) * x;
  }

  vec2 BSpline3Rightmost(vec2 x){
      return 0.16666667 + x * (-0.5 + x * (0.5 - x * 0.16666667));
  }

  // Compute weights & offsets for 4x bilinear taps for the bicubic B-Spline filter.
  // The fractional coordinate should be in the [0, 1] range (centered on 0.5).
  // Inspired by: http://vec3.ca/bicubic-filtering-in-fewer-taps/
  void BicubicFilter(vec2 fracCoord, out vec2 weights[2], out vec2 offsets[2]){
      vec2 r  = BSpline3Rightmost(fracCoord);
      vec2 mr = BSpline3MiddleRight(fracCoord);
      vec2 ml = BSpline3MiddleLeft(fracCoord);
      vec2 l  = 1.0 - mr - ml - r;

      weights[0] = r + mr;
      weights[1] = ml + l;
      offsets[0] = -1.0 + mr / weights[0];
      offsets[1] =  1.0 + l / weights[1];
  }


  // texSize: (1/width, 1/height, width, height)
  vec4 SampleTexture2DBicubic(sampler2D tex, vec2 coord, vec4 texSize){
      vec2 xy = coord * texSize.zw + 0.5;
      vec2 ic = floor(xy);
      vec2 fc = fract(xy);

      vec2 weights[2], offsets[2];
      BicubicFilter(fc, weights, offsets);

      return weights[0].y * (weights[0].x * sampleTexture(tex, (ic + vec2(offsets[0].x, offsets[0].y) - 0.5) * texSize.xy)  +
                             weights[1].x * sampleTexture(tex, (ic + vec2(offsets[1].x, offsets[0].y) - 0.5) * texSize.xy)) +
             weights[1].y * (weights[0].x * sampleTexture(tex, (ic + vec2(offsets[0].x, offsets[1].y) - 0.5) * texSize.xy)  +
                             weights[1].x * sampleTexture(tex, (ic + vec2(offsets[1].x, offsets[1].y) - 0.5) * texSize.xy));
  }
`;

const fragPrefilter = `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;
  uniform vec4 material_BloomParams;  // x: threshold (linear), y: threshold knee, z: scatter, w: intensity
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

  #define HALF_MAX  65504.0 // (2 - 2^-10) * 2^15

  float max3(float a, float b, float c){
      return max(max(a, b), c);
  }

  ${fragCommonFunction}

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
    float threshold = material_BloomParams.x;
    float thresholdKnee = material_BloomParams.y;
    mediump float softness = clamp(brightness - threshold + thresholdKnee, 0.0, 2.0 * thresholdKnee);
    softness = (softness * softness) / (4.0 * thresholdKnee + 1e-4);
    mediump float multiplier = max(brightness - threshold, softness) / max(brightness, 1e-4);
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
  uniform sampler2D renderer_BlitTexture;
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

  ${fragCommonFunction}

  void main(){
    vec2 texelSize = renderer_texelSize.xy * 2.0;

    // 9-tap gaussian blur on the downsampled source
    mediump vec4 c0 = sampleTexture(renderer_BlitTexture, v_uv - vec2(texelSize.x * 4.0, 0.0));
    mediump vec4 c1 = sampleTexture(renderer_BlitTexture, v_uv - vec2(texelSize.x * 3.0, 0.0));
    mediump vec4 c2 = sampleTexture(renderer_BlitTexture, v_uv - vec2(texelSize.x * 2.0, 0.0));
    mediump vec4 c3 = sampleTexture(renderer_BlitTexture, v_uv - vec2(texelSize.x * 1.0, 0.0));
    mediump vec4 c4 = sampleTexture(renderer_BlitTexture, v_uv);
    mediump vec4 c5 = sampleTexture(renderer_BlitTexture, v_uv + vec2(texelSize.x * 1.0, 0.0));
    mediump vec4 c6 = sampleTexture(renderer_BlitTexture, v_uv + vec2(texelSize.x * 2.0, 0.0));
    mediump vec4 c7 = sampleTexture(renderer_BlitTexture, v_uv + vec2(texelSize.x * 3.0, 0.0));
    mediump vec4 c8 = sampleTexture(renderer_BlitTexture, v_uv + vec2(texelSize.x * 4.0, 0.0));

    gl_FragColor = c0 * 0.01621622 + c1 * 0.05405405 + c2 * 0.12162162 + c3 * 0.19459459
                + c4 * 0.22702703
                + c5 * 0.19459459 + c6 * 0.12162162 + c7 * 0.05405405 + c8 * 0.01621622;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif
  }
`;

const fragBlurV = `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

  ${fragCommonFunction}

  void main(){
    vec2 texelSize = renderer_texelSize.xy * 2.0;

    // Optimized bilinear 5-tap gaussian on the same-sized source (9-tap equivalent)
    mediump vec4 c0 = sampleTexture(renderer_BlitTexture, v_uv - vec2(0.0, vec2(texelSize.y * 3.23076923));
    mediump vec4 c1 = sampleTexture(renderer_BlitTexture, v_uv - vec2(0.0, vec2(texelSize.y * 1.38461538));
    mediump vec4 c2 = sampleTexture(renderer_BlitTexture, v_uv);
    mediump vec4 c3 = sampleTexture(renderer_BlitTexture, v_uv + vec2(0.0, vec2(texelSize.y * 1.38461538));
    mediump vec4 c4 = sampleTexture(renderer_BlitTexture, v_uv + vec2(0.0, vec2(texelSize.y * 3.23076923));

    gl_FragColor = c0 * 0.07027027 + c1 * 0.31621622
                        + c2 * 0.22702703
                        + c3 * 0.31621622 + c4 * 0.07027027;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif
  }
`;

const fragUpsample = `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;
  uniform sampler2D material_lowMipTexture;
  uniform vec4 material_BloomParams;        // x: threshold (linear), y: threshold knee, z: scatter, w: intensity
  uniform vec4 material_lowMipTexelSize;    // x: 1/width, y: 1/height, z: width, w: height

  ${fragCommonFunction}

  void main(){
    mediump vec4 highMip = sampleTexture(renderer_BlitTexture, v_uv);

    #ifdef BLOOM_HQ
      mediump vec4 lowMip = SampleTexture2DBicubic(material_lowMipTexture, v_uv, material_lowMipTexelSize);
    #else
      mediump vec4 lowMip = sampleTexture(material_lowMipTexture, v_uv);
    #endif
    
    gl_FragColor = mix(highMip, lowMip, material_BloomParams.z);
  
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif
  }
`;

const fragUber = `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;
  uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height
  uniform vec4 material_BloomParams;  // x: threshold (linear), y: threshold knee, z: scatter, w: intensity
  uniform sampler2D material_BloomTexture;
  uniform sampler2D material_BloomDirtTexture;
  uniform vec4 material_BloomTint;
  uniform vec4 material_BloomDirtTilingOffset;
  uniform float material_BloomDirtIntensity;

  ${fragCommonFunction}

  void main(){
    mediump vec4 color = vec4(0.0);

    #ifdef BLOOM_HQ
      mediump vec4 bloom = SampleTexture2DBicubic(material_BloomTexture, v_uv, renderer_texelSize);
    #else
      mediump vec4 bloom = sampleTexture(material_BloomTexture, v_uv);
    #endif

    bloom *= material_BloomParams.w;
    color += bloom * material_BloomTint;

    #ifdef BLOOM_DIRT
      mediump vec4 dirt = sampleTexture(material_BloomDirtTexture, v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw).xyz;
      dirt *= material_BloomDirtIntensity;
      // Additive bloom (artist friendly)
      color += dirt * bloom;
    #endif

    gl_FragColor = color;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif

  }
`;

//@todo: use shaderLab
Shader.create(BloomEffect.SHADER_NAME, [
  new ShaderPass("Bloom Prefilter", blitVs, fragPrefilter),
  new ShaderPass("Bloom Blur Horizontal", blitVs, fragBlurH),
  new ShaderPass("Bloom Blur Vertical", blitVs, fragBlurV),
  new ShaderPass("Bloom Upsample", blitVs, fragUpsample),
  new ShaderPass("Bloom Uber", blitVs, fragUber)
]);
