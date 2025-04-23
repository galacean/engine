#define FXAA_PC 1
#define FXAA_QUALITY_PRESET 12
#define FXAA_GREEN_AS_LUMA 0
#if defined(GRAPHICS_API_WEBGL2)
    #define FXAA_GLSL_130 1
#elif defined(GRAPHICS_API_WEBGL1)
    #define FXAA_GLSL_120 1
#endif

#include <FXAA3_11>

const FxaaFloat FXAA_SUBPIXEL_BLEND_AMOUNT = 0.65;
const FxaaFloat FXAA_RELATIVE_CONTRAST_THRESHOLD = 0.15;
const FxaaFloat FXAA_ABSOLUTE_CONTRAST_THRESHOLD = 0.03;

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

vec3 applyFXAA(vec3 color, vec2 positionNDC, vec4 sourceSize, sampler2D blitTexture)
{
    vec4 pixelShader = vec4(color,1);

    pixelShader = FxaaPixelShader(
    positionNDC,
    FxaaFloat4(color, 0),
    blitTexture,
    sourceSize.xy,
    FXAA_SUBPIXEL_BLEND_AMOUNT,
    FXAA_RELATIVE_CONTRAST_THRESHOLD,
    FXAA_ABSOLUTE_CONTRAST_THRESHOLD
    );
return pixelShader.rgb;
}

void main(){
	mediump vec4 color = texture2D(renderer_BlitTexture, v_uv);

    color.rgb = applyFXAA(color.rgb, v_uv, renderer_texelSize, renderer_BlitTexture);

    #ifndef ENGINE_OUTPUT_SRGB_CORRECT
        color = sRGBToLinear(color);
    #endif

    gl_FragColor = color;
}