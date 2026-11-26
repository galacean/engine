import type { Mesh, Renderer } from "@galacean/engine-core";

/**
 * Lowest-LOD shadow substitute used by `CascadedShadowCasterPass` for far cascades (`cascadeIndex >= 1`).
 * Near cascades (`cascadeIndex === 0`) continue to render the camera-active high-LOD geometry.
 */
export interface FarShadowCascadeProxy {
  /** Substitute lowest-LOD renderers (for multi-renderer LOD groups such as trees and template models). */
  readonly renderers?: readonly Renderer[];
  /** Substitute lowest-LOD mesh rendered through the same MeshRenderer (for single-renderer LODs such as rocks). */
  readonly mesh?: Mesh;
  /** Internal per-frame deduplication stamp so multi-renderer or crossfading LODs submit once per far cascade. */
  _lastFrame: number;
  _lastCascade: number;
}

export interface FarShadowCascadeProxyTarget {
  _farShadowCascadeProxy?: FarShadowCascadeProxy;
}

export function createFarShadowRenderersProxy(renderers: readonly Renderer[]): FarShadowCascadeProxy {
  return { renderers, _lastFrame: -1, _lastCascade: -1 };
}

export function createFarShadowMeshProxy(mesh: Mesh): FarShadowCascadeProxy {
  return { mesh, _lastFrame: -1, _lastCascade: -1 };
}

export function setFarShadowCascadeProxy(renderer: Renderer, proxy: FarShadowCascadeProxy | undefined): void {
  (renderer as Renderer & FarShadowCascadeProxyTarget)._farShadowCascadeProxy = proxy;
}
