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

const mathFunction = `
  #define HALF_MIN 6.103515625e-5  // 2^-14, the same value for 10, 11 and 16-bit: https://www.khronos.org/opengl/wiki/Small_Float_Formats
  #define HALF_MAX 65504.0 // (2 - 2^-10) * 2^15
  #define PI 3.14159265359

  float min3(vec3 val) { return min(min(val.x, val.y), val.z); }
  float max3(vec3 val) { return max(max(val.x, val.y), val.z); }

  const float INVERT_LOG10 = 0.43429448190325176;

  float log10(float x){
      return log(x) * INVERT_LOG10;
  }
`;

const neutralTonemapping = `
  // Neutral tonemapping (Hable/Hejl/Frostbite)
  // Input is linear RGB
  // More accuracy to avoid NaN on extremely high values.
  vec3 neutralCurve(vec3 x, float a, float b, float c, float d, float e, float f){
      return vec3(((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f);
  }

  #define TONEMAPPING_CLAMP_MAX 435.18712 //(-b + sqrt(b * b - 4 * a * (HALF_MAX - d * f))) / (2 * a * whiteScale)
  //Extremely high values cause NaN output when using fp16, we clamp to avoid the performace hit of switching to fp32
  //The overflow happens in (x * (a * x + b) + d * f) of the NeutralCurve, highest value that avoids fp16 precision errors is ~571.56873
  //Since whiteScale is constant (~1.31338) max input is ~435.18712

  vec3 neutralTonemap(vec3 color){
    float a = 0.2;
    float b = 0.29;
    float c = 0.24;
    float d = 0.272;
    float e = 0.02;
    float f = 0.3;
    // float whiteLevel = 5.3;
    // float whiteClip = 1.0;

    #ifndef GL_FRAGMENT_PRECISION_HIGH
      color = min(color, TONEMAPPING_CLAMP_MAX);
    #endif

    // 1.0 / neutralCurve(whiteLevel, a, b, c, d, e, f);
    float whiteScale = 1.31338; 
    color = neutralCurve(color * whiteScale, a, b, c, d, e, f);
    color *= whiteScale;

    // Post-curve white point adjustment
    // color /= whiteClip;

    return color;
  }
`;

