#ifndef BLOOM_UPSAMPLE
#define BLOOM_UPSAMPLE

#include "ShaderLibrary/PostProcess/PostCommon.glsl"
#include "ShaderLibrary/PostProcess/Filtering.glsl"

mediump sampler2D renderer_BlitTexture;
mediump sampler2D material_lowMipTexture;
vec4 material_BloomParams;
vec4 material_lowMipTexelSize;

void frag(Varyings v) {
    mediump vec4 highMip = texture2DSRGB(renderer_BlitTexture, v.v_uv);

    #ifdef BLOOM_HQ
      mediump vec4 lowMip = sampleTexture2DBicubic(material_lowMipTexture, v.v_uv, material_lowMipTexelSize);
    #else
      mediump vec4 lowMip = texture2DSRGB(material_lowMipTexture, v.v_uv);
    #endif

    gl_FragColor = mix(highMip, lowMip, material_BloomParams.z);
}

#endif
