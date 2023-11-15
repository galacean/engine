import {
  Engine,
  XRFeatureType,
  XRTrackingState,
  Logger,
  Matrix,
  Quaternion,
  Vector3,
  Time,
  XRSessionManager
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedImage } from "@galacean/engine-design";
import { WebXRSession } from "../WebXRSession";
import { XRPlatformImageTracking, XRRequestTrackingState } from "@galacean/engine-xr";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
/**
 * WebXR implementation of XRPlatformImageTracking.
 * Note: each tracked image can appear at most once in the tracking results.
 * If multiple copies of the same image exist in the user’s environment,
 * the device can choose an arbitrary instance to report a pose,
 * and this choice can change for future XRFrames.
 */
export class WebXRImageTracking extends XRPlatformImageTracking {
  private _time: Time;
  private _sessionManager: XRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;

  override _onUpdate(): void {
    switch (this._trackingScoreStatus) {
      case ImageTrackingScoreStatus.NotReceived:
        this._requestTrackingScore();
        break;
      case ImageTrackingScoreStatus.Received:
        this._handleTrackingResults();
      default:
        break;
    }
  }

  override _onSessionInit(): void {
    const { _requestTrackings: requestTrackings } = this;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      requestTrackings[i].state = XRRequestTrackingState.Submitted;
    }
  }

  override _onSessionDestroy(): void {
    super._onSessionDestroy();
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  }

  private _requestTrackingScore(): void {
    const session = <WebXRSession>this._sessionManager.session;
    this._trackingScoreStatus = ImageTrackingScoreStatus.Waiting;
    session._platformSession
      // @ts-ignore
      .getTrackedImageScores()
      .then((trackingScores: ("untrackable" | "trackable")[]) => {
        if (trackingScores) {
          const { _requestTrackings: requestTrackings } = this;
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const requestTracking = requestTrackings[i];
            if (trackingScore === "trackable") {
              this._trackingScoreStatus = ImageTrackingScoreStatus.Received;
              requestTracking.state = XRRequestTrackingState.Resolved;
              requestTracking.tracked = [
                {
                  id: this._generateUUID(),
                  pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                  state: XRTrackingState.NotTracking,
                  measuredWidthInMeters: 0,
                  frameCount: 0
                }
              ];
            } else {
              requestTracking.state = XRRequestTrackingState.Rejected;
              Logger.warn(requestTracking.image.name, " unTrackable");
            }
          }
        }
      });
  }

  private _handleTrackingResults(): void {
    const session = <WebXRSession>this._sessionManager.session;
    const { _platformFrame: platformFrame, _platformReferenceSpace: platformReferenceSpace } = session;
    if (!platformFrame || !platformReferenceSpace) {
      return;
    }

    const { frameCount } = this._time;
    const {
      _trackedObjects: trackedObjects,
      _requestTrackings: requestTrackings,
      _added: added,
      _updated: updated,
      _removed: removed
    } = this;
    added.length = updated.length = removed.length = 0;
    // @ts-ignore
    const trackingResults = <XRImageTrackingResult[]>platformFrame.getImageTrackingResults();
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      const requestTrackingImage = requestTrackings[trackingResult.index];
      if (requestTrackingImage) {
        const tracked = <IXRTrackedImage>requestTrackings[i].tracked[0];
        if (trackingResult.trackingState === "tracked") {
          this._updateTrackedImage(platformFrame, platformReferenceSpace, tracked, trackingResult);
          if (tracked.state === XRTrackingState.Tracking) {
            updated.push(tracked);
          } else {
            tracked.state = XRTrackingState.Tracking;
            added.push(tracked);
            trackedObjects.push(tracked);
          }
        } else {
          if (tracked.state === XRTrackingState.Tracking) {
            tracked.state = XRTrackingState.TrackingLost;
            removed.push(tracked);
            trackedObjects.splice(trackedObjects.indexOf(tracked), 1);
          }
        }
        tracked.frameCount = frameCount;
      } else {
        Logger.warn("Images can not find " + trackingResult.index);
      }
    }

    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      const tracked = <IXRTrackedImage>requestTrackings[i].tracked[0];
      if (tracked.frameCount < frameCount && tracked.state === XRTrackingState.Tracking) {
        tracked.state = XRTrackingState.TrackingLost;
        removed.push(tracked);
        trackedObjects.splice(trackedObjects.indexOf(tracked), 1);
      }
    }
  }

  private _updateTrackedImage(frame: XRFrame, space: XRSpace, trackedImage: IXRTrackedImage, trackingResult: any) {
    const { pose } = trackedImage;
    const { transform } = frame.getPose(trackingResult.imageSpace, space);
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    trackedImage.measuredWidthInMeters = trackingResult.measuredWidthInMeters;
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = engine.xrManager.sessionManager;
    this._time = engine.time;
  }
}

enum ImageTrackingScoreStatus {
  NotReceived,
  Waiting,
  Received
}
