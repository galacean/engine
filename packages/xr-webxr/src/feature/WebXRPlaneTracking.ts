import {
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRTrackingState,
  XRPlaneMode,
  XRTrackedPlane,
  XRRequestTrackingState,
  Logger
} from "@galacean/engine";
import { IXRPlaneTracking, IXRRequestPlaneTracking } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { WebXRFrame } from "../WebXRFrame";
import { generateUUID } from "../util";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
/**
 *  WebXR implementation of XRPlatformPlaneTracking.
 */
export class WebXRPlaneTracking implements IXRPlaneTracking {
  private _lastDetectedPlanes: XRPlaneSet;

  get detectionMode(): XRPlaneMode {
    return XRPlaneMode.EveryThing;
  }

  set detectionMode(mode: XRPlaneMode) {
    Logger.warn("WebXR does not support modifying plane tracking mode.");
  }

  isSupported(): Promise<void> {
    return Promise.resolve();
  }

  initialize(requestTrackings: IXRRequestPlaneTracking[]): Promise<void> {
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      requestTrackings[i].state = XRRequestTrackingState.Resolved;
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
        tracked[j].state = XRTrackingState.Tracking;
      } else {
        tracked[j].state = XRTrackingState.NotTracking;
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
        plane.orientation = xrPlane.orientation === "horizontal" ? XRPlaneMode.Horizontal : XRPlaneMode.Vertical;
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
}

class WebXRTrackedPlane extends XRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
