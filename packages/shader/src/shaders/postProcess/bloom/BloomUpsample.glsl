#ifndef BLOOM_UPSAMPLE
#define BLOOM_UPSAMPLE

#include <PostCommon>
#include <Filtering>

void main(){
    mediump vec4 highMip = texture2DSRGB(renderer_BlitTexture, v_uv);

    #ifdef BLOOM_HQ
      mediump vec4 lowMip = sampleTexture2DBicubic(material_lowMipTexture, v_uv, material_lowMipTexelSize);
    #else
      mediump vec4 lowMip = texture2DSRGB(material_lowMipTexture, v_uv);
    #endif

    gl_FragColor = mix(highMip, lowMip, material_BloomParams.z);
}

#endif