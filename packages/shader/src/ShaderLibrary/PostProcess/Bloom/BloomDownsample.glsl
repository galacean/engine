#ifndef BLOOM_DOWNSAMPLE
#define BLOOM_DOWNSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;

void frag(Varyings v) {
    vec2 t = renderer_texelSize.xy;
    vec2 t2 = t * 2.0;

    // Pre-weight samples to avoid mediump (fp16) overflow
    mediump vec3 color = texture2D(renderer_BlitTexture, v.v_uv + vec2(-t2.x, -t2.y)).rgb * 0.03125;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(  0.0, -t2.y)).rgb * 0.0625;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t2.x, -t2.y)).rgb * 0.03125;

    color += texture2D(renderer_BlitTexture, v.v_uv + vec2( -t.x,  -t.y)).rgb * 0.125;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(  t.x,  -t.y)).rgb * 0.125;

    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-t2.x,   0.0)).rgb * 0.0625;
    color += texture2D(renderer_BlitTexture, v.v_uv                     ).rgb * 0.125;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t2.x,   0.0)).rgb * 0.0625;

    color += texture2D(renderer_BlitTexture, v.v_uv + vec2( -t.x,   t.y)).rgb * 0.125;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(  t.x,   t.y)).rgb * 0.125;

    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-t2.x,  t2.y)).rgb * 0.03125;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2(  0.0,  t2.y)).rgb * 0.0625;
    color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t2.x,  t2.y)).rgb * 0.03125;

    gl_FragColor = vec4(color, 0.0);
}

#endif
