/** Renderer invariants shared by every physical water-surface backend. */
export interface WaterSurfaceRendererShadowState {
  castShadows: boolean;
  receiveShadows: boolean;
}

/** Water never casts opaque shadows. Single-scattering surfaces may shadow their direct light only. */
export function applyWaterSurfaceRendererContract(
  renderer: WaterSurfaceRendererShadowState,
  receiveDirectLightShadows = false
): void {
  renderer.castShadows = false;
  renderer.receiveShadows = receiveDirectLightShadows;
}
