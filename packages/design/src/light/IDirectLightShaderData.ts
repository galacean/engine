/**
 * Shader properties data of direct lights in the scene.
 */
export interface IDirectLightShaderData {
  // Culling mask - which layers the light affect.
  cullingMask: Int32Array;
  // Light color.
  color: Float32Array;
  // Light direction.
  direction: Float32Array;
}
