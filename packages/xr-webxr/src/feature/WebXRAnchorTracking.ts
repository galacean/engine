import {
  Engine,
  Logger,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRSessionManager,
  XRTrackingState
} from "@galacean/engine";
import { XRPlatformAnchorTracking, XRRequestTrackingState, XRRequestTrackingAnchor } from "@galacean/engine-xr";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";

@registerXRPlatformFeature(XRFeatureType.AnchorTracking)
/**
 * WebXR implementation of XRPlatformAnchorTracking.
 */
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {
  private _sessionManager: XRSessionManager;

  override _onUpdate(): void {
    const session = <WebXRSession>this._sessionManager.session;
    if (!session) {
      return;
    }
    const { _platformFrame: platformFrame, _platformReferenceSpace: platformReferenceSpace } = session;
    const {
      _added: added,
      _updated: updated,
      _removed: removed,
      _trackedObjects: trackedObjects,
      _requestTrackings: requestTrackings
    } = this;
    added.length = updated.length = removed.length = 0;
    const { frameCount } = this._engine.time;
    const { trackedAnchors } = platformFrame;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const requestTracking = <WebXRRequestTrackingAnchor>requestTrackings[i];
      switch (requestTracking.state) {
        case XRRequestTrackingState.Resolved:
          const tracked = requestTracking.tracked[0];
          if (trackedAnchors.has(requestTracking.xrAnchor)) {
            const emulated = this._updateTrackedAnchor(platformFrame, platformReferenceSpace, requestTracking);
            if (emulated) {
              if (tracked.state === XRTrackingState.Tracking) {
                tracked.state = XRTrackingState.TrackingLost;
                removed.push(tracked);
                trackedObjects.splice(trackedObjects.indexOf(tracked), 1);
              }
            } else {
              tracked.frameCount = frameCount;
              if (tracked.state === XRTrackingState.Tracking) {
                updated.push(tracked);
              } else {
                tracked.state = XRTrackingState.Tracking;
                added.push(tracked);
                trackedObjects.push(tracked);
              }
            }
          } else {
            if (tracked.state === XRTrackingState.Tracking) {
              tracked.state = XRTrackingState.TrackingLost;
              removed.push(tracked);
              trackedObjects.splice(trackedObjects.indexOf(tracked), 1);
            }
          }
          break;
        case XRRequestTrackingState.None:
          this._createAnchor(platformFrame, platformReferenceSpace, requestTracking);
          break;
        default:
          break;
      }
    }
  }

  override _onSessionInit(): void {
    super._onSessionInit();
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      requestTrackings[n].state = XRRequestTrackingState.Submitted;
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = engine.xrManager.sessionManager;
  }

  protected override _onRequestTrackingRemoved(anchor: WebXRRequestTrackingAnchor) {
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

  private _createAnchor(frame: XRFrame, space: XRSpace, anchor: WebXRRequestTrackingAnchor) {
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
          if (anchor.state === XRRequestTrackingState.WaitingDestroy) {
            xrAnchor.delete();
            anchor.state = XRRequestTrackingState.Destroyed;
          } else {
            anchor.xrAnchor = xrAnchor;
            anchor.state = XRRequestTrackingState.Resolved;
            anchor.tracked = [
              {
                id: this._generateUUID(),
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking,
                frameCount: 0
              }
            ];
          }
        },
        () => {
          Logger.warn("Failed to create anchor.");
          if (anchor.state === XRRequestTrackingState.WaitingDestroy) {
            anchor.state = XRRequestTrackingState.Destroyed;
          } else {
            anchor.state = XRRequestTrackingState.Rejected;
          }
        }
      );
  }
}

class WebXRRequestTrackingAnchor extends XRRequestTrackingAnchor {
  xrAnchor: XRAnchor;
}
