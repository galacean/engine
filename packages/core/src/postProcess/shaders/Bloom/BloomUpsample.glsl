#include <PostCommon>
#include <Filtering>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform sampler2D material_lowMipTexture;
uniform vec4 material_BloomParams;        // x: threshold (linear), y: threshold knee, z: scatter
uniform vec4 material_lowMipTexelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
    mediump vec4 highMip = texture2DSRGB(renderer_BlitTexture, v_uv, renderer_BlitTexture_SRGBDecode);

    #ifdef BLOOM_HQ
      mediump vec4 lowMip = sampleTexture2DBicubic(material_lowMipTexture, v_uv, material_lowMipTexelSize, material_lowMipTexture_SRGBDecode);
    #else
      mediump vec4 lowMip = texture2DSRGB(material_lowMipTexture, v_uv, material_lowMipTexture_SRGBDecode);
    #endif
    
    gl_FragColor = mix(highMip, lowMip, material_BloomParams.z);
}