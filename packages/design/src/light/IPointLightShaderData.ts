/**
 * Shader properties data of point lights in the scene.
 */
export interface IPointLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light color.
  color: Float32Array;
  // Light position.
  position: Float32Array;
  // Defines a distance cutoff at which the light's intensity must be considered zero.
  distance: Float32Array;
}
