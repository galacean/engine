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
  const float a = 0.2;
  const float b = 0.29;
  const float c = 0.24;
  const float d = 0.272;
  const float e = 0.02;
  const float f = 0.3;
  // const float whiteLevel = 5.3;
  // const float whiteClip = 1.0;

  #ifndef GL_FRAGMENT_PRECISION_HIGH
    color = min(color, TONEMAPPING_CLAMP_MAX);
  #endif

  // 1.0 / neutralCurve(whiteLevel, a, b, c, d, e, f);
  const float whiteScale = 1.31338; 
  color = neutralCurve(color * whiteScale, a, b, c, d, e, f);
  color *= whiteScale;

  // Post-curve white point adjustment
  // color /= whiteClip;

  return color;
}