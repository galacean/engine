#ifndef POST_COMMON
#define POST_COMMON

#include <common>
#define FLT_MIN  1.175494351e-38 // Minimum normalized positive floating-point number
#define HALF_MIN 6.103515625e-5  // 2^-14, the same value for 10, 11 and 16-bit: https://www.khronos.org/opengl/wiki/Small_Float_Formats
#define HALF_MAX 65504.0 // (2 - 2^-10) * 2^15

float min3(vec3 val) { return min(min(val.x, val.y), val.z); }
float max3(vec3 val) { return max(max(val.x, val.y), val.z); }

const float INVERT_LOG10 = 0.43429448190325176;

float log10(float x){
    return log(x) * INVERT_LOG10;
}


vec4 sampleTexture(sampler2D tex, vec2 uv){
    vec4 color = texture2D(tex, uv);
    color = gammaToLinear(color);
    return color;
}



#endif