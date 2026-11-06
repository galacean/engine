import { ContainmentType, type BoundingBox, type Plane } from "@galacean/engine-math";
import type { Camera } from "../Camera";
import type { Renderer } from "../Renderer";
import type { VirtualCamera } from "../VirtualCamera";
import type { RenderContext } from "./RenderContext";

/** Render view whose visible batch content is being requested. */
export enum RenderViewType {
  /** Main Camera view shared by depth and forward passes. */
  Camera,
  /** One directional-light shadow cascade. */
  ShadowCascade
}

/** Ephemeral view state supplied to one externally managed batch source. */
export interface RenderViewCullingContext {
  /** Current render-view kind. */
  readonly viewType: RenderViewType;
  /** Camera which owns the render pipeline. */
  readonly camera: Camera;
  /** Exact virtual Camera used by this view. */
  readonly virtualCamera: VirtualCamera;
  /** Zero-based cascade index, or `-1` for the main Camera view. */
  readonly shadowCascadeIndex: number;

  /**
   * Tests source-owned world Bounds against the current view.
   * @param bounds - The source-owned world Bounds
   * @returns Whether the Bounds intersect this view
   */
  isVisible(bounds: BoundingBox): boolean;

  /**
   * Classifies world Bounds against this view's culling planes.
   * Fully contained Bounds allow the source to skip plane tests for enclosed child Bounds.
   * @param bounds - The source-owned world Bounds
   * @returns Whether the Bounds are outside, fully inside, or intersecting this view
   */
  classifyBounds(bounds: BoundingBox): ContainmentType;

  /**
   * Submits one source-owned Renderer after the source has populated its visible batch.
   * The Renderer may be disabled to keep it outside normal scene traversal.
   * @param renderer - The source-owned Renderer to submit
   */
  submit(renderer: Renderer): void;
}

/** Batch owner which performs its own coarse and fine culling for every render view. */
export interface RenderViewCullingSource {
  /**
   * Builds and submits only the batches visible in the supplied view.
   * @param context - Ephemeral culling and submission context for this view
   */
  cull(context: RenderViewCullingContext): void;
}

/** Idempotent handle returned for one render-view culling source registration. */
export interface RenderViewCullingSourceRegistration {
  /**
   * Removes this source from the Camera's main and shadow views.
   */
  unregister(): void;
}

/** @internal */
export class RenderViewCullingContextImpl implements RenderViewCullingContext {
  private _renderContext: RenderContext;
  private _viewType = RenderViewType.Camera;
  private _shadowCascadeIndex = -1;
  private _shadowCullPlanes: readonly Plane[] | null = null;
  private _shadowCullPlaneCount = 0;
  private _lightCullingMask = 0;

  get viewType(): RenderViewType {
    return this._viewType;
  }

  get camera(): Camera {
    return this._renderContext.camera;
  }

  get virtualCamera(): VirtualCamera {
    return this._renderContext.virtualCamera;
  }

  get shadowCascadeIndex(): number {
    return this._shadowCascadeIndex;
  }

  /** @internal */
  _setCamera(renderContext: RenderContext): void {
    this._renderContext = renderContext;
    this._viewType = RenderViewType.Camera;
    this._shadowCascadeIndex = -1;
    this._shadowCullPlanes = null;
    this._shadowCullPlaneCount = 0;
    this._lightCullingMask = 0;
  }

  /** @internal */
  _setShadowCascade(
    renderContext: RenderContext,
    shadowCascadeIndex: number,
    cullPlanes: readonly Plane[],
    cullPlaneCount: number,
    lightCullingMask: number
  ): void {
    this._renderContext = renderContext;
    this._viewType = RenderViewType.ShadowCascade;
    this._shadowCascadeIndex = shadowCascadeIndex;
    this._shadowCullPlanes = cullPlanes;
    this._shadowCullPlaneCount = cullPlaneCount;
    this._lightCullingMask = lightCullingMask;
  }

  isVisible(bounds: BoundingBox): boolean {
    if (this._viewType === RenderViewType.Camera) {
      const camera = this._renderContext.camera;
      return !camera.enableFrustumCulling || camera._frustum.intersectsBox(bounds);
    }

    const { min, max } = bounds;
    const cullPlanes = this._shadowCullPlanes!;
    for (let i = 0; i < this._shadowCullPlaneCount; i++) {
      const plane = cullPlanes[i];
      const normal = plane.normal;
      if (
        normal.x * (normal.x >= 0 ? max.x : min.x) +
          normal.y * (normal.y >= 0 ? max.y : min.y) +
          normal.z * (normal.z >= 0 ? max.z : min.z) <
        -plane.distance
      ) {
        return false;
      }
    }
    return true;
  }

  classifyBounds(bounds: BoundingBox): ContainmentType {
    const camera = this._renderContext.camera;
    const frustum = this._viewType === RenderViewType.Camera ? camera._frustum : null;
    if (frustum && !camera.enableFrustumCulling) {
      return ContainmentType.Contains;
    }

    const { min, max } = bounds;
    const cullPlanes = this._shadowCullPlanes!;
    const planeCount = frustum ? 6 : this._shadowCullPlaneCount;
    let result = ContainmentType.Contains;
    for (let i = 0; i < planeCount; i++) {
      const plane = frustum ? frustum.getPlane(i)! : cullPlanes[i];
      const normal = plane.normal;
      if (
        normal.x * (normal.x >= 0 ? max.x : min.x) +
          normal.y * (normal.y >= 0 ? max.y : min.y) +
          normal.z * (normal.z >= 0 ? max.z : min.z) <
        -plane.distance
      ) {
        return ContainmentType.Disjoint;
      }
      if (
        result === ContainmentType.Contains &&
        normal.x * (normal.x >= 0 ? min.x : max.x) +
          normal.y * (normal.y >= 0 ? min.y : max.y) +
          normal.z * (normal.z >= 0 ? min.z : max.z) <
          -plane.distance
      ) {
        result = ContainmentType.Intersects;
      }
    }
    return result;
  }

  submit(renderer: Renderer): void {
    if (renderer.destroyed || renderer.pendingDestroy || !renderer.entity.isActiveInHierarchy) {
      return;
    }
    const renderContext = this._renderContext;
    const camera = renderContext.camera;
    const layer = renderer.entity.layer;
    if (!(camera.cullingMask & layer)) {
      return;
    }
    if (
      this._viewType === RenderViewType.ShadowCascade &&
      (!renderer.castShadows || !(this._lightCullingMask & layer))
    ) {
      return;
    }

    renderer._prepareRender(renderContext);
    renderer._renderFrameCount = camera.engine.time.frameCount;
  }
}
