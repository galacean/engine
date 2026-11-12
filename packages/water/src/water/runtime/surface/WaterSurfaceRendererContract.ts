/** Renderer invariants shared by every physical water-surface backend. */
export interface WaterSurfaceRendererShadowState {
  castShadows: boolean;
  receiveShadows: boolean;
}

/** Water surfaces do not cast or receive opaque shadows. */
export function applyWaterSurfaceRendererContract(renderer: WaterSurfaceRendererShadowState): void {
  renderer.castShadows = false;
  renderer.receiveShadows = false;
}
