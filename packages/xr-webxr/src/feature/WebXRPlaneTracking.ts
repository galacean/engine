import {
  Engine,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRTrackingState,
  XRPlatformPlaneTracking,
  XRPlaneDetectionMode,
  Logger,
  XRSessionManager
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedPlane } from "@galacean/engine-design";
import { WebXRSession } from "../WebXRSession";

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
  override get trackingMode(): XRPlaneDetectionMode {
    return XRPlaneDetectionMode.EveryThing;
  }

  override set trackingMode(value: XRPlaneDetectionMode) {
    Logger.warn("WebXR does not support modification plane detection mode.");
  }

  override _onUpdate() {
    const session = <WebXRSession>this._sessionManager.session;
    const { _platformFrame: platformFrame, _platformReferenceSpace: platformReferenceSpace } = session;
    if (!platformFrame || !platformReferenceSpace) {
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
          this._updatePlane(platformFrame, platformReferenceSpace, trackedPlane, xrPlane);
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
          polygon: [],
          frameCount: 0
        };
        this._updatePlane(platformFrame, platformReferenceSpace, plane, xrPlane);
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

interface IWebXRTrackedPlane extends IXRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
