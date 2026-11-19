#ifndef BLOOM_UPSAMPLE
#define BLOOM_UPSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"
#include "ShaderLibrary/PostProcess/Filtering.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 material_BloomParams;
vec4 renderer_texelSize;

// Progressive upsample blended in-place with highMip via BlendState:
// dst.rgb = lowMip.rgb * scatter + highMip.rgb * (1.0 - scatter), preserving dst.a = 0.0.
void frag(Varyings v) {
    #ifdef BLOOM_HQ
      mediump vec3 lowMip = sampleTexture2DBicubic(renderer_BlitTexture, v.v_uv, renderer_texelSize).rgb;
    #else
      // 4-tap bilinear 3x3 tent filter (equivalent to (1,2,1; 2,4,2; 1,2,1) / 16).
      // Weight each HDR sample before accumulating to avoid mediump (fp16) overflow.
      vec2 halfTexel = renderer_texelSize.xy * 0.5;
      mediump vec3 lowMip = texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-halfTexel.x, -halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( halfTexel.x, -halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2(-halfTexel.x,  halfTexel.y)).rgb * 0.25;
      lowMip += texture2DSRGB(renderer_BlitTexture, v.v_uv + vec2( halfTexel.x,  halfTexel.y)).rgb * 0.25;
    #endif

    gl_FragColor = vec4(lowMip, material_BloomParams.z);
}

#endif
