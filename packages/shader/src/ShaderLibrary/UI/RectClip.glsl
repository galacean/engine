#ifndef UI_RECT_CLIP_INCLUDED
#define UI_RECT_CLIP_INCLUDED

vec4 renderer_UIRectClipRect;
float renderer_UIRectClipEnabled;

void clipUIRect(vec2 worldPosition) {
  if (renderer_UIRectClipEnabled > 0.5) {
    vec4 distance = vec4(worldPosition - renderer_UIRectClipRect.xy, renderer_UIRectClipRect.zw - worldPosition);
    if (min(min(distance.x, distance.y), min(distance.z, distance.w)) < 0.0) discard;
  }
}

#endif
