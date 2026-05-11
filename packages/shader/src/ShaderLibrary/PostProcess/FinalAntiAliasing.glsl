#ifndef FINAL_ANTI_ALIASING
#define FINAL_ANTI_ALIASING

#define FXAA_PC 1
#define FXAA_QUALITY_PRESET 12
#define FXAA_GREEN_AS_LUMA 0
#if defined(GRAPHICS_API_WEBGL2)
    #define FXAA_GLSL_130 1
#elif defined(GRAPHICS_API_WEBGL1)
    #define FXAA_GLSL_120 1
#endif

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/PostProcess/FXAA/FXAA3_11.glsl"

const FxaaFloat FXAA_SUBPIXEL_BLEND_AMOUNT = 0.75;
const FxaaFloat FXAA_RELATIVE_CONTRAST_THRESHOLD = 0.166;
const FxaaFloat FXAA_ABSOLUTE_CONTRAST_THRESHOLD = 0.0833;

sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;

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

void frag(Varyings v) {
	mediump vec4 color = texture2D(renderer_BlitTexture, v.v_uv);

    color = applyFXAA(color, v.v_uv, renderer_texelSize, renderer_BlitTexture);

    // We have convert the color to sRGB space in sRGB pass
    // So we need to convert it back to linear space when output to render target.
    #ifndef ENGINE_OUTPUT_SRGB_CORRECT
        color.rgb /= color.a;
        color = sRGBToLinear(color);
        color.rgb *= color.a;
    #endif

    gl_FragColor = color;
}

#endif
