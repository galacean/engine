#ifndef BLOOM_DOWNSAMPLE
#define BLOOM_DOWNSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;

void frag(Varyings v) {
    vec2 texelSize = renderer_texelSize.xy;

    mediump vec3 a = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2(-2.0, -2.0)).rgb;
    mediump vec3 b = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 0.0, -2.0)).rgb;
    mediump vec3 c = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 2.0, -2.0)).rgb;

    mediump vec3 d = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2(-1.0, -1.0)).rgb;
    mediump vec3 e = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 1.0, -1.0)).rgb;

    mediump vec3 f = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2(-2.0,  0.0)).rgb;
    mediump vec3 g = texture2DSRGB(renderer_BlitTexture, v.v_uv).rgb;
    mediump vec3 h = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 2.0,  0.0)).rgb;

    mediump vec3 i = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2(-1.0,  1.0)).rgb;
    mediump vec3 j = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 1.0,  1.0)).rgb;

    mediump vec3 k = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2(-2.0,  2.0)).rgb;
    mediump vec3 l = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 0.0,  2.0)).rgb;
    mediump vec3 m = texture2DSRGB(renderer_BlitTexture, v.v_uv + texelSize * vec2( 2.0,  2.0)).rgb;

    // Pre-weight samples to avoid mediump (fp16) overflow
    mediump vec3 color = d * 0.125 + e * 0.125 + i * 0.125 + j * 0.125;
    color += a * 0.03125 + c * 0.03125 + k * 0.03125 + m * 0.03125;
    color += b * 0.0625 + f * 0.0625 + h * 0.0625 + l * 0.0625;
    color += g * 0.125;

    gl_FragColor = vec4(color, 0.0);
}

#endif
