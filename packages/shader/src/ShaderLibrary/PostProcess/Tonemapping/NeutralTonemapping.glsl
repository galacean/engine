#ifndef NEUTRAL_TONEMAPPING
#define NEUTRAL_TONEMAPPING

// Neutral tonemapping (Hable/Hejl/Frostbite)
// Input is linear RGB
// More accuracy to avoid NaN on extremely high values.
vec3 neutralCurve(vec3 x, float a, float b, float c, float d, float e, float f){
      return vec3(((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f);
}

vec3 neutralTonemap(vec3 color){
  const float a = 0.2;
  const float b = 0.29;
  const float c = 0.24;
  const float d = 0.272;
  const float e = 0.02;
  const float f = 0.3;
  // const float whiteLevel = 5.3;
  // const float whiteClip = 1.0;

  // 1.0 / neutralCurve(whiteLevel, a, b, c, d, e, f);
  const float whiteScale = 1.31338;
  color = neutralCurve(color * whiteScale, a, b, c, d, e, f);
  color *= whiteScale;

  // Post-curve white point adjustment
  // color /= whiteClip;

  return color;
}

#endif