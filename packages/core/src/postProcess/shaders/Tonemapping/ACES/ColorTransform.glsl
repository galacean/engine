#ifndef COLOR_TRANSFORM
#define COLOR_TRANSFORM

// Precomputed matrices (pre-transposed)
// See https://github.com/ampas/aces-dev/blob/master/transforms/ctl/README-MATRIX.md
  
  const mediump mat3 sRGB_2_AP0 = mat3(
    0.4397010, 0.0897923, 0.0175440,
    0.3829780, 0.8134230, 0.1115440,
    0.1773350, 0.0967616, 0.8707040
  );

  const mediump mat3 AP1_2_AP0_MAT = mat3(
    vec3(0.6954522414, 0.0447945634, -0.0055258826),
    vec3(0.1406786965, 0.8596711185, 0.0040252103),
    vec3(0.1638690622, 0.0955343182, 1.0015006723)
  );

  const mediump mat3 AP0_2_AP1_MAT = mat3(
	vec3(1.4514393161, -0.0765537734, 0.0083161484),
    vec3(-0.2365107469, 1.1762296998, -0.0060324498),
    vec3(-0.2149285693, -0.0996759264, 0.9977163014)
  );

  const mediump mat3 AP1_2_XYZ_MAT = mat3(
    vec3(0.6624541811, 0.2722287168, -0.0055746495),
    vec3(0.1340042065, 0.6740817658, 0.0040607335),
    vec3(0.1561876870, 0.0536895174, 1.0103391003)
  );

  const mediump mat3 XYZ_2_AP1_MAT = mat3(
    vec3(1.6410233797, -0.6636628587, 0.0117218943),
    vec3(-0.3248032942, 1.6153315917, -0.0082844420),
    vec3(-0.2364246952, 0.0167563477, 0.9883948585)
  );

  const mediump mat3 D60_2_D65_CAT = mat3(
    vec3(0.987224, -0.00759836, 0.00307257),
    vec3(-0.00611327, 1.00186, -0.00509595),
    vec3(0.0159533, 0.00533002, 1.08168)
  );

  const mediump mat3 XYZ_2_REC709_MAT = mat3(
    vec3(3.2409699419, -0.9692436363, 0.0556300797),
    vec3(-1.5373831776, 1.8759675015, -0.2039769589),
    vec3(-0.498610760, 0.0415550574, 1.0569715142)
  );

  const mediump vec3 AP1_RGB2Y = vec3(0.2722287168, 0.6740817658, 0.0536895174);

  mediump float rgb_2_saturation(mediump vec3 rgb){
    const mediump float TINY = 1e-4;
    mediump float mi = min3(rgb);
    mediump float ma = max3(rgb);
    return (max(ma, TINY) - max(mi, TINY)) / max(ma, 1e-2);
  }

  mediump float rgb_2_yc(mediump vec3 rgb){
    const mediump float ycRadiusWeight = 1.75;

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

    mediump float r = rgb.x;
    mediump float g = rgb.y;
    mediump float b = rgb.z;
    mediump float k = b * (b - g) + g * (g - r) + r * (r - b);
    k = max(k, 0.0); // Clamp to avoid precision issue causing k < 0, making sqrt(k) undefined
    float chroma = k == 0.0 ? 0.0 : sqrt(k); // Avoid NaN

    return (b + g + r + ycRadiusWeight * chroma) / 3.0;
  }

  mediump float rgb_2_hue(mediump vec3 rgb){
    // Returns a geometric hue angle in degrees (0-360) based on RGB values.
    // For neutral colors, hue is undefined and the function will return a quiet NaN value.
    mediump float hue;
    if (rgb.x == rgb.y && rgb.y == rgb.z){
      hue = 0.0; // RGB triplets where RGB are equal have an undefined hue
    } else{
      hue = (180.0 / PI) * atan(sqrt(3.0) * (rgb.y - rgb.z), 2.0 * rgb.x - rgb.y - rgb.z);
    }

    if (hue < 0.0){
      hue = hue + 360.0;
    } 

    return hue;
  }

  mediump float center_hue(mediump float hue, mediump float centerH){
    mediump float hueCentered = hue - centerH;
    if (hueCentered < -180.0){
      hueCentered = hueCentered + 360.0;
    } else if (hueCentered > 180.0){
      hueCentered = hueCentered - 360.0;
    } 

    return hueCentered;
  }



#endif