import { Vector4 } from "@galacean/engine-math";
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
    const shaderData = this._material.shaderData;

    // Those could be tweakable for the neutral tonemapper, but in the case of the LookDev we don't need that
    const k_BlackIn = 0.02;
    const k_WhiteIn = 10.0;
    const k_BlackOut = 0.0;
    const k_WhiteOut = 10.0;
    const k_WhiteLevel = 5.3;
    const k_WhiteClip = 10.0;
    const k_DialUnits = 20.0;
    const k_HalfDialUnits = k_DialUnits * 0.5;

    shaderData.setVector4(
      "material_ToneMapCoeffs1",
      new Vector4(
        k_BlackIn * k_DialUnits + 1.0,
        k_BlackOut * k_HalfDialUnits + 1.0,
        k_WhiteIn / k_DialUnits,
        1.0 - k_WhiteOut / k_DialUnits
      )
    );
    shaderData.setVector4(
      "material_ToneMapCoeffs2",
      new Vector4(0.0, 0.0, k_WhiteLevel, k_WhiteClip / k_HalfDialUnits)
    );

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
  uniform vec4 material_ToneMapCoeffs1;
  uniform vec4 material_ToneMapCoeffs2;

  #define InBlack         material_ToneMapCoeffs1.x
  #define OutBlack        material_ToneMapCoeffs1.y
  #define InWhite         material_ToneMapCoeffs1.z
  #define OutWhite        material_ToneMapCoeffs1.w
  #define WhiteLevel      material_ToneMapCoeffs2.z
  #define WhiteClip       material_ToneMapCoeffs2.w

  #define saturate( a ) clamp( a, 0.0, 1.0 )

  vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
  }

  vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
  }

  vec3 evalCurve(vec3 x, float A, float B, float C, float D, float E, float F){
      return ((x*(A*x + C*B) + D*E) / (x*(A*x + B) + D*F)) - E / F;
  }

  const mat3 AP1_2_AP0_MAT = mat3(
    vec3(0.6954522414, 0.0447945634, -0.0055258826),
    vec3(0.1406786965, 0.8596711185, 0.0040252103),
    vec3(0.1638690622, 0.0955343182, 1.0015006723));

  // ACES Color Space Conversion - ACEScg to ACES
  vec3 ACEScg_to_ACES(vec3 x){
      return AP1_2_AP0_MAT * x;
  }


  vec3 applyTonemapFilmicAD(vec3 linearColor){
      float blackRatio = InBlack / OutBlack;
      float whiteRatio = InWhite / OutWhite;

      // blend tunable coefficients
      float B = mix(0.57, 0.37, blackRatio);
      float C = mix(0.01, 0.24, whiteRatio);
      float D = mix(0.02, 0.20, blackRatio);

      // constants
      float A = 0.2;
      float E = 0.02;
      float F = 0.30;

      // eval and correct for white point
      vec3 whiteScale = 1.0 / evalCurve(vec3(WhiteLevel), A, B, C, D, E, F);
      vec3 curr = evalCurve(linearColor * whiteScale, A, B, C, D, E, F);

      return curr*whiteScale;
  }

  vec3 remapWhite(vec3 inPixel, float whitePt){
      //  var breakout for readability
      float inBlack = 0.0;
      float outBlack = 0.0;
      float inWhite = whitePt;
      float outWhite = 1.0;

      // remap input range to output range
      vec3 outPixel = ((inPixel.rgb) - vec3(inBlack)) / (vec3(inWhite) - vec3(inBlack)) * (vec3(outWhite) - vec3(outBlack)) + vec3(outBlack);
      return (outPixel.rgb);
  }

  vec3 neutralTonemap(vec3 x){
      vec3 finalColor = applyTonemapFilmicAD(x); // curve (dynamic coeffs differ per level)
      finalColor = remapWhite(finalColor, WhiteClip); // post-curve white point adjustment
      finalColor = saturate(finalColor);
      return finalColor;
  }


	void main(){
		vec4 color = texture2D(renderer_BlitTexture, v_uv);
    
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      color = gammaToLinear(color);
    #endif 

    #if TONEMAPPING_MODE == 1
      color.rgb = neutralTonemap(color.rgb);
    #elif TONEMAPPING_MODE == 2
      // Note: input is actually ACEScg (AP1 w/ linear encoding)
      vec3 aces = ACEScg_to_ACES(color.rgb);
      // color.rgb = AcesTonemap(aces);
    #endif

    gl_FragColor = color;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif

	}
`
);
