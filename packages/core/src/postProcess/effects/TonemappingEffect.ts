import { Engine } from "../../Engine";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Material } from "../../material";
import { Shader } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { RenderTarget, Texture2D } from "../../texture";
import { PostProcessEffect } from "../PostProcessEffect";

/**
 * Options to select a tonemapping algorithm to use.
 */
export enum TonemappingMode {
  /**
   * Use this option if you do not want to apply tonemapping
   */
  None,
  /**
   * Neutral tonemapper
   * @remarks Use this option if you only want range-remapping with minimal impact on color hue and saturation.
   */
  Neutral,

  /**
   * ACES Filmic reference tonemapper (custom approximation)
   * @remarks
   * Use this option to apply a close approximation of the reference ACES tonemapper for a more filmic look.
   * It is more contrasted than Neutral and has an effect on actual color hue and saturation.
   */
  ACES
}

export class TonemappingEffect extends PostProcessEffect {
  static readonly SHADER_NAME = "postProcessEffect-tonemapping";

  private _mode: TonemappingMode;
  private _material: Material;

  /**
   * Use this to select a tonemapping algorithm to use.
   */
  get mode(): TonemappingMode {
    return this._mode;
  }

  set mode(value: TonemappingMode) {
    if (value !== this._mode) {
      this._mode = value;
      this._material.shaderData.enableMacro("TONEMAPPING_MODE", value.toString());
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._material = new Material(engine, shader);
    this.mode = TonemappingMode.Neutral;
  }

  override onRender(context: RenderContext, srcTexture: Texture2D, destRenderTarget: RenderTarget): void {
    PipelineUtils.blitTexture(this.engine, srcTexture, destRenderTarget, undefined, undefined, this._material);
  }
}

const shader = Shader.create(
  TonemappingEffect.SHADER_NAME,
  blitVs,
  `
  varying vec2 v_uv;
	uniform sampler2D renderer_BlitTexture;

  #define saturate( a ) clamp( a, 0.0, 1.0 )

  vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
  }

  vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
  }

  
  // Neutral tonemapping (Hable/Hejl/Frostbite)
  // Input is linear RGB
  // More accuracy to avoid NaN on extremely high values.
  vec3 neutralCurve(vec3 x, float a, float b, float c, float d, float e, float f){
      return vec3(((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f);
  }
  
  #define TONEMAPPING_CLAMP_MAX 435.18712 //(-b + sqrt(b * b - 4 * a * (HALF_MAX - d * f))) / (2 * a * whiteScale)

  vec3 neutralTonemap(vec3 x){
    // Tonemap
    float a = 0.2;
    float b = 0.29;
    float c = 0.24;
    float d = 0.272;
    float e = 0.02;
    float f = 0.3;
    vec3 whiteLevel = vec3(5.3);
    vec3 whiteClip = vec3(1.0);

    x = min(x, TONEMAPPING_CLAMP_MAX);

    vec3 whiteScale = 1.0 / neutralCurve(whiteLevel, a, b, c, d, e, f);
    x = neutralCurve(x * whiteScale, a, b, c, d, e, f);
    x *= whiteScale;

    // Post-curve white point adjustment
    x /= whiteClip;

    return x;
  }


	void main(){
		vec4 color = texture2D(renderer_BlitTexture, v_uv);
    
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      color = gammaToLinear(color);
    #endif 

    #if TONEMAPPING_MODE == 1
      color.rgb = neutralTonemap(color.rgb);
    #elif TONEMAPPING_MODE == 2
      // color.rgb = AcesTonemap(aces);
    #endif

    gl_FragColor = color;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif

	}
`
);
