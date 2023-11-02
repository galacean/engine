import {
  Engine,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRInputTrackingState,
  XRPlatformPlaneTracking
} from "@galacean/engine";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedPlane } from "@galacean/engine-design";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRPlaneTracking extends XRPlatformPlaneTracking {
  private _sessionManager: WebXRSessionManager;
  private _lastDetectedPlanes: XRPlaneSet;

  override _onUpdate() {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }

    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const trackedPlanes = <IWebXRTrackedPlane[]>this._trackedObjects;
    const { _lastDetectedPlanes: lastDetectedPlanes, _added: added, _updated: updated, _removed: removed } = this;
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
        trackedPlane.state = XRInputTrackingState.NotTracking;
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
          state: XRInputTrackingState.NotTracking,
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
    const { transform, emulatedPosition } = frame.getPose(xrPlane.planeSpace, space);
    if (emulatedPosition) {
      trackedPlane.state = XRInputTrackingState.TrackingLost;
    } else {
      trackedPlane.state = XRInputTrackingState.Tracking;
    }
    trackedPlane.lastChangedTime = xrPlane.lastChangedTime;
    trackedPlane.orientation = xrPlane.orientation;
    const { pose } = trackedPlane;
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
  }

  override _onSessionDestroy(): void {}

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}

interface IWebXRTrackedPlane extends IXRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
