#ifndef WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
#define WATER_SURFACE_APPEARANCE_V2_FUNCTIONS_INCLUDED
{{DEPTH_FUNCTIONS}}
{{NORMAL_FUNCTIONS}}
float waterSurfaceAppearanceV2RefractionValidity(
  float insideScreen,
  float waterCoverage,
  float shoreSafety,
  float centeredGeometryBehindSurface,
  float shiftedGeometryBehindSurface,
  float shiftedDepthContinuity
) {
  return clamp(insideScreen, 0.0, 1.0)
    * clamp(waterCoverage, 0.0, 1.0)
    * clamp(shoreSafety, 0.0, 1.0)
    * clamp(centeredGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedGeometryBehindSurface, 0.0, 1.0)
    * clamp(shiftedDepthContinuity, 0.0, 1.0);
}
#endif
