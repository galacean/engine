#include <PostCommon>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 material_BloomParams;  // x: threshold (linear), y: threshold knee, z: scatter
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height

void main(){
	#ifdef BLOOM_HQ
      vec2 texelSize = renderer_texelSize.xy;
      mediump vec4 A = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, -1.0));
      mediump vec4 B = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, -1.0));
      mediump vec4 C = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, -1.0));
      mediump vec4 D = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, -0.5));
      mediump vec4 E = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, -0.5));
      mediump vec4 F = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 0.0));
      mediump vec4 G = texture2DSRGB(renderer_BlitTexture, v_uv);
      mediump vec4 H = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 0.0));
      mediump vec4 I = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(-0.5, 0.5));
      mediump vec4 J = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(0.5, 0.5));
      mediump vec4 K = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(-1.0, 1.0));
      mediump vec4 L = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(0.0, 1.0));
      mediump vec4 M = texture2DSRGB(renderer_BlitTexture, v_uv + texelSize * vec2(1.0, 1.0));

      mediump vec2 scale = vec2(0.5, 0.125);
      mediump vec2 div = (1.0 / 4.0) * scale;

      mediump vec4 samplerColor = (D + E + I + J) * div.x;
      samplerColor += (A + B + G + F) * div.y;
      samplerColor += (B + C + H + G) * div.y;
      samplerColor += (F + G + L + K) * div.y;
      samplerColor += (G + H + M + L) * div.y;
    #else
      mediump vec4 samplerColor = texture2DSRGB(renderer_BlitTexture, v_uv);
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
    
    gl_FragColor = outputSRGBCorrection(gl_FragColor);
}