const colorTransform = `
  // Precomputed matrices (pre-transposed)
  // See https://github.com/ampas/aces-dev/blob/master/transforms/ctl/README-MATRIX.md
  
  const mat3 sRGB_2_AP0 = mat3(
    0.4397010, 0.0897923, 0.0175440,
    0.3829780, 0.8134230, 0.1115440,
    0.1773350, 0.0967616, 0.8707040
  );

  const mat3 AP1_2_AP0_MAT = mat3(
    vec3(0.6954522414, 0.0447945634, -0.0055258826),
    vec3(0.1406786965, 0.8596711185, 0.0040252103),
    vec3(0.1638690622, 0.0955343182, 1.0015006723)
  );

  const mat3 AP0_2_AP1_MAT = mat3(
    vec3(1.4514393161, -0.0765537734, 0.0083161484),
    vec3(-0.2365107469, 1.1762296998, -0.0060324498),
    vec3(-0.2149285693, -0.0996759264, 0.9977163014)
  );

  const mat3 AP1_2_XYZ_MAT = mat3(
    vec3(0.6624541811, 0.2722287168, -0.0055746495),
    vec3(0.1340042065, 0.6740817658, 0.0040607335),
    vec3(0.1561876870, 0.0536895174, 1.0103391003)
  );

  const mat3 XYZ_2_AP1_MAT = mat3(
    vec3(1.6410233797, -0.6636628587, 0.0117218943),
    vec3(-0.3248032942, 1.6153315917, -0.0082844420),
    vec3(-0.2364246952, 0.0167563477, 0.9883948585)
  );

  const mat3 D60_2_D65_CAT = mat3(
    vec3(0.987224, -0.00759836, 0.00307257),
    vec3(-0.00611327, 1.00186, -0.00509595),
    vec3(0.0159533, 0.00533002, 1.08168)
  );

  const mat3 XYZ_2_REC709_MAT = mat3(
    vec3(3.2409699419, -0.9692436363, 0.0556300797),
    vec3(-1.5373831776, 1.8759675015, -0.2039769589),
    vec3(-0.498610760, 0.0415550574, 1.0569715142)
  );

  const vec3 AP1_RGB2Y = vec3(0.2722287168, 0.6740817658, 0.0536895174);

  float rgb_2_saturation(vec3 rgb){
    float TINY = 1e-4;
    float mi = min3(rgb);
    float ma = max3(rgb);
    return (max(ma, TINY) - max(mi, TINY)) / max(ma, 1e-2);
  }

  float rgb_2_yc(vec3 rgb){
    float ycRadiusWeight = 1.75;

    // Converts RGB to a luminance proxy, here called YC
    // YC is ~ Y + K * Chroma
    // Constant YC is a cone-shaped surface in RGB space, with the tip on the
    // neutral axis, towards white.
    // YC is normalized: RGB 1 1 1 maps to YC = 1
    //
    // ycRadiusWeight defaults to 1.75, although can be overridden in function
    // call to rgb_2_yc
    // ycRadiusWeight = 1 -> YC for pure cyan, magenta, yellow == YC for neutral
    // of same value
    // ycRadiusWeight = 2 -> YC for pure red, green, blue  == YC for  neutral of
    // same value.

    float r = rgb.x;
    float g = rgb.y;
    float b = rgb.z;
    float k = b * (b - g) + g * (g - r) + r * (r - b);
    k = max(k, 0.0); // Clamp to avoid precision issue causing k < 0, making sqrt(k) undefined
    float chroma = k == 0.0 ? 0.0 : sqrt(k); // Avoid NaN

    return (b + g + r + ycRadiusWeight * chroma) / 3.0;
  }

  float rgb_2_hue(vec3 rgb){
    // Returns a geometric hue angle in degrees (0-360) based on RGB values.
    // For neutral colors, hue is undefined and the function will return a quiet NaN value.
    float hue;
    if (rgb.x == rgb.y && rgb.y == rgb.z)
        hue = 0.0; // RGB triplets where RGB are equal have an undefined hue
    else
        hue = (180.0 / PI) * atan(sqrt(3.0) * (rgb.y - rgb.z), 2.0 * rgb.x - rgb.y - rgb.z);

    if (hue < 0.0) hue = hue + 360.0;

    return hue;
  }

  float center_hue(float hue, float centerH){
    float hueCentered = hue - centerH;
    if (hueCentered < -180.0) hueCentered = hueCentered + 360.0;
    else if (hueCentered > 180.0) hueCentered = hueCentered - 360.0;
    return hueCentered;
  }
`;

