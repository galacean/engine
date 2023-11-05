import {
  Engine,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRTrackingState,
  XRPlatformPlaneTracking,
  XRPlaneTrackingMode,
  Logger
} from "@galacean/engine";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedPlane } from "@galacean/engine-design";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRPlaneTracking extends XRPlatformPlaneTracking {
  private _sessionManager: WebXRSessionManager;
  private _lastDetectedPlanes: XRPlaneSet;

  override set trackingMode(value: XRPlaneTrackingMode) {
    Logger.warn("WebXR does not support modification plane tracking mode.");
  }

  override _onUpdate() {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }

    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const trackedPlanes = <IWebXRTrackedPlane[]>this._trackedObjects;
    const { _lastDetectedPlanes: lastDetectedPlanes, _added: added, _updated: updated, _removed: removed } = this;
    added.length = updated.length = removed.length = 0;
    for (let i = trackedPlanes.length - 1; i >= 0; i--) {
      const trackedPlane = trackedPlanes[i];
      const { xrPlane } = trackedPlane;
      if (detectedPlanes?.has(xrPlane)) {
        if (trackedPlane.lastChangedTime < xrPlane.lastChangedTime) {
          this._updatePlane(platformFrame, platformSpace, trackedPlane, xrPlane);
          updated.push(trackedPlane);
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
        const plane: IWebXRTrackedPlane = {
          id: this._generateUUID(),
          pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
          state: XRTrackingState.NotTracking,
          orientation: xrPlane.orientation,
          xrPlane: xrPlane,
          polygon: []
        };
        this._updatePlane(platformFrame, platformSpace, plane, xrPlane);
        trackedPlanes.push(plane);
        added.push(plane);
      }
    });
    this._lastDetectedPlanes = detectedPlanes;
  }

  private _updatePlane(frame: XRFrame, space: XRSpace, trackedPlane: IWebXRTrackedPlane, xrPlane: XRPlane): void {
    const { pose, polygon } = trackedPlane;
    const { transform, emulatedPosition } = frame.getPose(xrPlane.planeSpace, space);
    trackedPlane.state = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
    trackedPlane.lastChangedTime = xrPlane.lastChangedTime;
    trackedPlane.orientation = xrPlane.orientation;
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    const { polygon: oriPolygon } = xrPlane;
    for (let i = 0, n = (polygon.length = oriPolygon.length); i < n; i++) {
      (polygon[i] ||= new Vector3()).copyFrom(oriPolygon[i]);
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}

interface IWebXRTrackedPlane extends IXRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
