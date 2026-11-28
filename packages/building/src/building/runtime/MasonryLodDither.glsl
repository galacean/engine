float renderer_MasonryLodFade;
void masonryLodDither() {
  float fade = renderer_MasonryLodFade;
  if (fade < 1.0) {
    if (fade <= -1.0) discard;
    vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
    vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
    float a = 2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y;
    float b = 2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y;
    float threshold = (4.0 * a + b + 0.5) / 16.0;
    if (fade >= 0.0 ? threshold > fade : threshold <= -fade) discard;
  }
}
