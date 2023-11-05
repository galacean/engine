import {
  Engine,
  Matrix,
  Quaternion,
  Vector3,
  XRFeatureType,
  XRPlatformAnchorTracking,
  XRRequestTrackingState,
  XRTrackingState
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRPose, IXRRequestTrackingAnchor } from "@galacean/engine-design";
import { WebXRSessionManager } from "../WebXRSessionManager";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {
  private _sessionManager: WebXRSessionManager;

  override _addSingleAnchor(pose: IXRPose): void {
    this._requestTrackingAnchors.push({ state: XRRequestTrackingState.None, pose, dispose: this._disposeAnchor });
  }

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
          const trackedResult = (requestTrackingAnchor.trackedResult ||= {
            id: this._generateUUID(),
            requestTracking: requestTrackingAnchor,
            pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
            state: XRTrackingState.NotTracking
          });
          if (trackedAnchors.has(requestTrackingAnchor.xrAnchor)) {
            if (trackedResult.state === XRTrackingState.Tracking) {
              updated.push(trackedResult);
            } else {
              added.push(trackedResult);
              trackedResult.state = XRTrackingState.Tracking;
              trackedObjects.push(trackedResult);
            }
          } else {
            if (trackedResult.state === XRTrackingState.Tracking) {
              removed.push(trackedResult);
              trackedResult.state = XRTrackingState.TrackingLost;
              const index = trackedObjects.indexOf(trackedResult);
              index >= 0 && trackedObjects.splice(index, 1);
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
            } else {
              anchor.xrAnchor = xrAnchor;
            }
            anchor.state = XRRequestTrackingState.Resolved;
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

  private _disposeAnchor(anchor: IWebXRRequestTrackingAnchor) {
    switch (anchor.state) {
      case XRRequestTrackingState.None:
        break;
      case XRRequestTrackingState.Submitted:
        break;
      case XRRequestTrackingState.PendingDestroy:
        break;
      default:
        break;
    }
    anchor.dispose = null;
    anchor.state = XRRequestTrackingState.Destroyed;
    if (anchor.state === XRRequestTrackingState.Submitted) {
    }
    const { xrAnchor } = anchor;
    if (xrAnchor) {
      xrAnchor.delete();
      anchor.xrAnchor = null;
    }
    anchor.dispose = null;
    anchor.trackedResult = null;
    anchor.state = XRRequestTrackingState.Destroyed;
  }
}

interface IWebXRRequestTrackingAnchor extends IXRRequestTrackingAnchor {
  xrAnchor: XRAnchor;
}
