import {
  Engine,
  Matrix,
  Quaternion,
  Time,
  Vector3,
  XRFeatureType,
  XRPlatformAnchorTracking,
  XRRequestTrackingState,
  XRTrackingState
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRRequestTrackingAnchor } from "@galacean/engine-design";
import { WebXRSessionManager } from "../WebXRSessionManager";

@registerXRPlatformFeature(XRFeatureType.AnchorTracking)
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {
  private _time: Time;
  private _sessionManager: WebXRSessionManager;

  override _onUpdate(): void {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }

    const { _added: added, _updated: updated, _removed: removed, _trackedObjects: trackedObjects } = this;
    added.length = updated.length = removed.length = 0;
    const requestTrackingAnchors = <IWebXRRequestTrackingAnchor[]>this._requestTrackingAnchors;
    const { trackedAnchors } = platformFrame;
    for (let i = 0, n = requestTrackingAnchors.length; i < n; i++) {
      const requestTrackingAnchor = requestTrackingAnchors[i];
      switch (requestTrackingAnchor.state) {
        case XRRequestTrackingState.Resolved:
          const { trackedAnchor } = requestTrackingAnchor;
          if (trackedAnchors.has(requestTrackingAnchor.xrAnchor)) {
            const emulated = this._updateTrackedAnchor(platformFrame, platformSpace, requestTrackingAnchor);
            if (emulated) {
              if (trackedAnchor.state === XRTrackingState.Tracking) {
                trackedAnchor.state = XRTrackingState.TrackingLost;
                removed.push(trackedAnchor);
                trackedObjects.splice(trackedObjects.indexOf(trackedAnchor), 1);
              }
            } else {
              if (trackedAnchor.state === XRTrackingState.Tracking) {
                updated.push(trackedAnchor);
              } else {
                trackedAnchor.state = XRTrackingState.Tracking;
                added.push(trackedAnchor);
                trackedObjects.push(trackedAnchor);
              }
            }
          } else {
            if (trackedAnchor.state === XRTrackingState.Tracking) {
              trackedAnchor.state = XRTrackingState.TrackingLost;
              removed.push(trackedAnchor);
              trackedObjects.splice(trackedObjects.indexOf(trackedAnchor), 1);
            }
          }
          break;
        case XRRequestTrackingState.None:
          this._createAnchor(platformFrame, platformSpace, requestTrackingAnchor);
          break;
        default:
          break;
      }
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
    this._time = engine.time;
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

  private _createAnchor(frame: XRFrame, space: XRSpace, anchor: IWebXRRequestTrackingAnchor) {
    if ((anchor.state = XRRequestTrackingState.None)) {
      anchor.state = XRRequestTrackingState.Submitted;
      const { position, rotation } = anchor.pose;
      frame
        .createAnchor(
          new XRRigidTransform(
            { x: position.x, y: position.y, z: position.z },
            { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }
          ),
          space
        )
        .then(
          (xrAnchor) => {
            if (anchor.state === XRRequestTrackingState.PendingDestroy) {
              xrAnchor.delete();
              anchor.state = XRRequestTrackingState.Destroyed;
            } else {
              anchor.xrAnchor = xrAnchor;
              anchor.state = XRRequestTrackingState.Resolved;
              anchor.trackedAnchor = {
                id: this._generateUUID(),
                requestTracking: anchor,
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking,
                frameCount: 0
              };
            }
          },
          () => {
            if (anchor.state === XRRequestTrackingState.PendingDestroy) {
              anchor.state = XRRequestTrackingState.Destroyed;
            } else {
              anchor.state = XRRequestTrackingState.Rejected;
            }
          }
        );
    }
  }

  override _disposeAnchor(anchor: IWebXRRequestTrackingAnchor) {
    switch (anchor.state) {
      case XRRequestTrackingState.Submitted:
        anchor.state = XRRequestTrackingState.PendingDestroy;
        break;
      case XRRequestTrackingState.Resolved:
        anchor.xrAnchor.delete();
        anchor.xrAnchor = null;
        anchor.state = XRRequestTrackingState.Destroyed;
        anchor.trackedAnchor = null;
        break;
      default:
        anchor.state = XRRequestTrackingState.Destroyed;
        break;
    }
  }
}

interface IWebXRRequestTrackingAnchor extends IXRRequestTrackingAnchor {
  xrAnchor: XRAnchor;
}
