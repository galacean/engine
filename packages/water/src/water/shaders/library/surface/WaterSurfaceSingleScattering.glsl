#ifndef WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
#define WATER_SURFACE_SINGLE_SCATTERING_INCLUDED
struct WaterSingleScatteringResult {
  vec3 transmittance;
  vec3 lightTransmittance;
  vec3 scattering;
};

float waterScatteringPhase(float phaseG, float cosine) {
  float g = clamp(phaseG, -0.95, 0.95);
  // UE Schlick approximation with a positivity guard at the authoring limits.
  float k = clamp(1.55 * g - 0.55 * g * g * g, -0.99, 0.99);
  float denominator = 1.0 + k * clamp(cosine, -1.0, 1.0);
  return (1.0 - k * k) / (12.5663706144 * denominator * denominator);
}

WaterSingleScatteringResult waterEvaluateSingleScattering(
  vec3 absorption, vec3 scatteringCoefficient, float phaseG,
  float opticalDistance, float lightDistance, float phaseCosine,
  vec3 sunRadiance, vec3 ambientRadiance
) {
  WaterSingleScatteringResult result;
  vec3 sigmaS = max(scatteringCoefficient, vec3(0.0));
  vec3 sigmaT = max(absorption, vec3(0.0)) + sigmaS;
  result.transmittance = exp(-sigmaT * max(opticalDistance, 0.0));
  result.lightTransmittance = exp(-sigmaT * max(lightDistance, 0.0));
  vec3 incoming = max(sunRadiance, vec3(0.0)) * waterScatteringPhase(phaseG, phaseCosine)
    + max(ambientRadiance, vec3(0.0)) / 12.5663706144;
  result.scattering = incoming * clamp(
    sigmaS * (1.0 - result.transmittance) / max(sigmaT, vec3(0.00001)), vec3(0.0), vec3(1.0)
  );
  return result;
}
#endif
