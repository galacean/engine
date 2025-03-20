#include <PostCommon>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 material_BloomParams;  // x: threshold (linear), y: threshold knee, z: scatter
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
	#ifdef BLOOM_HQ
      vec2 texelSize = renderer_texelSize.xy;
      mediump vec4 A = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, -1.0));
      mediump vec4 B = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, -1.0));
      mediump vec4 C = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, -1.0));
      mediump vec4 D = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, -0.5));
      mediump vec4 E = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, -0.5));
      mediump vec4 F = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 0.0));
      mediump vec4 G = sampleTexture(renderer_BlitTexture, v_uv);
      mediump vec4 H = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 0.0));
      mediump vec4 I = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, 0.5));
      mediump vec4 J = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, 0.5));
      mediump vec4 K = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 1.0));
      mediump vec4 L = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, 1.0));
      mediump vec4 M = sampleTexture(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 1.0));

      mediump vec2 scale = vec2(0.5, 0.125);
      mediump vec2 div = (1.0 / 4.0) * scale;

      mediump vec4 samplerColor = (D + E + I + J) * div.x;
      samplerColor += (A + B + G + F) * div.y;
      samplerColor += (B + C + H + G) * div.y;
      samplerColor += (F + G + L + K) * div.y;
      samplerColor += (G + H + M + L) * div.y;
    #else
      mediump vec4 samplerColor = sampleTexture(renderer_BlitTexture, v_uv);
    #endif

    mediump vec3 color = samplerColor.rgb;

    // User controlled clamp to limit crazy high broken spec
    color = min(color, HALF_MAX);

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

    gl_FragColor = vec4(color, samplerColor.a);
    
    gl_FragColor = linearToGamma(gl_FragColor);
}