const tonescaleFunction = `
  const mat3 M = mat3(
    vec3(0.5, -1.0, 0.5),
    vec3(-1.0, 1.0, 0.5),
    vec3(0.5, 0.0, 0.0)
  );

  float segmented_spline_c5_fwd(float x){
    #ifdef GRAPHICS_API_WEBGL2
      const float coefsLow[6] = float[6](-4.0000000000, -4.0000000000, -3.1573765773, -0.4852499958, 1.8477324706, 1.8477324706); // coefs for B-spline between minPoint and midPoint (units of log luminance)
      const float coefsHigh[6] = float[6](-0.7185482425, 2.0810307172, 3.6681241237, 4.0000000000, 4.0000000000, 4.0000000000);   // coefs for B-spline between midPoint and maxPoint (units of log luminance)
    #else
      const float coefsLow_0 = -4.0000000000;
      const float coefsLow_1 = -4.0000000000;
      const float coefsLow_2 = -3.1573765773;
      const float coefsLow_3 = -0.4852499958;
      const float coefsLow_4 = 1.8477324706;
      const float coefsLow_5 = 1.8477324706;

      const float coefsHigh_0 = -0.7185482425;
      const float coefsHigh_1 = 2.0810307172;
      const float coefsHigh_2 = 3.6681241237;
      const float coefsHigh_3 = 4.0000000000;
      const float coefsHigh_4 = 4.0000000000;
      const float coefsHigh_5 = 4.0000000000;
    #endif

    // const vec2 minPoint = vec2(0.18 * exp2(-15.0), 0.0001); // {luminance, luminance} linear extension below this
    const vec2 minPoint = vec2(0.0000054931640625, 0.0001); // {luminance, luminance} linear extension below this
    const vec2 midPoint = vec2(0.18, 0.48); // {luminance, luminance}
    // const vec2 maxPoint = vec2(0.18 * exp2(18.0), 10000.0); // {luminance, luminance} linear extension above this
    const vec2 maxPoint = vec2(47185.92, 10000.0); // {luminance, luminance} linear extension above this
    const float slopeLow = 0.0; // log-log slope of low linear extension
    const float slopeHigh = 0.0; // log-log slope of high linear extension

    const int N_KNOTS_LOW = 4;
    const int N_KNOTS_HIGH = 4;

    // Check for negatives or zero before taking the log. If negative or zero,
    // set to ACESMIN.1
    float xCheck = x;
    if (xCheck <= 0.0) xCheck = HALF_MIN;

    float logx = log10(xCheck);
    float logy;

    if (logx <= log10(minPoint.x)){
        logy = logx * slopeLow + (log10(minPoint.y) - slopeLow * log10(minPoint.x));
    } else if ((logx > log10(minPoint.x)) && (logx < log10(midPoint.x))){
        float knot_coord = float(N_KNOTS_LOW - 1) * (logx - log10(minPoint.x)) / (log10(midPoint.x) - log10(minPoint.x));
        int j = int(knot_coord);
        float t = knot_coord - float(j);

        vec3 cf;
        #ifdef GRAPHICS_API_WEBGL2
          cf = vec3(coefsLow[j], coefsLow[j + 1], coefsLow[j + 2]);
        #else
          if (j <= 0) {
            cf = vec3(coefsLow_0, coefsLow_1, coefsLow_2);
          } else if (j == 1) {
            cf = vec3(coefsLow_1, coefsLow_2, coefsLow_3);
          } else if (j == 2) {
            cf = vec3(coefsLow_2, coefsLow_3, coefsLow_4);
          } else { // if (j == 3)
            cf = vec3(coefsLow_3, coefsLow_4, coefsLow_5);
          }
        #endif

        vec3 monomials = vec3(t * t, t, 1.0);
        logy = dot(monomials, M * cf);
    } else if ((logx >= log10(midPoint.x)) && (logx < log10(maxPoint.x))){
        float knot_coord = float(N_KNOTS_HIGH - 1) * (logx - log10(midPoint.x)) / (log10(maxPoint.x) - log10(midPoint.x));
        int j = int(knot_coord);
        float t = knot_coord - float(j);

        vec3 cf;
        #ifdef GRAPHICS_API_WEBGL2
          cf = vec3(coefsHigh[j], coefsHigh[j + 1], coefsHigh[j + 2]);
        #else
          if (j <= 0) {
            cf = vec3(coefsHigh_0, coefsHigh_1, coefsHigh_2);
          } else if (j == 1) {
            cf = vec3(coefsHigh_1, coefsHigh_2, coefsHigh_3);
          } else if (j == 2) {
            cf = vec3(coefsHigh_2, coefsHigh_3, coefsHigh_4);
          } else { // if (j == 3)
            cf = vec3(coefsHigh_3, coefsHigh_4, coefsHigh_5);
          }
        #endif

        vec3 monomials = vec3(t * t, t, 1.0);
        logy = dot(monomials, M * cf);
    } else {
        logy = logx * slopeHigh + (log10(maxPoint.y) - slopeHigh * log10(maxPoint.x));
    }

    return pow(10.0, logy);
  }


  float segmented_spline_c9_fwd(float x){
      // ODT_48nits
      #ifdef GRAPHICS_API_WEBGL2
        const float coefsLow[10] = float[10](-1.6989700043, -1.6989700043, -1.4779000000, -1.2291000000, -0.8648000000, -0.4480000000, 0.0051800000, 0.4511080334, 0.9113744414, 0.9113744414);
        const float coefsHigh[10] = float[10](0.5154386965, 0.8470437783, 1.1358000000, 1.3802000000, 1.5197000000, 1.5985000000, 1.6467000000, 1.6746091357, 1.6878733390, 1.6878733390);
      #else
        const float coefsLow_0 = -1.6989700043;
        const float coefsLow_1 = -1.6989700043;
        const float coefsLow_2 = -1.4779000000;
        const float coefsLow_3 = -1.2291000000;
        const float coefsLow_4 = -0.8648000000;
        const float coefsLow_5 = -0.4480000000;
        const float coefsLow_6 = 0.0051800000;
        const float coefsLow_7 = 0.4511080334;
        const float coefsLow_8 = 0.9113744414;
        const float coefsLow_9 = 0.9113744414;

        const float coefsHigh_0 = 0.5154386965;
        const float coefsHigh_1 = 0.8470437783;
        const float coefsHigh_2 = 1.1358000000;
        const float coefsHigh_3 = 1.3802000000;
        const float coefsHigh_4 = 1.5197000000;
        const float coefsHigh_5 = 1.5985000000;
        const float coefsHigh_6 = 1.6467000000;
        const float coefsHigh_7 = 1.6746091357;
        const float coefsHigh_8 = 1.6878733390;
        const float coefsHigh_9 = 1.6878733390;
      #endif

      // todo const
      vec2 minPoint = vec2(segmented_spline_c5_fwd(0.18 * pow(2.0, -6.5)), 0.02);
      vec2 midPoint = vec2(segmented_spline_c5_fwd(0.18), 4.8);
      vec2 maxPoint = vec2(segmented_spline_c5_fwd(0.18 * pow(2., 6.5)), 48.0);

      const float slopeLow = 0.0;
      const float slopeHigh = 0.04;

      const int N_KNOTS_LOW = 8;
      const int N_KNOTS_HIGH = 8;

      float logx = log10(max(x, HALF_MIN));
      float logy;

      if (logx <= log10(minPoint.x)) {
          logy = logx * slopeLow + (log10(minPoint.y) - slopeLow * log10(minPoint.x));
      } else if ((logx > log10(minPoint.x)) && (logx < log10(midPoint.x))) {
          float knot_coord = float(N_KNOTS_LOW - 1) * (logx - log10(minPoint.x)) / (log10(midPoint.x) - log10(minPoint.x));
          int j = int(knot_coord);
          float t = knot_coord - float(j);

          vec3 cf;
          #ifdef GRAPHICS_API_WEBGL2
            cf = vec3(coefsLow[j], coefsLow[j + 1], coefsLow[j + 2]);
          #else
            if (j <= 0) {
                cf = vec3(coefsLow_0, coefsLow_1, coefsLow_2);
            } else if (j == 1) {
                cf = vec3(coefsLow_1, coefsLow_2, coefsLow_3);
            } else if (j == 2) {
                cf = vec3(coefsLow_2, coefsLow_3, coefsLow_4);
            } else if (j == 3) {
                cf = vec3(coefsLow_3, coefsLow_4, coefsLow_5);
            } else if (j == 4) {
                cf = vec3(coefsLow_4, coefsLow_5, coefsLow_6);
            } else if (j == 5) {
                cf = vec3(coefsLow_5, coefsLow_6, coefsLow_7);
            } else if (j == 6) {
                cf = vec3(coefsLow_6, coefsLow_7, coefsLow_8);
            } else { // if (j == 7)
                cf = vec3(coefsLow_7, coefsLow_8, coefsLow_9);
            }
          #endif

          vec3 monomials = vec3(t * t, t, 1.0);
          logy = dot(monomials, M * cf);
      } else if ((logx >= log10(midPoint.x)) && (logx < log10(maxPoint.x))) {
          float knot_coord = float(N_KNOTS_HIGH - 1) * (logx - log10(midPoint.x)) / (log10(maxPoint.x) - log10(midPoint.x));
          int j = int(knot_coord);
          float t = knot_coord - float(j);

          vec3 cf;
          #ifdef GRAPHICS_API_WEBGL2
            cf = vec3(coefsHigh[j], coefsHigh[j + 1], coefsHigh[j + 2]);
          #else
            if (j <= 0) {
                cf = vec3(coefsHigh_0, coefsHigh_1, coefsHigh_2);
            } else if (j == 1) {
                cf = vec3(coefsHigh_1, coefsHigh_2, coefsHigh_3);
            } else if (j == 2) {
                cf = vec3(coefsHigh_2, coefsHigh_3, coefsHigh_4);
            } else if (j == 3) {
                cf = vec3(coefsHigh_3, coefsHigh_4, coefsHigh_5);
            } else if (j == 4) {
                cf = vec3(coefsHigh_4, coefsHigh_5, coefsHigh_6);
            } else if (j == 5) {
                cf = vec3(coefsHigh_5, coefsHigh_6, coefsHigh_7);
            } else if (j == 6) {
                cf = vec3(coefsHigh_6, coefsHigh_7, coefsHigh_8);
            } else { // if (j == 7)
                cf = vec3(coefsHigh_7, coefsHigh_8, coefsHigh_9);
            }
          #endif

          vec3 monomials = vec3(t * t, t, 1.0);
          logy = dot(monomials, M * cf);
      } else {
          logy = logx * slopeHigh + (log10(maxPoint.y) - slopeHigh * log10(maxPoint.x));
      }

      return pow(10.0, logy);
  }
`;

