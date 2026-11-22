#ifndef BLOOM_PREFILTER
#define BLOOM_PREFILTER

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 material_BloomParams;
float material_PostExposure;
vec4 renderer_texelSize;

void frag(Varyings v) {
    #ifdef BLOOM_HQ
      // material_BloomParams.w scales step to match Half (1.0) or Quarter (2.0) prefilter footprint
      vec2 t = renderer_texelSize.xy * material_BloomParams.w;
      vec2 h = t * 0.5;

      // Pre-weight samples to avoid mediump (fp16) overflow
      mediump vec3 color = texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x, -t.y)).rgb * 0.03125;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( 0.0, -t.y)).rgb * 0.0625;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x, -t.y)).rgb * 0.03125;

      color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-h.x, -h.y)).rgb * 0.125;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( h.x, -h.y)).rgb * 0.125;

      color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  0.0)).rgb * 0.0625;
      color += texture2D(renderer_BlitTexture, v.v_uv                   ).rgb * 0.125;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  0.0)).rgb * 0.0625;

      color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-h.x,  h.y)).rgb * 0.125;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( h.x,  h.y)).rgb * 0.125;

      color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  t.y)).rgb * 0.03125;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( 0.0,  t.y)).rgb * 0.0625;
      color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  t.y)).rgb * 0.03125;
    #else
      mediump vec3 color;
      if (material_BloomParams.w > 1.5) {
        // 4-tap box covers all 16 source pixels of a Quarter (4x) cell without blind spots
        vec2 t = renderer_texelSize.xy;
        color = texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x, -t.y)).rgb * 0.25;
        color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x, -t.y)).rgb * 0.25;
        color += texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  t.y)).rgb * 0.25;
        color += texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  t.y)).rgb * 0.25;
      } else {
        color = texture2D(renderer_BlitTexture, v.v_uv).rgb;
      }
    #endif

    // Reject NaN/Inf before clamping: min(NaN, HALF_MAX) evaluates to HALF_MAX under IEEE minNum / Metal fmin
    color = mix(vec3(0.0), color, lessThanEqual(abs(color), vec3(HALF_MAX)));
    color = clamp(vec3(color) * material_PostExposure, vec3(0.0), vec3(HALF_MAX));

    // Thresholding
    mediump float brightness = max3(color);
    float threshold = material_BloomParams.x;
    float thresholdKnee = material_BloomParams.y;
    mediump float softness = clamp(brightness - threshold + thresholdKnee, 0.0, 2.0 * thresholdKnee);
    softness = (softness * softness) / (4.0 * thresholdKnee + 1e-4);
    mediump float multiplier = max(brightness - threshold, softness) / max(brightness, 1e-4);
    color *= multiplier;

    // Clamp colors to positive once in prefilter. Encode can have a sqrt, and sqrt(-x) == NaN. Up/Downsample passes would then spread the NaN.
    color = max(color, 0.0);

    // Bloom is addtive blend mode, we should set alpha 0 to avoid browser background color dark when canvas alpha and premultiplyAlpha is true
    gl_FragColor = vec4(color, 0.0);
}

#endif
