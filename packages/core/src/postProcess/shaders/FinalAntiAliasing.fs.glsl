#define FXAA_PC 1
#define FXAA_QUALITY_PRESET 12
#define FXAA_GREEN_AS_LUMA 0
#if defined(GRAPHICS_API_WEBGL2)
    #define FXAA_GLSL_130 1
#elif defined(GRAPHICS_API_WEBGL1)
    #define FXAA_GLSL_120 1
#endif

#include <common>
#include <FXAA3_11>

const FxaaFloat FXAA_SUBPIXEL_BLEND_AMOUNT = 0.75;
const FxaaFloat FXAA_RELATIVE_CONTRAST_THRESHOLD = 0.166;
const FxaaFloat FXAA_ABSOLUTE_CONTRAST_THRESHOLD = 0.0833;

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

vec4 applyFXAA(vec4 color, vec2 positionNDC, vec4 sourceSize, sampler2D blitTexture)
{
    return FxaaPixelShader(
    positionNDC,
    color,
    blitTexture,
    sourceSize.xy,
    FXAA_SUBPIXEL_BLEND_AMOUNT,
    FXAA_RELATIVE_CONTRAST_THRESHOLD,
    FXAA_ABSOLUTE_CONTRAST_THRESHOLD
    );
}

void main(){
	mediump vec4 color = texture2D(renderer_BlitTexture, v_uv);

    color = applyFXAA(color, v_uv, renderer_texelSize, renderer_BlitTexture);

    // We have convert the color to sRGB space in sRGB pass
    // So we need to convert it back to linear space when output to render target.
    #ifndef ENGINE_OUTPUT_SRGB_CORRECT
        color.rgb /= color.a;
        color = sRGBToLinear(color);
        color.rgb *= color.a;
    #endif

    gl_FragColor = color;
}