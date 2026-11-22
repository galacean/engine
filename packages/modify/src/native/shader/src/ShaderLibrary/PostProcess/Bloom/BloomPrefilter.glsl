#ifndef BLOOM_PREFILTER
#define BLOOM_PREFILTER

#include "ShaderLibrary/PostProcess/PostCommon.glsl"

// R11G11B10_UFloat max finite value is 64512.0 (10-bit B channel; R/G max is 65024.0).
// Keep headroom below 64512.0 so prefilter/downsample/upsample never overflow to +Inf.
#define BLOOM_CLAMP_MAX 64000.0

mediump sampler2D renderer_BlitTexture;
vec4 material_BloomParams;
float material_PostExposure;
vec4 renderer_texelSize;

mediump vec3 sanitizeBloomSample(vec3 color) {
    // Reject NaN/Inf before clamping: under IEEE minNum / Metal fmin, min(NaN, MAX) returns MAX
    // instead of 0, turning a single invalid HDR pixel into a bright bloom flash.
    bvec3 invalid = bvec3(
        isnan(color.r) || isinf(color.r),
        isnan(color.g) || isinf(color.g),
        isnan(color.b) || isinf(color.b)
    );
    return clamp(mix(color, vec3(0.0), invalid), vec3(0.0), vec3(BLOOM_CLAMP_MAX));
}

void frag(Varyings v) {
    #ifdef BLOOM_HQ
      // material_BloomParams.w scales step to match Half (1.0) or Quarter (2.0) prefilter footprint
      vec2 t = renderer_texelSize.xy * material_BloomParams.w;
      vec2 h = t * 0.5;

      // Pre-weight sanitized samples to avoid mediump (fp16) overflow and NaN/Inf propagation
      mediump vec3 color = sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x, -t.y)).rgb) * 0.03125;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( 0.0, -t.y)).rgb) * 0.0625;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x, -t.y)).rgb) * 0.03125;

      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-h.x, -h.y)).rgb) * 0.125;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( h.x, -h.y)).rgb) * 0.125;

      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  0.0)).rgb) * 0.0625;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv                   ).rgb) * 0.125;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  0.0)).rgb) * 0.0625;

      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-h.x,  h.y)).rgb) * 0.125;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( h.x,  h.y)).rgb) * 0.125;

      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  t.y)).rgb) * 0.03125;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( 0.0,  t.y)).rgb) * 0.0625;
      color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  t.y)).rgb) * 0.03125;
    #else
      mediump vec3 color;
      if (material_BloomParams.w > 1.5) {
        // 4-tap box covers all 16 source pixels of a Quarter (4x) cell without blind spots
        vec2 t = renderer_texelSize.xy;
        color = sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x, -t.y)).rgb) * 0.25;
        color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x, -t.y)).rgb) * 0.25;
        color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2(-t.x,  t.y)).rgb) * 0.25;
        color += sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv + vec2( t.x,  t.y)).rgb) * 0.25;
      } else {
        color = sanitizeBloomSample(texture2D(renderer_BlitTexture, v.v_uv).rgb);
      }
    #endif

    color = sanitizeBloomSample(vec3(color) * material_PostExposure);

    // Thresholding
    mediump float brightness = max3(color);
    float threshold = material_BloomParams.x;
    float thresholdKnee = material_BloomParams.y;
    mediump float softness = clamp(brightness - threshold + thresholdKnee, 0.0, 2.0 * thresholdKnee);
    softness = (softness * softness) / (4.0 * thresholdKnee + 1e-4);
    mediump float multiplier = max(brightness - threshold, softness) / max(brightness, 1e-4);
    color *= multiplier;

    // Clamp colors to [0, BLOOM_CLAMP_MAX] once in prefilter so downstream R11G11B10_UFloat passes never see negative/NaN/+Inf.
    color = clamp(color, vec3(0.0), vec3(BLOOM_CLAMP_MAX));

    // Bloom is addtive blend mode, we should set alpha 0 to avoid browser background color dark when canvas alpha and premultiplyAlpha is true
    gl_FragColor = vec4(color, 0.0);
}

#endif
