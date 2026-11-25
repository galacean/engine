#ifndef UI_RECT_CLIP_INCLUDED
#define UI_RECT_CLIP_INCLUDED

#ifdef RENDERER_ENABLE_UI_RECT_CLIP
vec4 renderer_UIRectClipRect;
vec4 renderer_UIRectClipAxisX;
vec4 renderer_UIRectClipAxisY;

vec2 getUIRectClipPosition(vec3 worldPosition) {
  vec4 p = vec4(worldPosition, 1.0);
  return vec2(dot(p, renderer_UIRectClipAxisX), dot(p, renderer_UIRectClipAxisY));
}

void clipUIRect(vec2 clipPosition) {
  vec4 distance = vec4(clipPosition - renderer_UIRectClipRect.xy, renderer_UIRectClipRect.zw - clipPosition);
  if (min(min(distance.x, distance.y), min(distance.z, distance.w)) < 0.0) discard;
}
#endif

#endif
