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
      // 4-tap bilinear 3x3 tent; pre-weight samples to avoid mediump (fp16) overflow
      vec2 halfTexel = renderer_texelSize.xy * 0.5;
      mediump vec3 lowMip = texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-halfTexel.x, -halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( halfTexel.x, -halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-halfTexel.x,  halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( halfTexel.x,  halfTexel.y)).rgb * 0.25;
    #endif

    // Alpha carries scatter for in-place BlendState with highMip (dst.a stays 0.0)
    gl_FragColor = vec4(lowMip, material_BloomParams.z);
}

#endif
