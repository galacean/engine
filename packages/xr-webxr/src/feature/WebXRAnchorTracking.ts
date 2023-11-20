import { IXRAnchorTracking, IXRFeatureDescriptor, IXRRequestAnchorTracking } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { WebXRFrame } from "../WebXRFrame";
import { generateUUID } from "../util";

// XRFeatureType.AnchorTracking
@registerXRPlatformFeature(2)
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

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestAnchorTracking[]): boolean {
    if (!session._platformSession || !session._platformReferenceSpace || !frame._platformFrame) {
      return false;
    }
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = requestTrackings[i];
      // XRRequestTrackingState.None
      if (requestTracking.state === 0) this._addAnchor(session, frame, requestTracking);
    }
    return true;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestAnchorTracking[]): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    const { trackedAnchors } = platformFrame;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = <WebXRRequestTrackingAnchor>requestTrackings[i];
      // XRRequestTrackingState.Resolved
      if (requestTracking.state !== 2) {
        continue;
      }
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

  delRequestTracking(requestTracking: WebXRRequestTrackingAnchor): void {
    this._deleteAnchor(requestTracking);
  }

  private _addAnchor(session: WebXRSession, frame: WebXRFrame, anchor: IXRRequestAnchorTracking): void {
    if (!session || !frame) {
      return;
    }
    // XRRequestTrackingState.Submitted
    anchor.state = 1;
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
          // XRRequestTrackingState.WaitingDestroy
          if (anchor.state === 5) {
            xrAnchor.delete();
            // XRRequestTrackingState.Destroyed
            anchor.state = 4;
          } else {
            // @ts-ignore
            anchor.xrAnchor = xrAnchor;
            // XRRequestTrackingState.Resolved
            anchor.state = 2;
            anchor.tracked = [
              {
                id: generateUUID(),
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                // XRTrackingState.NotTracking
                state: 0
              }
            ];
          }
        },
        () => {
          // XRRequestTrackingState.WaitingDestroy
          if (anchor.state === 5) {
            // XRRequestTrackingState.Destroyed
            anchor.state = 4;
          } else {
            // XRRequestTrackingState.Rejected
            anchor.state = 3;
          }
        }
      );
  }

  private _deleteAnchor(anchor: WebXRRequestTrackingAnchor): void {
    switch (anchor.state) {
      // XRRequestTrackingState.Submitted
      case 1:
        // XRRequestTrackingState.WaitingDestroy
        anchor.state = 5;
        break;
      // XRRequestTrackingState.Resolved
      case 2:
        anchor.xrAnchor.delete();
        anchor.xrAnchor = null;
        // XRRequestTrackingState.Destroyed
        anchor.state = 4;
        anchor.tracked.length = 0;
        break;
      default:
        // XRRequestTrackingState.Destroyed
        anchor.state = 4;
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

interface WebXRRequestTrackingAnchor extends IXRRequestAnchorTracking {
  xrAnchor: XRAnchor;
}
