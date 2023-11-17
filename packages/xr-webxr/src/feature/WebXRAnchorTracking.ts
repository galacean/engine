import {
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRRequestTrackingAnchor,
  XRRequestTrackingState,
  XRTrackingState
} from "@galacean/engine";
import { IXRAnchorTracking, IXRFeatureDescriptor, IXRRequestAnchorTracking } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { WebXRFrame } from "../WebXRFrame";
import { generateUUID } from "../util";

@registerXRPlatformFeature(XRFeatureType.AnchorTracking)
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
export class WebXRAnchorTracking implements IXRAnchorTracking {
  isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  initialize(requestTrackings: IXRRequestAnchorTracking[]): Promise<void> {
    return Promise.resolve();
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: XRRequestTrackingAnchor[]): boolean {
    if (!session._platformSession || !session._platformReferenceSpace || !frame._platformFrame) {
      return false;
    }
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      if (requestTracking.state === XRRequestTrackingState.None) this._addAnchor(session, frame, requestTracking);
    }
    return true;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: XRRequestTrackingAnchor[]): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    const { trackedAnchors } = platformFrame;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = <WebXRRequestTrackingAnchor>requestTrackings[i];
      if (requestTracking.state !== XRRequestTrackingState.Resolved) {
        continue;
      }
      const tracked = requestTracking.tracked[0];
      if (trackedAnchors.has(requestTracking.xrAnchor)) {
        const emulated = this._updateTrackedAnchor(platformFrame, platformReferenceSpace, requestTracking);
        if (emulated) {
          if (tracked.state === XRTrackingState.Tracking) {
            tracked.state = XRTrackingState.TrackingLost;
          }
        } else {
          if (tracked.state === XRTrackingState.Tracking) {
            tracked.state = XRTrackingState.Tracking;
          }
        }
      } else {
        tracked.state = XRTrackingState.NotTracking;
      }
    }
  }

  delRequestTracking(requestTracking: WebXRRequestTrackingAnchor): void {
    this._deleteAnchor(requestTracking);
  }

  private _addAnchor(session: WebXRSession, frame: WebXRFrame, anchor: XRRequestTrackingAnchor): void {
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
            // @ts-ignore
            anchor.xrAnchor = xrAnchor;
            anchor.state = XRRequestTrackingState.Resolved;
            anchor.tracked = [
              {
                id: generateUUID(),
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking,
                frameCount: 0
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

  private _deleteAnchor(anchor: WebXRRequestTrackingAnchor): void {
    switch (anchor.state) {
      case XRRequestTrackingState.Submitted:
        anchor.state = XRRequestTrackingState.WaitingDestroy;
        break;
      case XRRequestTrackingState.Resolved:
        anchor.xrAnchor.delete();
        anchor.xrAnchor = null;
        anchor.state = XRRequestTrackingState.Destroyed;
        anchor.tracked.length = 0;
        break;
      default:
        anchor.state = XRRequestTrackingState.Destroyed;
        break;
    }
  }

  private _updateTrackedAnchor(frame: XRFrame, space: XRSpace, trackedAnchor: WebXRRequestTrackingAnchor): boolean {
    const { xrAnchor, pose } = trackedAnchor;
    const xrPose = frame.getPose(xrAnchor.anchorSpace, space);
    const { transform } = xrPose;
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    return xrPose.emulatedPosition;
  }
}

class WebXRRequestTrackingAnchor extends XRRequestTrackingAnchor {
  xrAnchor: XRAnchor;
}
