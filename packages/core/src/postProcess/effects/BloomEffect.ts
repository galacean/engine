import { Color, MathUtil, Vector3, Vector4 } from "@galacean/engine-math";
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
  // x: threshold (gamma), y: threshold knee, z: scatter
  private static _bloomParams = ShaderProperty.getByName("material_BloomParams");

  private _material: Material;
  private _threshold: number;
  private _scatter: number;
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
      const thresholdKnee = value * 0.5; // Hardcoded soft knee
      const params = this._material.shaderData.getVector4(BloomEffect._bloomParams);
      params.x = value;
      params.y = thresholdKnee;
    }
  }

  /**
   * Controls the strength of the bloom filter.
   */
  intensity = 0;

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
   * Specifies the tint of the bloom filter.
   */
  tint = new Color(1, 1, 1, 1);

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

    this.threshold = 0.9;
    this.scatter = 0.7;
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

const FragPrefilter = `
varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 material_BloomParams;  // x: threshold (gamma), y: threshold knee, z: scatter

#define HALF_MAX  65504.0 // (2 - 2^-10) * 2^15
#define Threshold      material_BloomParams.x
#define ThresholdKnee  material_BloomParams.y
#define Scatter        material_BloomParams.z

float max3(float a, float b, float c){
    return max(max(a, b), c);
}

void main(){
  vec4 textureColor = texture2D(renderer_BlitTexture, v_uv);
  vec3 color = textureColor.rgb;

  // User controlled clamp to limit crazy high broken spec
  color = min(color, HALF_MAX);

  // Thresholding
  float brightness = max3(color.r, color.g, color.b);
  float softness = clamp(brightness - Threshold + ThresholdKnee, 0.0, 2.0 * ThresholdKnee);
  softness = (softness * softness) / (4.0 * ThresholdKnee + 1e-4);
  float multiplier = max(brightness - Threshold, softness) / max(brightness, 1e-4);
  color *= multiplier;

  // Clamp colors to positive once in prefilter. Encode can have a sqrt, and sqrt(-x) == NaN. Up/Downsample passes would then spread the NaN.
  color = max(color, 0.0);

  gl_FragColor = vec4(color, textureColor.a);

}
`;

Shader.create(BloomEffect.SHADER_NAME, [new ShaderPass("Bloom Prefilter", blitVs, FragPrefilter)]);
