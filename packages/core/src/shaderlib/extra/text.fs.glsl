uniform sampler2D renderElement_TextTexture;
uniform vec4 renderer_UIRectClipRect;
uniform float renderer_UIRectClipEnabled;
uniform vec4 renderer_UIRectClipSoftness;
uniform float renderer_UIRectClipHardClip;

varying vec2 v_uv;
varying vec4 v_color;
varying vec2 v_worldPosition;

float getUIRectClipAlpha()
{
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

void main()
{
  float rectClipAlpha = 1.0;
  if (renderer_UIRectClipEnabled > 0.5) {
    rectClipAlpha = getUIRectClipAlpha();
  }

  vec4 texColor = texture2D(renderElement_TextTexture, v_uv);
  #ifdef GRAPHICS_API_WEBGL2
    float coverage = texColor.r;
  #else
    float coverage = texColor.a;
  #endif
  vec4 finalColor = vec4(v_color.rgb, v_color.a * coverage);
  finalColor.a *= rectClipAlpha;
  if (renderer_UIRectClipEnabled > 0.5 && renderer_UIRectClipHardClip > 0.5 && finalColor.a < 0.001) {
    discard;
  }
  gl_FragColor = finalColor;
}
