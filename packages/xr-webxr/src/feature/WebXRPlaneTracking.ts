import { IXRRequestPlane, IXRTrackedPlane } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { XRFeatureType, XRPlaneMode, XRRequestTrackingState, XRTrackingState } from "@galacean/engine-xr";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRTrackableFeature } from "./WebXRTrackableFeature";

/**
 *  WebXR implementation of XRPlatformPlaneTracking.
 */
@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRPlaneTracking implements WebXRTrackableFeature<IWebXRTrackedPlane, IXRRequestPlane> {
  private _lastDetectedPlanes: XRPlaneSet;

  get canModifyRequestTrackingAfterInit(): boolean {
    return false;
  }

  constructor(detectedMode: number) {
    if (detectedMode !== XRPlaneMode.EveryThing) {
      console.warn("WebXR only support XRPlaneMode.EveryThing");
    }
  }

  onAddRequestTracking(requestTracking: IXRRequestPlane): void {
    requestTracking.state = XRRequestTrackingState.Resolved;
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestPlane[]): boolean {
    return !!frame._platformFrame;
  }

  getTrackedResult(
    session: WebXRSession,
    frame: WebXRFrame,
    requestTrackings: IXRRequestPlane[],
    generateTracked: () => IXRTrackedPlane
  ): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    // @ts-ignore
    const detectedPlanes: XRPlaneSet = platformFrame.detectedPlanes || platformFrame.worldInformation?.detectedPlanes;
    const tracked = <IWebXRTrackedPlane[]>requestTrackings[0].tracked;
    for (let i = 0, n = tracked.length; i < n; i++) {
      const trackedPlane = tracked[i];
      if (detectedPlanes.has(trackedPlane.xrPlane)) {
        trackedPlane.state = XRTrackingState.Tracking;
        this._updatePlane(platformFrame, platformReferenceSpace, trackedPlane);
      } else {
        trackedPlane.state = XRTrackingState.NotTracking;
      }
    }

    const { _lastDetectedPlanes: lastDetectedPlanes } = this;
    detectedPlanes.forEach((xrPlane) => {
      if (!lastDetectedPlanes?.has(xrPlane)) {
        const plane = generateTracked();
        this._updatePlane(platformFrame, platformReferenceSpace, plane);
        tracked.push(plane);
      }
    });
    this._lastDetectedPlanes = detectedPlanes;
  }

  /**
   * @internal
   */
  _assembleOptions(options: XRSessionInit): void {
    options.requiredFeatures.push("plane-detection");
  }

  private _updatePlane(frame: XRFrame, space: XRSpace, trackedPlane: IWebXRTrackedPlane): void {
    const { pose, polygon, xrPlane } = trackedPlane;
    const planePose = frame.getPose(xrPlane.planeSpace, space);
    if (!planePose) return;
    const { transform, emulatedPosition } = planePose;
    trackedPlane.state = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
    trackedPlane.planeMode = xrPlane.orientation === "horizontal" ? XRPlaneMode.Horizontal : XRPlaneMode.Vertical;
    if (trackedPlane.lastChangedTime < xrPlane.lastChangedTime) {
      trackedPlane.lastChangedTime = xrPlane.lastChangedTime;
      trackedPlane.attributesDirty = true;
      const { polygon: oriPolygon } = xrPlane;
      for (let i = 0, n = (polygon.length = oriPolygon.length); i < n; i++) {
        (polygon[i] ||= new Vector3()).copyFrom(oriPolygon[i]);
      }
    } else {
      trackedPlane.attributesDirty = false;
    }
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    pose.matrix.copyFromArray(transform.matrix);
    pose.inverseMatrix.copyFromArray(transform.inverse.matrix);
  }
}

interface IWebXRTrackedPlane extends IXRTrackedPlane {
  xrPlane?: XRPlane;
  lastChangedTime?: number;
}
