/**
 * Shader properties data of spot lights in the scene.
 */
export interface ISpotLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light Color.
  color: Float32Array;
  // Light position.
  position: Float32Array;
  // Light direction
  direction: Float32Array;
  // Defines a distance cutoff at which the light's intensity must be considered zero.
  distance: Float32Array;
  // Angle, in radians, from centre of spotlight where falloff begins.
  angleCos: Float32Array;
  // Angle, in radians, from falloff begins to ends.
  penumbraCos: Float32Array;
}
