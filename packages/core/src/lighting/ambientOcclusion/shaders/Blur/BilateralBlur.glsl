#include <common>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_SourceScaleOffset; 
uniform float material_farPlaneOverEdgeDistance;
#if SSAO_QUALITY == 0
      #define BLUR_SAMPLE_COUNT 3
#elif SSAO_QUALITY == 1
      #define BLUR_SAMPLE_COUNT 6
#elif SSAO_QUALITY == 2
      #define BLUR_SAMPLE_COUNT 12
#endif

uniform float material_kernel[12]; // Sample weights for bilateral blur

float bilateralWeight(float depth, float sampleDepth) {
      float diff = (sampleDepth - depth) * material_farPlaneOverEdgeDistance;
      return max(0.0, 1.0 - diff * diff);
}

highp float unpack(highp vec2 depth) {
    // depth here only has 8-bits of precision, but the unpacked depth is highp
    // this is equivalent to (x8 * 256 + y8) / 65535, which gives a value between 0 and 1
    return (depth.x * (256.0 / 257.0) + depth.y * (1.0 / 257.0));
}

void tap(const sampler2D saoTexture,
      inout float sum, inout float totalWeight, float weight, float depth, vec2 position) {
      vec4 data = texture2D(saoTexture, position);
      // bilateral sample
      float bilateral = weight * bilateralWeight(depth,  unpack(data.gb));
      sum += data.r * bilateral;
      totalWeight += bilateral;
}

void main(){
      mediump vec4 data = texture2D(renderer_BlitTexture, v_uv);
      float depth = unpack(data.gb);

      // Weight of the center pixel from the Gaussian kernel (typically 1.0)
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

      // simple dithering helps a lot (assumes 8 bits target)
      // this is most useful with high quality/large blurs
      ao += ((interleavedGradientNoise(gl_FragCoord.xy) - 0.5) / 255.0);
      gl_FragColor = vec4(ao, data.gb, 1.0);

}

