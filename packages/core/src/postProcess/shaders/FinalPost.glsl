#ifdef ENABLE_FXAA
    #if defined(GRAPHICS_API_WEBGL2)
      #define FXAA_GLSL_130 1
      #define FXAA_PC_CONSOLE 1
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

vec3 applyFXAA(vec3 color, vec2 positionNDC, vec4 sourceSize, sampler2D inputTexture)
{
#ifdef ENABLE_FXAA
    vec4 pixelShader = vec4(color,1);

    #if FXAA_PC_CONSOLE == 1
        FxaaFloat4 kUnusedFloat4 = vec4(0);
        FxaaFloat4 fxaaConsolePos = FxaaFloat4(positionNDC.xy - 0.5 * sourceSize.xy, positionNDC.xy + 0.5 * sourceSize.xy);
        FxaaFloat4 kFxaaConsoleRcpFrameOpt = 0.5 * FxaaFloat4(sourceSize.xy, -sourceSize.xy);
        FxaaFloat4 kFxasaConsoleRcpFrameOpt2 = 2.0 * FxaaFloat4(-sourceSize.xy, sourceSize.xy);
        FxaaFloat  kFxaaConsoleEdgeSharpness = 8.0;
        FxaaFloat  kFxaaConsoleEdgeThreshold = 0.125;
        FxaaFloat  kFxaaConsoleEdgeThresholdMin = 0.05;

        pixelShader = FxaaPixelShader(
        positionNDC,
        FxaaFloat4(color, 0),
        fxaaConsolePos,
        inputTexture,
        inputTexture,
        inputTexture,
        sourceSize.xy,
        kFxaaConsoleRcpFrameOpt,
        kFxasaConsoleRcpFrameOpt2,
        kUnusedFloat4,
        FXAA_SUBPIXEL_BLEND_AMOUNT,
        FXAA_RELATIVE_CONTRAST_THRESHOLD,
        FXAA_ABSOLUTE_CONTRAST_THRESHOLD,
        kFxaaConsoleEdgeSharpness,
        kFxaaConsoleEdgeThreshold,
        kFxaaConsoleEdgeThresholdMin,
        kUnusedFloat4
        );
    #endif
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