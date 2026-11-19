#ifndef BLOOM_UPSAMPLE
#define BLOOM_UPSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"
#include "ShaderLibrary/PostProcess/Filtering.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 material_BloomParams;
vec4 renderer_texelSize;

void frag(Varyings v) {
    #ifdef BLOOM_HQ
      mediump vec3 lowMip = sampleTexture2DBicubic(renderer_BlitTexture, v.v_uv, renderer_texelSize).rgb;
    #else
      // Pre-weight samples to avoid mediump (fp16) overflow
      vec2 t = renderer_texelSize.xy;
      mediump vec3 lowMip = texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-t.x * 2.0, 0.0)).rgb * 0.08333333;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( t.x * 2.0, 0.0)).rgb * 0.08333333;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(0.0, -t.y * 2.0)).rgb * 0.08333333;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(0.0,  t.y * 2.0)).rgb * 0.08333333;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-t.x, -t.y)).rgb * 0.16666667;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( t.x, -t.y)).rgb * 0.16666667;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-t.x,  t.y)).rgb * 0.16666667;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( t.x,  t.y)).rgb * 0.16666667;
    #endif

    // Alpha carries scatter for in-place BlendState with highMip (dst.a stays 0.0)
    gl_FragColor = vec4(lowMip, material_BloomParams.z);
}

#endif
