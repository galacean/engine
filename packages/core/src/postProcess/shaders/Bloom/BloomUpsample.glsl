#include <PostCommon>
#include <Filtering>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform sampler2D material_lowMipTexture;
uniform vec4 material_BloomParams;        // x: threshold (linear), y: threshold knee, z: scatter
uniform vec4 material_lowMipTexelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
    mediump vec4 highMip = texture2D(renderer_BlitTexture, v_uv);

    #ifdef BLOOM_HQ
      mediump vec4 lowMip = sampleTexture2DBicubic(material_lowMipTexture, v_uv, material_lowMipTexelSize);
    #else
      mediump vec4 lowMip = texture2D(material_lowMipTexture, v_uv);
    #endif
    
    gl_FragColor = mix(highMip, lowMip, material_BloomParams.z);
  
    gl_FragColor = outputTransform(gl_FragColor);
}