#include <common>

uniform sampler2D material_SpineTexture;
uniform float renderer_PremultipliedAlpha;

varying vec2 v_uv;
varying vec4 v_lightColor;

#ifdef RENDERER_TINT_BLACK
  varying vec3 v_darkColor;
#endif

#ifdef RENDERER_UI_RECT_CLIP
  uniform vec4 renderer_UIRectClipRect;
  uniform float renderer_UIRectClipEnabled;
  uniform vec4 renderer_UIRectClipSoftness;
  uniform float renderer_UIRectClipHardClip;

  varying vec2 v_worldPosition;

  float getUIRectClipAlpha() {
      vec4 edgeDistance = vec4(
          v_worldPosition.x - renderer_UIRectClipRect.x,
          v_worldPosition.y - renderer_UIRectClipRect.y,
          renderer_UIRectClipRect.z - v_worldPosition.x,
          renderer_UIRectClipRect.w - v_worldPosition.y
      );
      vec4 hardClipFactor = step(vec4(0.0), edgeDistance);
      vec4 softness = max(renderer_UIRectClipSoftness, vec4(1e-5));
      vec4 softClipFactor = clamp(edgeDistance / softness, 0.0, 1.0);
      vec4 useSoftness = step(vec4(1e-5), renderer_UIRectClipSoftness);
      vec4 clipFactor = mix(hardClipFactor, softClipFactor, useSoftness);
      return clipFactor.x * clipFactor.y * clipFactor.z * clipFactor.w;
  }
#endif

void main()
{
  vec4 texColor = texture2D(material_SpineTexture, v_uv);
  vec4 lightColor = sRGBToLinear(v_lightColor);

  #ifdef RENDERER_TINT_BLACK
    vec4 darkColor = sRGBToLinear(vec4(v_darkColor, 1.0));
    vec3 dark_premult = (texColor.a - texColor.rgb) * darkColor.rgb;
    vec3 dark_nonpremult = (1.0 - texColor.rgb) * darkColor.rgb;
    vec3 dark = mix(dark_nonpremult, dark_premult, renderer_PremultipliedAlpha);
    vec3 light = texColor.rgb * lightColor.rgb;
    gl_FragColor.rgb = dark + light;
    gl_FragColor.a = texColor.a * lightColor.a;
  #else
    gl_FragColor = texColor * lightColor;
  #endif

  #ifdef RENDERER_UI_RECT_CLIP
    if (renderer_UIRectClipEnabled > 0.5) {
        float rectClipAlpha = getUIRectClipAlpha();
        // Non-PMA blending scales rgb by src alpha at blend time; PMA (and PMA-additive, whose
        // rgb ignores alpha entirely) needs rgb faded explicitly.
        gl_FragColor.a *= rectClipAlpha;
        gl_FragColor.rgb *= mix(1.0, rectClipAlpha, renderer_PremultipliedAlpha);
        // Hard clip discards on the rect factor, not final alpha: additive slots legitimately
        // emit zero-alpha fragments with visible rgb.
        if (renderer_UIRectClipHardClip > 0.5 && rectClipAlpha < 0.001) {
            discard;
        }
    }
  #endif

  #ifdef ENGINE_SHOULD_SRGB_CORRECT
    gl_FragColor = outputSRGBCorrection(gl_FragColor);
  #endif
}
