import { Matrix, Quaternion, Vector3, XRTrackedPlane } from "@galacean/engine";
import { IXRPlaneTracking, IXRRequestPlaneTracking } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { WebXRFrame } from "../WebXRFrame";
import { generateUUID } from "../util";

// XRFeatureType.PlaneTracking
@registerXRPlatformFeature(4)
/**
 *  WebXR implementation of XRPlatformPlaneTracking.
 */
export class WebXRPlaneTracking implements IXRPlaneTracking {
  private _lastDetectedPlanes: XRPlaneSet;

  get detectionMode(): number {
    // XRPlaneMode.EveryThing
    return 3;
  }

  set detectionMode(mode: number) {
    console.warn("WebXR does not support modifying plane tracking mode.");
  }

  isSupported(): Promise<void> {
    return Promise.resolve();
  }

  initialize(requestTrackings: IXRRequestPlaneTracking[]): Promise<void> {
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      // XRRequestTrackingState.Resolved
      requestTrackings[i].state = 2;
    }
    return Promise.resolve();
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestPlaneTracking[]): boolean {
    return !!session._platformReferenceSpace && !!frame._platformFrame;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestPlaneTracking[]): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const tracked = <WebXRTrackedPlane[]>requestTrackings[0].tracked;
    for (let j = 0, n = tracked.length; j < n; j++) {
      if (detectedPlanes.has(tracked[j].xrPlane)) {
        // XRTrackingState.Tracking
        tracked[j].state = 1;
      } else {
        // XRTrackingState.NotTracking
        tracked[j].state = 0;
      }
    }

    const { _lastDetectedPlanes: lastDetectedPlanes } = this;
    detectedPlanes.forEach((xrPlane) => {
      if (!lastDetectedPlanes?.has(xrPlane)) {
        const plane = new WebXRTrackedPlane(generateUUID(), {
          matrix: new Matrix(),
          rotation: new Quaternion(),
          position: new Vector3(),
          inverseMatrix: new Matrix()
        });
        plane.xrPlane = xrPlane;
        plane.polygon = [];
        this._updatePlane(platformFrame, platformReferenceSpace, plane, xrPlane);
      }
    });
    this._lastDetectedPlanes = detectedPlanes;
  }

  private _updatePlane(frame: XRFrame, space: XRSpace, trackedPlane: WebXRTrackedPlane, xrPlane: XRPlane): void {
    const { pose, polygon } = trackedPlane;
    const planePose = frame.getPose(xrPlane.planeSpace, space);
    if (!planePose) {
      return;
    }
    const { transform, emulatedPosition } = planePose;
    // XRTrackingState.TrackingLost or XRTrackingState.Tracking
    trackedPlane.state = emulatedPosition ? 2 : 1;
    trackedPlane.lastChangedTime = xrPlane.lastChangedTime;
    // XRPlaneMode.Horizontal or XRPlaneMode.Vertical
    trackedPlane.orientation = xrPlane.orientation === "horizontal" ? 1 : 2;
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    pose.matrix.copyFromArray(transform.matrix);
    pose.inverseMatrix.copyFromArray(transform.inverse.matrix);
    const { polygon: oriPolygon } = xrPlane;
    for (let i = 0, n = (polygon.length = oriPolygon.length); i < n; i++) {
      (polygon[i] ||= new Vector3()).copyFrom(oriPolygon[i]);
    }
  }
}

class WebXRTrackedPlane extends XRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
