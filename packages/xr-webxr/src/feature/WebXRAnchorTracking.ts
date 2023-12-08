import { Matrix, Quaternion, Vector3, XRFeatureType, XRRequestTrackingState, XRTrackingState } from "@galacean/engine";
import { IXRRequestAnchor, IXRTracked } from "@galacean/engine-design";
import { generateUUID } from "../Util";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRTrackableFeature } from "./WebXRTrackableFeature";

@registerXRPlatformFeature(XRFeatureType.AnchorTracking)
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
export class WebXRAnchorTracking implements WebXRTrackableFeature<IXRTracked, IWebXRRequestTrackingAnchor> {
  get canModifyRequestTrackingAfterInit(): boolean {
    return true;
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IWebXRRequestTrackingAnchor[]): boolean {
    if (!frame._platformFrame) return false;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.state === XRRequestTrackingState.None) {
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
      if (requestTracking.state !== XRRequestTrackingState.Resolved) continue;
      const tracked = requestTracking.tracked[0];
      if (trackedAnchors.has(requestTracking.xrAnchor)) {
        const emulated = this._updateTrackedAnchor(platformFrame, platformReferenceSpace, requestTracking);
        if (emulated) {
          if (tracked.state === XRTrackingState.Tracking) {
            tracked.state = XRTrackingState.TrackingLost;
          }
        } else {
          tracked.state = XRTrackingState.Tracking;
        }
      } else {
        tracked.state = XRTrackingState.NotTracking;
      }
    }
  }

  onDelRequestTracking(requestTracking: IWebXRRequestTrackingAnchor): void {
    switch (requestTracking.state) {
      case XRRequestTrackingState.Submitted:
        requestTracking.state = XRRequestTrackingState.WaitingDestroy;
        break;
      case XRRequestTrackingState.Resolved:
        requestTracking.xrAnchor.delete();
        requestTracking.xrAnchor = null;
        requestTracking.state = XRRequestTrackingState.Destroyed;
        requestTracking.tracked.length = 0;
        break;
      default:
        requestTracking.state = XRRequestTrackingState.Destroyed;
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
    requestTracking.state = XRRequestTrackingState.Submitted;
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
          if (requestTracking.state === XRRequestTrackingState.WaitingDestroy) {
            xrAnchor.delete();
            requestTracking.state = XRRequestTrackingState.Destroyed;
          } else {
            requestTracking.xrAnchor = xrAnchor;
            requestTracking.state = XRRequestTrackingState.Resolved;
            requestTracking.tracked = [
              {
                id: generateUUID(),
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking
              }
            ];
          }
        },
        () => {
          if (requestTracking.state === XRRequestTrackingState.WaitingDestroy) {
            requestTracking.state = XRRequestTrackingState.Destroyed;
          } else {
            requestTracking.state = XRRequestTrackingState.Rejected;
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
