#ifndef BLOOM_DOWNSAMPLE
#define BLOOM_DOWNSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;

void frag(Varyings v) {
    // 5x5 shift-invariant filter in 9 bilinear taps (handles even and odd mip sizes without blind spots)
    vec2 t = renderer_texelSize.xy;
    vec2 uv = v.v_uv * renderer_texelSize.zw + 0.5;
    vec2 base = (floor(uv) - 0.5) * t;
    vec2 s = fract(uv);

    vec2 w0 = 4.0 - 3.0 * s;
    vec2 w2 = 1.0 + 3.0 * s;
    vec2 o0 = ((3.0 - 2.0 * s) / w0 - 2.0) * t;
    vec2 o1 = ((3.0 + s) * (1.0 / 7.0)) * t;
    vec2 o2 = (s / w2 + 2.0) * t;

    w0 *= (1.0 / 12.0);
    w2 *= (1.0 / 12.0);
    float w1 = 7.0 / 12.0;

    float u0 = base.x + o0.x;
    float u1 = base.x + o1.x;
    float u2 = base.x + o2.x;
    float v0 = base.y + o0.y;
    float v1 = base.y + o1.y;
    float v2 = base.y + o2.y;

    // Pre-weight samples to avoid mediump (fp16) overflow
    mediump vec3 color = texture2D(renderer_BlitTexture, vec2(u0, v0)).rgb * (w0.x * w0.y);
    color += texture2D(renderer_BlitTexture, vec2(u1, v0)).rgb * (w1 * w0.y);
    color += texture2D(renderer_BlitTexture, vec2(u2, v0)).rgb * (w2.x * w0.y);

    color += texture2D(renderer_BlitTexture, vec2(u0, v1)).rgb * (w0.x * w1);
    color += texture2D(renderer_BlitTexture, vec2(u1, v1)).rgb * (w1 * w1);
    color += texture2D(renderer_BlitTexture, vec2(u2, v1)).rgb * (w2.x * w1);

    color += texture2D(renderer_BlitTexture, vec2(u0, v2)).rgb * (w0.x * w2.y);
    color += texture2D(renderer_BlitTexture, vec2(u1, v2)).rgb * (w1 * w2.y);
    color += texture2D(renderer_BlitTexture, vec2(u2, v2)).rgb * (w2.x * w2.y);

    gl_FragColor = vec4(color, 0.0);
}

#endif
