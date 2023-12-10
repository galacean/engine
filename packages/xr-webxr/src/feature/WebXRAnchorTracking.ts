import { Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { IXRRequestAnchor, IXRTracked } from "@galacean/engine-design";
import { WebXRDevice, registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRTrackableFeature } from "./WebXRTrackableFeature";
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
@registerXRPlatformFeature(0)
export class WebXRAnchorTracking implements WebXRTrackableFeature<IXRTracked, IWebXRRequestTrackingAnchor> {
  get canModifyRequestTrackingAfterInit(): boolean {
    return true;
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IWebXRRequestTrackingAnchor[]): boolean {
    if (!frame._platformFrame) return false;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      // XRRequestTrackingState.None
      if (requestTracking.state === 0) {
        this._addAnchor(session, frame, <IWebXRRequestTrackingAnchor>requestTracking);
      }
    }
    return true;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IWebXRRequestTrackingAnchor[]): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    const { trackedAnchors } = platformFrame;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = <IWebXRRequestTrackingAnchor>requestTrackings[i];
      // XRRequestTrackingState.Resolved
      if (requestTracking.state !== 2) continue;
      const tracked = requestTracking.tracked[0];
      if (trackedAnchors.has(requestTracking.xrAnchor)) {
        const emulated = this._updateTrackedAnchor(platformFrame, platformReferenceSpace, requestTracking);
        if (emulated) {
          // XRTrackingState.Tracking
          if (tracked.state === 1) {
            // XRTrackingState.TrackingLost
            tracked.state = 2;
          }
        } else {
          // XRTrackingState.Tracking
          tracked.state = 1;
        }
      } else {
        // XRTrackingState.NotTracking
        tracked.state = 0;
      }
    }
  }

  onAddRequestTracking(requestTracking: IWebXRRequestTrackingAnchor): void {
    requestTracking.tracked.push({
      id: WebXRDevice.generateUUID(),
      pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
      // XRTrackingState.NotTracking
      state: 0
    });
  }

  onDelRequestTracking(requestTracking: IWebXRRequestTrackingAnchor): void {
    switch (requestTracking.state) {
      // XRRequestTrackingState.Submitted
      case 1:
        // XRRequestTrackingState.WaitingDestroy
        requestTracking.state = 5;
        break;
      // XRRequestTrackingState.Resolved
      case 2:
        requestTracking.xrAnchor.delete();
        requestTracking.xrAnchor = null;
        // XRRequestTrackingState.Destroyed
        requestTracking.state = 4;
        requestTracking.tracked.length = 0;
        break;
      default:
        // XRRequestTrackingState.Destroyed
        requestTracking.state = 4;
        break;
    }
  }

  /**
   * @internal
   */
  _assembleOptions(options: XRSessionInit): void {
    options.requiredFeatures.push("anchors");
  }

  private _addAnchor(session: WebXRSession, frame: WebXRFrame, requestTracking: IWebXRRequestTrackingAnchor): void {
    if (!session || !frame) {
      return;
    }
    // XRRequestTrackingState.Submitted
    requestTracking.state = 1;
    const { position, rotation } = requestTracking;
    const { _platformFrame: platformFrame } = frame;
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    platformFrame
      .createAnchor(
        new XRRigidTransform(
          { x: position.x, y: position.y, z: position.z },
          { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
        ),
        platformReferenceSpace
      )
      .then(
        (xrAnchor) => {
          // XRRequestTrackingState.WaitingDestroy
          if (requestTracking.state === 5) {
            xrAnchor.delete();
            // XRRequestTrackingState.Destroyed
            requestTracking.state = 4;
          } else {
            requestTracking.xrAnchor = xrAnchor;
            // XRRequestTrackingState.Resolved
            requestTracking.state = 2;
          }
        },
        () => {
          // XRRequestTrackingState.WaitingDestroy
          if (requestTracking.state === 5) {
            // XRRequestTrackingState.Destroyed
            requestTracking.state = 4;
          } else {
            // XRRequestTrackingState.Rejected
            requestTracking.state = 3;
          }
        }
      );
  }

  private _updateTrackedAnchor(frame: XRFrame, space: XRSpace, requestTracking: IWebXRRequestTrackingAnchor): boolean {
    const { xrAnchor } = requestTracking;
    const xrPose = frame.getPose(xrAnchor.anchorSpace, space);
    const { transform } = xrPose;
    const { pose } = requestTracking.tracked[0];
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    return xrPose.emulatedPosition;
  }
}

interface IWebXRRequestTrackingAnchor extends IXRRequestAnchor {
  xrAnchor: XRAnchor;
}
