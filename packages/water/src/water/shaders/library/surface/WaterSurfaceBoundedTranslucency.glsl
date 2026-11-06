#ifndef WATER_SURFACE_BOUNDED_TRANSLUCENCY_INCLUDED
#define WATER_SURFACE_BOUNDED_TRANSLUCENCY_INCLUDED
// Optional artistic transmission lobe. Geometry supplies the normal and mask;
// lighting response is shared and enters FinalClosure before Fresnel and foam.
vec3 waterSurfaceBoundedTranslucency(
  vec3 tint, vec3 lightRadiance, vec3 lightDirection, vec3 viewDirection,
  vec3 normal, float backStrength, float incidentStrength, float exponent,
  float curvatureWeight, float visibility
) {
  float back = pow(max(dot(-viewDirection, lightDirection), 0.0), max(exponent, 1.0)) * max(backStrength, 0.0);
  float incident = max(dot(lightDirection, normal), 0.0) * max(incidentStrength, 0.0);
  float curvature = clamp(mix(1.0, dot(normal, -lightDirection), curvatureWeight), 0.0, 1.0);
  return max(tint, vec3(0.0)) * max(lightRadiance, vec3(0.0)) * (back + incident) * curvature * clamp(visibility, 0.0, 1.0);
}
#endif
