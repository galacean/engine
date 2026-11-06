#ifndef WORLD_SELECTION_INCLUDED
#define WORLD_SELECTION_INCLUDED
float renderer_WorldSelectionMode;
vec4 renderer_WorldSelectionAppearance;
sampler2D renderer_WorldSelectionTexture;
vec4 renderer_WorldSelectionLayout;
float worldSelectionWeight(float index) {
  if (renderer_WorldSelectionMode < 0.5) return 0.0;
  if (renderer_WorldSelectionMode < 1.5) return 1.0;
  vec2 uv = (vec2(mod(index, renderer_WorldSelectionLayout.x), floor(index / renderer_WorldSelectionLayout.x)) + 0.5) / renderer_WorldSelectionLayout.xy;
  return texture2D(renderer_WorldSelectionTexture, uv).r;
}
float worldSelectionRegionWeight(vec2 worldXZ) {
  if (renderer_WorldSelectionMode < 2.5) return 0.0;
  vec2 uv = (worldXZ - renderer_WorldSelectionLayout.xy) * renderer_WorldSelectionLayout.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return texture2D(renderer_WorldSelectionTexture, uv).a;
}
vec4 worldSelectionColor(vec4 color, float weight) {
  if (weight > 0.0) {
    vec2 p = gl_FragCoord.xy * renderer_WorldSelectionAppearance.yz * 2.0;
    float phase = renderer_WorldSelectionAppearance.x * 6.2831853;
    // Smooth warped colour pools instead of parallel rainbow stripes. Exact 2.4s loop.
    float field = p.y * 3.0 + sin(p.x * 4.0 + p.y * 2.0) * 0.7;
    float flow = field + phase + 0.24 * sin(phase + p.x * 5.0);
    // Match the saturated spectrum used by generation reveal effects.
    vec3 film = 0.54 + 0.46 * cos(flow + 6.2831853 * vec3(0.03, 0.36, 0.69));
    float sheen = pow(0.5 + 0.5 * sin(flow + p.x * 1.4), 8.0);
    // HDR emission feeds the existing scene Bloom before tonemapping.
    vec3 highlighted = mix(color.rgb, film, 0.82) + film * (1.2 + sheen * 0.8);
    // Fade the entire highlight, including HDR emission, back to the live material.
    float breath = 0.5 - 0.5 * cos(phase);
    color.rgb = mix(color.rgb, highlighted, weight * renderer_WorldSelectionAppearance.w * breath);
  }
  return color;
}
#endif