const RRTFunction = `
  // Reference Rendering Transform (RRT)

  // Sigmoid function in the range 0 to 1 spanning -2 to +2.
  float sigmoid_shaper(float x){
    float t = max(1.0 - abs(x / 2.0), 0.0);
    float y = 1.0 + sign(x) * (1.0 - t * t);

    return y * 0.5;
  }

  float glow_fwd(float ycIn, float glowGainIn, float glowMid){
    float glowGainOut;

    if (ycIn <= 2.0 / 3.0 * glowMid)
        glowGainOut = glowGainIn;
    else if (ycIn >= 2.0 * glowMid)
        glowGainOut = 0.0;
    else
        glowGainOut = glowGainIn * (glowMid / ycIn - 1.0 / 2.0);

    return glowGainOut;
  }


  // "Glow" module constants
  const float RRT_GLOW_GAIN = 0.05;
  const float RRT_GLOW_MID = 0.08;

  // Red modifier constants
  const float RRT_RED_SCALE = 0.82;
  const float RRT_RED_PIVOT = 0.03;
  const float RRT_RED_HUE = 0.;
  const float RRT_RED_WIDTH = 135.;

  // Desaturation contants
  const float RRT_SAT_FACTOR = 0.96;


  // ACES to OCES
  vec3 RRT(vec3 aces){
    // --- Glow module --- //
    float saturation = rgb_2_saturation(aces);
    float ycIn = rgb_2_yc(aces);
    float s = sigmoid_shaper((saturation - 0.4) / 0.2);
    float addedGlow = 1.0 + glow_fwd(ycIn, RRT_GLOW_GAIN * s, RRT_GLOW_MID);
    aces *= addedGlow;

    // --- Red modifier --- //
    float hue = rgb_2_hue(aces);
    float centeredHue = center_hue(hue, RRT_RED_HUE);

    float hueWeight = smoothstep(0.0, 1.0, 1.0 - abs(2.0 * centeredHue / RRT_RED_WIDTH));
    hueWeight *= hueWeight;

    aces.r += hueWeight * saturation * (RRT_RED_PIVOT - aces.r) * (1.0 - RRT_RED_SCALE);

    // --- ACES to RGB rendering space --- //
    aces = clamp(aces, 0.0, HALF_MAX);  // avoids saturated negative colors from becoming positive in the matrix
    vec3 rgbPre = AP0_2_AP1_MAT * aces;
    rgbPre = clamp(rgbPre, 0.0, HALF_MAX);

    // --- Global desaturation --- //
    rgbPre = mix(vec3(dot(rgbPre, AP1_RGB2Y)), rgbPre, RRT_SAT_FACTOR);

    // --- Apply the tonescale independently in rendering-space RGB --- //
    vec3 rgbPost;
    rgbPost.x = segmented_spline_c5_fwd(rgbPre.x);
    rgbPost.y = segmented_spline_c5_fwd(rgbPre.y);
    rgbPost.z = segmented_spline_c5_fwd(rgbPre.z);

    // --- RGB rendering space to OCES --- //
    vec3 outputVal = AP1_2_AP0_MAT * rgbPost;

    return outputVal;
  }
`;

