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

  private _lastFrameDetected: XRPlaneSet;
  private _trackedPlanes: IWebXRTrackedPlane[] = [];

  override _onUpdate() {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }

    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const { _trackedPlanes: trackedPlanes, _added: added, _updated: updated, _removed: removed } = this;
    if (detectedPlanes) {
      // remove all planes that are not currently detected in the frame
      for (let i = trackedPlanes.length - 1; i >= 0; i--) {
        const trackedPlane = trackedPlanes[i];
        if (!detectedPlanes.has(trackedPlane.xrPlane)) {
          trackedPlanes.splice(i--, 1);
        }
        trackedPlane.state = XRInputTrackingState.NotTracking;
        removed.push(trackedPlane);
      }

      detectedPlanes.forEach((xrPlane) => {
        if (this._lastFrameDetected?.has(xrPlane)) {
          // const index = this._findIndexInPlaneArray(xrPlane);
          // const plane = this._trackedPlanes[index];
          // this._updatePlaneWithXRPlane(xrPlane, plane, platformFrame);
          // this.onPlaneUpdatedObservable.notifyObservers(plane);
        } else {
          const plane: IWebXRTrackedPlane = {
            id: this.generateUUID(),
            pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
            state: XRInputTrackingState.Tracking,
            xrPlane
          };
          this._trackedPlanes.push(plane);
          added.push(plane);
          const pose = platformFrame.getPose(xrPlane.planeSpace, platformSpace);
          if (pose.emulatedPosition) {
            plane.state = XRInputTrackingState.TrackingLost;
          } else {
            plane.state = XRInputTrackingState.Tracking;
          }
        }
      });
      this._lastFrameDetected = detectedPlanes;
    }
  }

  private _addPlane() {}

  private _updatePlane() {}

  private _removePlane() {}

  override _onSessionDestroy(): void {}

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}

interface IWebXRTrackedPlane extends IXRTrackedPlane {
  xrPlane: XRPlane;
}
