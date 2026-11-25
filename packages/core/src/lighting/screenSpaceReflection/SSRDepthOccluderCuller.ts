import type { BoundingBox, Matrix } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { RenderElement } from "../../RenderPipeline/RenderElement";

/**
 * Zero-GC occluder filter for SSR's fallback DepthOnly pass.
 * Excludes opted-out materials and small screen-space bounding spheres.
 * @internal
 */
export class SSRDepthOccluderCuller {
  /** Minimum bounding-sphere projected diameter fraction of the trace depth RT short edge. */
  private static readonly _MIN_OCCLUDER_SHORT_EDGE_FRACTION = 0.04;

  // Perspective view-Z row and near plane pre-scaled by `-2 / viewZScale` (`+2 / viewZScale` for near)
  // so bounding-box diagonal (`diagSq`) can be compared directly without per-object `Math.sqrt`.
  private _viewZ0 = 0;
  private _viewZ1 = 0;
  private _viewZ2 = 0;
  private _viewZ3 = 0;
  private _scaledNear = 0;
  // Strictly in `(0, 1)` when perspective culling is active; `0` means orthographic (`_minDiagSq > 0`) or disabled (`_minDiagSq = 0`).
  private _perspRatio = 0;
  private _minDiagSq = 0;

  /** Pre-bound element filter passed to `RenderQueue.render` during fallback DepthOnly. */
  readonly isOccluderElement = (element: RenderElement): boolean => {
    if (!element.material.screenSpaceReflectionOccluder) {
      return false;
    }
    const instanced = element.instancedRenderers;
    if (instanced.length > 0) {
      for (let i = 0, n = instanced.length; i < n; i++) {
        if (this._isBoundsLargeEnoughForDepth(instanced[i].bounds)) {
          return true;
        }
      }
      return false;
    }
    return this._isBoundsLargeEnoughForDepth(element.component.bounds);
  };

  /**
   * Cache per-frame camera projection and view-depth parameters for occluder culling.
   */
  prepare(
    camera: Camera,
    traceWidth: number,
    traceHeight: number,
    viewMatrix?: Matrix,
    projectionMatrix?: Matrix
  ): void {
    this._perspRatio = 0;
    this._minDiagSq = 0;

    if (!(traceWidth > 0 && traceWidth < Infinity && traceHeight > 0 && traceHeight < Infinity)) {
      return;
    }

    const viewE = (viewMatrix ?? camera.viewMatrix).elements;
    const vz0 = viewE[2];
    const vz1 = viewE[6];
    const vz2 = viewE[10];
    const viewZScaleSq = vz0 * vz0 + vz1 * vz1 + vz2 * vz2;

    const projE = (projectionMatrix ?? camera.projectionMatrix).elements;
    const projScale = Math.max(Math.abs(projE[0]) * traceWidth, Math.abs(projE[5]) * traceHeight);
    if (!(viewZScaleSq > 0 && viewZScaleSq < Infinity && projScale > 0 && projScale < Infinity)) {
      return;
    }

    const shortEdge = traceWidth < traceHeight ? traceWidth : traceHeight;
    const minPixels = Math.max(1.5, shortEdge * SSRDepthOccluderCuller._MIN_OCCLUDER_SHORT_EDGE_FRACTION);

    if (camera.isOrthographic) {
      const orthoRatio = minPixels / projScale;
      this._minDiagSq = (orthoRatio * orthoRatio) / (0.25 * viewZScaleSq);
      return;
    }

    const vz3 = viewE[14];
    const near = camera.nearClipPlane;
    if (!Number.isFinite(vz3) || !Number.isFinite(near)) {
      return;
    }

    const invHalfViewZ = 2 / Math.sqrt(viewZScaleSq);
    this._viewZ0 = -vz0 * invHalfViewZ;
    this._viewZ1 = -vz1 * invHalfViewZ;
    this._viewZ2 = -vz2 * invHalfViewZ;
    this._viewZ3 = -vz3 * invHalfViewZ;
    this._scaledNear = Math.max(1e-4, near) * invHalfViewZ;
    this._perspRatio = minPixels / (projScale + minPixels);
  }

  private _isBoundsLargeEnoughForDepth(bounds: BoundingBox): boolean {
    const min = bounds.min;
    const max = bounds.max;
    const dx = max.x - min.x;
    const dy = max.y - min.y;
    const dz = max.z - min.z;
    if (dx < 0 || dy < 0 || dz < 0) {
      return true;
    }
    const diagSq = dx * dx + dy * dy + dz * dz;
    if (!(diagSq > 0 && diagSq < Infinity)) {
      return true;
    }
    const ratio = this._perspRatio;
    if (ratio === 0) {
      return diagSq >= this._minDiagSq;
    }
    const depth =
      this._viewZ0 * (min.x + dx * 0.5) +
      this._viewZ1 * (min.y + dy * 0.5) +
      this._viewZ2 * (min.z + dz * 0.5) +
      this._viewZ3;
    const nearThresh = depth - this._scaledNear;
    const projThresh = depth * ratio;
    const minDiag = nearThresh < projThresh ? nearThresh : projThresh;
    return !(minDiag > 0) || diagSq >= minDiag * minDiag;
  }
}