const ODTFunction = `
  // Output Device Transform - RGB computer monitor

  const float CINEMA_WHITE = 48.0;
  const float CINEMA_BLACK = 0.02; // CINEMA_WHITE / 2400.0;
  const float ODT_SAT_FACTOR = 0.93;

  vec3 Y_2_linCV(vec3 Y, float Ymax, float Ymin){
    return (Y - Ymin) / (Ymax - Ymin);
  }

  vec3 XYZ_2_xyY(vec3 XYZ){
    float divisor = max(dot(XYZ, vec3(1.0)), 1e-4);
    return vec3(XYZ.xy / divisor, XYZ.y);
  }

  vec3 xyY_2_XYZ(vec3 xyY){
    float m = xyY.z / max(xyY.y, 1e-4);
    vec3 XYZ = vec3(xyY.xz, (1.0 - xyY.x - xyY.y));
    XYZ.xz *= m;
    return XYZ;
  }

  const float DIM_SURROUND_GAMMA = 0.9811;

  vec3 darkSurround_to_dimSurround(vec3 linearCV){
    // Extra conversions to float3/vec3 are required to avoid floating-point precision issues on some platforms.

    vec3 XYZ = AP1_2_XYZ_MAT * linearCV;
    vec3 xyY = XYZ_2_xyY(XYZ);
    xyY.z = clamp(xyY.z, 0.0, HALF_MAX);
    xyY.z = pow(xyY.z, DIM_SURROUND_GAMMA);
    XYZ = xyY_2_XYZ(xyY);

    return XYZ_2_AP1_MAT * XYZ;
  }

  //
  // Summary :
  //  This transform is intended for mapping OCES onto a desktop computer monitor
  //  typical of those used in motion picture visual effects production. These
  //  monitors may occasionally be referred to as "sRGB" displays, however, the
  //  monitor for which this transform is designed does not exactly match the
  //  specifications in IEC 61966-2-1:1999.
  //
  //  The assumed observer adapted white is D65, and the viewing environment is
  //  that of a dim surround.
  //
  //  The monitor specified is intended to be more typical of those found in
  //  visual effects production.
  //
  // Device Primaries :
  //  Primaries are those specified in Rec. ITU-R BT.709
  //  CIE 1931 chromaticities:  x         y         Y
  //              Red:          0.64      0.33
  //              Green:        0.3       0.6
  //              Blue:         0.15      0.06
  //              White:        0.3127    0.329     100 cd/m^2
  //
  // Display EOTF :
  //  The reference electro-optical transfer function specified in
  //  IEC 61966-2-1:1999.
  //
  // Signal Range:
  //    This transform outputs full range code values.
  //
  // Assumed observer adapted white point:
  //         CIE 1931 chromaticities:    x            y
  //                                     0.3127       0.329
  //
  // Viewing Environment:
  //   This ODT has a compensation for viewing environment variables more typical
  //   of those associated with video mastering.
  //
  vec3 ODT_RGBmonitor_100nits_dim(vec3 oces){
    // OCES to RGB rendering space
    vec3 rgbPre = AP0_2_AP1_MAT * oces;

    // Apply the tonescale independently in rendering-space RGB
    vec3 rgbPost;
    rgbPost.r = segmented_spline_c9_fwd(rgbPre.r);
    rgbPost.g = segmented_spline_c9_fwd(rgbPre.g);
    rgbPost.b = segmented_spline_c9_fwd(rgbPre.b);

    // Scale luminance to linear code value
    vec3 linearCV = Y_2_linCV(rgbPost, CINEMA_WHITE, CINEMA_BLACK);

     // Apply gamma adjustment to compensate for dim surround
    linearCV = darkSurround_to_dimSurround(linearCV);

    // Apply desaturation to compensate for luminance difference
    linearCV = mix(vec3(dot(linearCV, AP1_RGB2Y)), linearCV, ODT_SAT_FACTOR);

    // Convert to display primary encoding
    // Rendering space RGB to XYZ
    vec3 XYZ = AP1_2_XYZ_MAT * linearCV;

    // Apply CAT from ACES white point to assumed observer adapted white point
    XYZ = D60_2_D65_CAT * XYZ;

    // CIE XYZ to display primaries
    linearCV = XYZ_2_REC709_MAT * XYZ;

    // Handle out-of-gamut values
    // Clip values < 0 or > 1 (i.e. projecting outside the display primaries)
    linearCV = clamp(linearCV, vec3(0), vec3(1));

    // Unity already draws to a sRGB target
    return linearCV;
  }
`;

const ACESTonemapping = `
  ${colorTransform}
  ${tonescaleFunction}
  ${RRTFunction}
  ${ODTFunction}

  vec3 ACESTonemap(vec3 color){
    vec3 aces = sRGB_2_AP0 * color;
    vec3 oces = RRT(aces);
    vec3 odt = ODT_RGBmonitor_100nits_dim(oces);

    return odt;
  }
`;

const shader = Shader.create(
  TonemappingEffect.SHADER_NAME,
  blitVs,
  `
  varying vec2 v_uv;
	uniform sampler2D renderer_BlitTexture;

  vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
  }

  vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
  }

  ${mathFunction}
  ${neutralTonemapping}
  ${ACESTonemapping}
 
	void main(){
		vec4 color = texture2D(renderer_BlitTexture, v_uv);
    
    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      color = gammaToLinear(color);
    #endif 

    #if TONEMAPPING_MODE == 1
      color.rgb = neutralTonemap(color.rgb);
    #elif TONEMAPPING_MODE == 2
      color.rgb = ACESTonemap(color.rgb);
    #endif

    gl_FragColor = color;

    #ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif

	}
`
);
