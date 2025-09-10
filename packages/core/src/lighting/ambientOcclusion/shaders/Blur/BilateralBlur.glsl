#include <common>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_SourceScaleOffset; 
uniform sampler2D camera_DepthTexture;
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

void tap(const sampler2D saoTexture,
      inout float sum, inout float totalWeight, float weight, float depth, vec2 position) {
      float aoTexture = texture2D(saoTexture, position).r;
      float sampleDepth = texture2D(camera_DepthTexture, position).r;
      // bilateral sample
      float bilateral = weight * bilateralWeight(depth, sampleDepth);
      sum += aoTexture * bilateral;
      totalWeight += bilateral;
}

void main(){
      mediump vec4 color = texture2D(renderer_BlitTexture, v_uv);

      float depth = texture2D(camera_DepthTexture, v_uv).r;
      // Weight of the center pixel from the Gaussian kernel (typically 1.0)
      float totalWeight = material_kernel[0];
      float sum = color.r * totalWeight;
      
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
      color = vec4(vec3(ao), 1.0);

      gl_FragColor = color;
}

