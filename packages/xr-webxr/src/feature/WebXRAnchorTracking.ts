import { Matrix, Quaternion, Vector3, XRFeatureType, XRRequestTrackingState, XRTrackingState } from "@galacean/engine";
import { IXRRequestAnchorTracking } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { generateUUID } from "../util";
import { IWebXRTrackablePlatformFeature } from "./IWebXRTrackablePlatformFeature";

@registerXRPlatformFeature(XRFeatureType.AnchorTracking)
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
export class WebXRAnchorTracking implements IWebXRTrackablePlatformFeature {
  get canModifyRequestTrackingAfterInit(): boolean {
    return true;
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestAnchorTracking[]): boolean {
    if (!frame._platformFrame) return false;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.state === XRRequestTrackingState.None) {
        this._addAnchor(session, frame, <IWebXRRequestTrackingAnchor>requestTracking);
      }
    }
    return true;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestAnchorTracking[]): void {
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

  private _addAnchor(session: WebXRSession, frame: WebXRFrame, anchor: IWebXRRequestTrackingAnchor): void {
    if (!session || !frame) {
      return;
    }
    anchor.state = XRRequestTrackingState.Submitted;
    const { position, rotation } = anchor.pose;
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
          if (anchor.state === XRRequestTrackingState.WaitingDestroy) {
            xrAnchor.delete();
            anchor.state = XRRequestTrackingState.Destroyed;
          } else {
            anchor.xrAnchor = xrAnchor;
            anchor.state = XRRequestTrackingState.Resolved;
            anchor.tracked = [
              {
                id: generateUUID(),
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking
              }
            ];
          }
        },
        () => {
          if (anchor.state === XRRequestTrackingState.WaitingDestroy) {
            anchor.state = XRRequestTrackingState.Destroyed;
          } else {
            anchor.state = XRRequestTrackingState.Rejected;
          }
        }
      );
  }

  private _updateTrackedAnchor(frame: XRFrame, space: XRSpace, trackedAnchor: IWebXRRequestTrackingAnchor): boolean {
    const { xrAnchor, pose } = trackedAnchor;
    const xrPose = frame.getPose(xrAnchor.anchorSpace, space);
    const { transform } = xrPose;
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    return xrPose.emulatedPosition;
  }
}

interface IWebXRRequestTrackingAnchor extends IXRRequestAnchorTracking {
  xrAnchor: XRAnchor;
}
