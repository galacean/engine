#ifndef COMMON_INCLUDED
#define COMMON_INCLUDED

#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618
#define EPSILON 1e-6
#define LOG2 1.442695
#define HALF_MIN 6.103515625e-5  // 2^-14, the same value for 10, 11 and 16-bit: https://www.khronos.org/opengl/wiki/Small_Float_Formats
#define HALF_EPS 4.8828125e-4    // 2^-11, machine epsilon: 1 + EPS = 1 (half of the ULP for 1.0f)

#define saturate( a ) clamp( a, 0.0, 1.0 )

float pow2(float x ) {
    return x * x;
}

vec4 gammaToLinear(vec4 value){
    return vec4( pow(value.rgb, vec3(2.2)), value.a);
}

vec4 linearToGamma(vec4 value){
	value = max(value, 0.0);
    return vec4( pow(value.rgb, vec3(1.0 / 2.2)), value.a);
}

// https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_framebuffer_sRGB.txt
// https://www.khronos.org/registry/OpenGL/extensions/EXT/EXT_texture_sRGB_decode.txt
float sRGBToLinear(float value){
    float linearRGBLo  = value / 12.92;
    float linearRGBHi  = pow((value + 0.055) / 1.055, 2.4);
    float linearRGB    = (value <= 0.04045) ? linearRGBLo : linearRGBHi;
    return linearRGB;
}

vec4 sRGBToLinear(vec4 value){
   return vec4(sRGBToLinear(value.r), sRGBToLinear(value.g), sRGBToLinear(value.b), value.a);
}

float linearToSRGB(float value){
	value = max(value, 0.0);
    return (value <= 0.0031308) ? (value * 12.9232102) : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

vec4 linearToSRGB(vec4 value){
    return vec4(linearToSRGB(value.r), linearToSRGB(value.g), linearToSRGB(value.b), value.a);
}

vec4 texture2DSRGB(sampler2D tex, vec2 uv) {
	return texture(tex, uv);
}

vec4 outputSRGBCorrection(vec4 linearIn){
    #ifdef ENGINE_OUTPUT_SRGB_CORRECT
    	return linearToSRGB(linearIn);
    #else
    	return linearIn;
    #endif
}


vec4 camera_DepthBufferParams;
vec4 camera_ProjectionParams;

float remapDepthBufferLinear01(float depth){
	return 1.0 / (camera_DepthBufferParams.x * depth + camera_DepthBufferParams.y);
}

float remapDepthBufferEyeDepth(float depth){
	#ifdef CAMERA_ORTHOGRAPHIC
		return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
	#else
		return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
	#endif
}

// From Next Generation Post Processing in Call of Duty: Advanced Warfare [Jimenez 2014]
// http://advances.realtimerendering.com/s2014/index.html
// sampleCoord must not be normalized (e.g. window coordinates)
float interleavedGradientNoise(vec2 sampleCoord)
{
	const vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
	return fract(magic.z * fract(dot(sampleCoord, magic.xy)));
}

#define INVERSE_MAT(mat) inverse(mat)

vec3 safeNormalize(vec3 inVec)
{
    float dp3 = max(float(HALF_MIN), dot(inVec, inVec));
    return inVec * inversesqrt(dp3);
}

vec3 getViewDirection(vec3 cameraPosition, vec3 cameraForward, vec3 worldPosition) {
    #ifdef CAMERA_ORTHOGRAPHIC
        return -cameraForward;
    #else
        return normalize(cameraPosition - worldPosition);
    #endif
}

#endif