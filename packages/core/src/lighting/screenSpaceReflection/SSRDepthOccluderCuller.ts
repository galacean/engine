import type { BoundingBox, Matrix } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { RenderElement } from "../../RenderPipeline/RenderElement";

/**
 * Zero-GC occluder filter for SSR's fallback DepthOnly pass.
 * Excludes opted-out materials and tiny sub-pixel bounding spheres.
 * @internal
 */
export class SSRDepthOccluderCuller {
  /** Minimum bounding-sphere screen height fraction on the trace depth RT for fallback DepthOnly occluders. */
  private static readonly _MIN_OCCLUDER_HEIGHT_FRACTION = 0.04;

  private _viewZ0 = 0;
  private _viewZ1 = 0;
  private _viewZ2 = 0;
  private _viewZ3 = 0;
  private _viewZScale = 1;
  private _near = 0.1;
  private _projScale = 0;
  private _minPixels = 0;
  private _isOrtho = false;

  readonly isOccluderElement = (element: RenderElement): boolean => {
    if (!element.material.screenSpaceReflectionOccluder) {
      return false;
    }
    if (this._isBoundsLargeEnoughForDepth(element.component.bounds)) {
      return true;
    }
    const instanced = element.instancedRenderers;
    if (instanced) {
      for (let i = 0, n = instanced.length; i < n; i++) {
        if (this._isBoundsLargeEnoughForDepth(instanced[i].bounds)) {
          return true;
        }
      }
    }
    return false;
  };

  prepare(camera: Camera, traceHeight: number, viewMatrix?: Matrix): void {
    const viewE = (viewMatrix ?? camera.viewMatrix).elements;
    this._viewZ0 = viewE[2];
    this._viewZ1 = viewE[6];
    this._viewZ2 = viewE[10];
    this._viewZ3 = viewE[14];
    this._viewZScale = Math.hypot(this._viewZ0, this._viewZ1, this._viewZ2) || 1;
    this._near = Math.max(1e-4, camera.nearClipPlane);
    this._isOrtho = camera.isOrthographic;
    const m5 = camera.projectionMatrix.elements[5];
    this._projScale = Number.isFinite(m5) && m5 !== 0 ? Math.abs(m5) * traceHeight : 0;
    this._minPixels = Math.max(1.5, traceHeight * SSRDepthOccluderCuller._MIN_OCCLUDER_HEIGHT_FRACTION);
  }

  private _isBoundsLargeEnoughForDepth(bounds: BoundingBox): boolean {
    const minPixels = this._minPixels;
    const projScale = this._projScale;
    if (!(minPixels > 0 && projScale > 0)) {
      return true;
    }
    const min = bounds.min;
    const max = bounds.max;
    const dx = max.x - min.x;
    const dy = max.y - min.y;
    const dz = max.z - min.z;
    const diagSq = dx * dx + dy * dy + dz * dz;
    if (!(diagSq > 0) || !Number.isFinite(diagSq)) {
      return true;
    }
    const halfDiag = 0.5 * Math.sqrt(diagSq);
    if (this._isOrtho) {
      return halfDiag * projScale >= minPixels;
    }
    const cx = (min.x + max.x) * 0.5;
    const cy = (min.y + max.y) * 0.5;
    const cz = (min.z + max.z) * 0.5;
    const centerDepth = -(this._viewZ0 * cx + this._viewZ1 * cy + this._viewZ2 * cz + this._viewZ3);
    const sphereRadiusVS = halfDiag * this._viewZScale;
    const effDist = centerDepth - sphereRadiusVS;
    if (effDist <= this._near) {
      return true;
    }
    return (sphereRadiusVS * projScale) / effDist >= minPixels;
  }
}
