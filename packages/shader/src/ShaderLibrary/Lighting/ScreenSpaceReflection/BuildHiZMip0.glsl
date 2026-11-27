#ifndef SSR_BUILD_HIZ_MIP0_INCLUDED
#define SSR_BUILD_HIZ_MIP0_INCLUDED

highp sampler2D renderer_BlitTexture;
vec4 material_SSRSourceTexelSize;
vec4 material_SSRDestTexelSize;

void buildHiZMip0Fragment(Varyings v) {
  #ifdef SSR_DOWNSAMPLE_FROM_FULL_DEPTH
    vec2 invSrc = material_SSRSourceTexelSize.xy;
    ivec2 srcSize = ivec2(material_SSRSourceTexelSize.zw);
    ivec2 dstSize = ivec2(material_SSRDestTexelSize.zw);
    ivec4 footprint = getSSRDepthFootprint(ivec2(floor(gl_FragCoord.xy)), srcSize, dstSize);
    float minD = 1.0;
    for (int dy = 0; dy < 8; ++dy) {
      int sy = footprint.y + dy;
      if (sy > footprint.w) {
        break;
      }
      for (int dx = 0; dx < 8; ++dx) {
        int sx = footprint.x + dx;
        if (sx > footprint.z) {
          break;
        }
        vec2 sampleUV = (vec2(float(sx), float(sy)) + vec2(0.5)) * invSrc;
        minD = min(minD, texture2D(renderer_BlitTexture, sampleUV).r);
      }
    }
  #else
    float minD = texture2D(renderer_BlitTexture, v.v_uv).r;
  #endif

  float farClip = camera_ProjectionParams.z;
  float eyeDepth = minD >= 1.0 ? farClip : remapDepthBufferEyeDepth(minD);
  gl_FragColor = encodeSSRDepth(eyeDepth, farClip);
}

#endif
