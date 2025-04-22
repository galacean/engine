#ifdef ENABLE_FXAA
    #define FXAA_PC 1
    #define FXAA_QUALITY_PRESET 12
    #define FXAA_GREEN_AS_LUMA 0
    #if defined(GRAPHICS_API_WEBGL2)
        #define FXAA_GLSL_130 1
    #elif defined(GRAPHICS_API_WEBGL1)
        #define FXAA_GLSL_120 1
        #define FXAA_FAST_PIXEL_OFFSET 1
    #endif
#else
    #if defined(GRAPHICS_API_WEBGL2)
        #define FXAA_GLSL_130 1
    #elif defined(GRAPHICS_API_WEBGL1)
        #define FXAA_GLSL_120 1
    #endif
#endif

#include <PostCommon>
#include <Filtering>
#include <FXAA3_11>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

#ifdef ENABLE_FXAA
	const FxaaFloat FXAA_SUBPIXEL_BLEND_AMOUNT = 0.65;
	const FxaaFloat FXAA_RELATIVE_CONTRAST_THRESHOLD = 0.15;
	const FxaaFloat FXAA_ABSOLUTE_CONTRAST_THRESHOLD = 0.03;
#endif

vec3 applyFXAA(vec3 color, vec2 positionNDC, vec4 sourceSize, sampler2D blitTexture)
{
#ifdef ENABLE_FXAA
        vec4 pixelShader = vec4(color,1);
        
        FxaaFloat4 fxaaConsolePos = FxaaFloat4(0);
        FxaaFloat4 kFxaaConsoleRcpFrameOpt = FxaaFloat4(0);
        FxaaFloat4 kFxaaConsoleRcpFrameOpt2 = FxaaFloat4(0);
        FxaaFloat kFxaaConsoleEdgeSharpness = 0.0;
        FxaaFloat kFxaaConsoleEdgeThreshold = 0.0;
        FxaaFloat kFxaaConsoleEdgeThresholdMin = 0.0;

    #if FXAA_PC_CONSOLE == 1
        fxaaConsolePos = FxaaFloat4(positionNDC.xy - 0.5 * sourceSize.xy, positionNDC.xy + 0.5 * sourceSize.xy);
        kFxaaConsoleRcpFrameOpt = 0.5 * FxaaFloat4(sourceSize.xy, -sourceSize.xy);
        kFxaaConsoleRcpFrameOpt2 = 2.0 * FxaaFloat4(-sourceSize.xy, sourceSize.xy);
        kFxaaConsoleEdgeSharpness = 8.0;
        kFxaaConsoleEdgeThreshold = 0.125;
        kFxaaConsoleEdgeThresholdMin = 0.05;
    #endif

        pixelShader = FxaaPixelShader(
        positionNDC,
        FxaaFloat4(color, 0),
        fxaaConsolePos,
        blitTexture,
        blitTexture,
        blitTexture,
        sourceSize.xy,
        kFxaaConsoleRcpFrameOpt,
        kFxaaConsoleRcpFrameOpt2,
        FXAA_SUBPIXEL_BLEND_AMOUNT,
        FXAA_RELATIVE_CONTRAST_THRESHOLD,
        FXAA_ABSOLUTE_CONTRAST_THRESHOLD,
        kFxaaConsoleEdgeSharpness,
        kFxaaConsoleEdgeThreshold,
        kFxaaConsoleEdgeThresholdMin
        );
    return pixelShader.rgb;
#else
    return color;
#endif
}

void main(){
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v_uv);

    #ifdef ENABLE_FXAA
        color.rgb = applyFXAA(color.rgb, v_uv, renderer_texelSize, renderer_BlitTexture);
    #endif    

    gl_FragColor = outputSRGBCorrection(color);
    
}