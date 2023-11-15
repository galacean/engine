import {
  Engine,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRTrackingState,
  Logger,
  XRSessionManager
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { XRPlaneMode, XRPlatformPlaneTracking, XRRequestTrackingState, XRTrackedPlane } from "@galacean/engine-xr";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
/**
 *  WebXR implementation of XRPlatformPlaneTracking.
 */
export class WebXRPlaneTracking extends XRPlatformPlaneTracking {
  private _sessionManager: XRSessionManager;
  private _lastDetectedPlanes: XRPlaneSet;

  /**
   * Return the plane tracking mode for WebXR, which is both (Horizontal and vertical).
   */
  override get trackingMode(): XRPlaneMode {
    return XRPlaneMode.EveryThing;
  }

  override set trackingMode(value: XRPlaneMode) {
    Logger.warn("WebXR does not support modification plane detection mode.");
  }

  override _onUpdate() {
    const session = <WebXRSession>this._sessionManager.session;
    const { _platformFrame: platformFrame, _platformReferenceSpace: platformReferenceSpace } = session;
    if (!platformFrame || !platformReferenceSpace) {
      return;
    }

    const { frameCount } = this._engine.time;
    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const trackedPlanes = <WebXRTrackedPlane[]>this._trackedObjects;
    const { _lastDetectedPlanes: lastDetectedPlanes, _added: added, _updated: updated, _removed: removed } = this;
    added.length = updated.length = removed.length = 0;
    for (let i = trackedPlanes.length - 1; i >= 0; i--) {
      const trackedPlane = trackedPlanes[i];
      const { xrPlane } = trackedPlane;
      if (detectedPlanes?.has(xrPlane)) {
        if (trackedPlane.lastChangedTime < xrPlane.lastChangedTime) {
          this._updatePlane(platformFrame, platformReferenceSpace, trackedPlane, xrPlane);
          updated.push(trackedPlane);
          trackedPlane.frameCount = frameCount;
        }
      } else {
        trackedPlanes.splice(i, 1);
        trackedPlane.state = XRTrackingState.NotTracking;
        trackedPlane.lastChangedTime = 0;
        trackedPlane.xrPlane = null;
        removed.push(trackedPlane);
      }
    }
    detectedPlanes.forEach((xrPlane) => {
      if (!lastDetectedPlanes?.has(xrPlane)) {
        const plane = new WebXRTrackedPlane(this._generateUUID(), {
          matrix: new Matrix(),
          rotation: new Quaternion(),
          position: new Vector3(),
          inverseMatrix: new Matrix()
        });
        plane.orientation = xrPlane.orientation === "horizontal" ? XRPlaneMode.Horizontal : XRPlaneMode.Vertical;
        plane.frameCount = frameCount;
        plane.xrPlane = xrPlane;
        plane.polygon = [];
        this._updatePlane(platformFrame, platformReferenceSpace, plane, xrPlane);
        trackedPlanes.push(plane);
        added.push(plane);
      }
    });
    this._lastDetectedPlanes = detectedPlanes;
  }

  override _onSessionInit(): void {
    super._onSessionInit();
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      requestTrackings[i].state = XRRequestTrackingState.Resolved;
    }
  }

  private _updatePlane(frame: XRFrame, space: XRSpace, trackedPlane: WebXRTrackedPlane, xrPlane: XRPlane): void {
    const { pose, polygon } = trackedPlane;
    const planePose = frame.getPose(xrPlane.planeSpace, space);
    if (!planePose) {
      return;
    }
    const { transform, emulatedPosition } = planePose;
    trackedPlane.state = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
    trackedPlane.lastChangedTime = xrPlane.lastChangedTime;
    trackedPlane.orientation = xrPlane.orientation === "horizontal" ? XRPlaneMode.Horizontal : XRPlaneMode.Vertical;
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    pose.matrix.copyFromArray(transform.matrix);
    pose.inverseMatrix.copyFromArray(transform.inverse.matrix);
    const { polygon: oriPolygon } = xrPlane;
    for (let i = 0, n = (polygon.length = oriPolygon.length); i < n; i++) {
      (polygon[i] ||= new Vector3()).copyFrom(oriPolygon[i]);
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = engine.xrManager.sessionManager;
  }
}

class WebXRTrackedPlane extends XRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
