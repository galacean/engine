float soilRevealHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float soilRevealNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 weight = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(soilRevealHash(cell), soilRevealHash(cell + vec2(1.0, 0.0)), weight.x),
    mix(soilRevealHash(cell + vec2(0.0, 1.0)), soilRevealHash(cell + vec2(1.0)), weight.x),
    weight.y
  );
}
// Fixed world-space patches appear together as tool progress increases; no expanding front.
float soilWorkReveal(vec2 worldXZ, float progress) {
  if (progress <= 0.0) return 0.0;
  if (progress >= 1.0) return 1.0;
  vec2 p = worldXZ * 5.0;
  float noise = soilRevealNoise(p) * 0.65 + soilRevealNoise(p * 2.0 + vec2(13.7, 5.3)) * 0.35;
  return smoothstep(-0.08, 0.08, progress * 1.16 - 0.08 - noise);
}
