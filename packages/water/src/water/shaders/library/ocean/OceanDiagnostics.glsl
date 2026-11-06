#ifndef WATER_OCEAN_DIAGNOSTICS_INCLUDED
#define WATER_OCEAN_DIAGNOSTICS_INCLUDED

// Linear colors; the common output stage applies the display transfer function.
vec3 oceanDepthDensityColor(float density) {
  return mix(vec3(0.12, 0.80, 0.68), vec3(0.008, 0.035, 0.20), clamp(density, 0.0, 1.0));
}

vec3 oceanUnavailableDiagnosticColor() {
  float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 18.0));
  return mix(vec3(0.075, 0.060, 0.10), vec3(0.12, 0.10, 0.16), stripe);
}

#endif
