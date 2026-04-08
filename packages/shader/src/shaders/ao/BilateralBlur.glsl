#ifndef BILATERAL_BLUR_INCLUDED
#define BILATERAL_BLUR_INCLUDED

#include "Common.glsl"

varying vec2 v_uv;
sampler2D renderer_BlitTexture;
vec4 renderer_SourceScaleOffset;
float material_farPlaneOverEdgeDistance;

#if SSAO_QUALITY == 0
      #define BLUR_SAMPLE_COUNT 3
#elif SSAO_QUALITY == 1
      #define BLUR_SAMPLE_COUNT 6
#elif SSAO_QUALITY == 2
      #define BLUR_SAMPLE_COUNT 12
#endif

float material_kernel[12];

float bilateralWeight(float depth, float sampleDepth) {
      float diff = (sampleDepth - depth) * material_farPlaneOverEdgeDistance;
      return max(0.0, 1.0 - diff * diff);
}

highp float unpack(highp vec2 depth) {
    return (depth.x * (256.0 / 257.0) + depth.y * (1.0 / 257.0));
}

void tap(const sampler2D saoTexture,
      inout float sum, inout float totalWeight, float weight, float depth, vec2 position) {
      vec4 data = texture2D(saoTexture, position);
      float bilateral = weight * bilateralWeight(depth, unpack(data.gb));
      sum += data.r * bilateral;
      totalWeight += bilateral;
}

void main(){
      mediump vec4 data = texture2D(renderer_BlitTexture, v_uv);
      float depth = unpack(data.gb);

      float totalWeight = material_kernel[0];
      float sum = data.r * totalWeight;

      vec2 offset = renderer_SourceScaleOffset.zw;
      for (int i = 1; i < BLUR_SAMPLE_COUNT; i++) {
            float weight = material_kernel[i];
            tap(renderer_BlitTexture, sum, totalWeight, weight, depth, v_uv + offset);
            tap(renderer_BlitTexture, sum, totalWeight, weight, depth, v_uv - offset);
            offset += renderer_SourceScaleOffset.zw;
      }

      float ao = sum * (1.0 / totalWeight);

      ao += ((interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0);
      gl_FragColor = vec4(ao, data.gb, 1.0);
}

#endif
