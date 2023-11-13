import {
  Engine,
  XRFeatureType,
  XRPlatformImageTracking,
  XRTrackingState,
  Logger,
  Matrix,
  Quaternion,
  Vector3,
  XRRequestTrackingState,
  Time,
  XRSessionManager
} from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedImage } from "@galacean/engine-design";
import { WebXRSession } from "../WebXRSession";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
/**
 * WebXR implementation of XRPlatformImageTracking.
 * Note: each tracked image can appear at most once in the tracking results.
 * If multiple copies of the same image exist in the user’s environment,
 * the device can choose an arbitrary instance to report a pose,
 * and this choice can change for future XRFrames.
 */
export class WebXRImageTracking extends XRPlatformImageTracking {
  private _sessionManager: XRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  private _time: Time;

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
    const { _requestTrackingImages: requestTrackingImages } = this;
    for (let i = 0, n = requestTrackingImages.length; i < n; i++) {
      requestTrackingImages[i].state = XRRequestTrackingState.Submitted;
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
          const { _requestTrackingImages: requestTrackingImages } = this;
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const requestTrackingImage = requestTrackingImages[i];
            if (trackingScore === "trackable") {
              this._trackingScoreStatus = ImageTrackingScoreStatus.Received;
              requestTrackingImage.state = XRRequestTrackingState.Resolved;
              requestTrackingImage.trackedImage = {
                id: this._generateUUID(),
                requestTracking: requestTrackingImage,
                pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
                state: XRTrackingState.NotTracking,
                measuredWidthInMeters: 0,
                frameCount: 0
              };
            } else {
              requestTrackingImage.state = XRRequestTrackingState.Rejected;
              Logger.warn(requestTrackingImage.image.name, " unTrackable");
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
      _requestTrackingImages: requestTrackingImages,
      _added: added,
      _updated: updated,
      _removed: removed
    } = this;
    added.length = updated.length = removed.length = 0;
    // @ts-ignore
    const trackingResults = <XRImageTrackingResult[]>platformFrame.getImageTrackingResults();
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      const requestTrackingImage = requestTrackingImages[trackingResult.index];
      if (requestTrackingImage) {
        const { trackedImage } = requestTrackingImage;
        if (trackingResult.trackingState === "tracked") {
          this._updateTrackedImage(platformFrame, platformReferenceSpace, trackedImage, trackingResult);
          if (trackedImage.state === XRTrackingState.Tracking) {
            updated.push(trackedImage);
          } else {
            trackedImage.state = XRTrackingState.Tracking;
            added.push(trackedImage);
            trackedObjects.push(trackedImage);
          }
        } else {
          if (trackedImage.state === XRTrackingState.Tracking) {
            trackedImage.state = XRTrackingState.TrackingLost;
            removed.push(trackedImage);
            trackedObjects.splice(trackedObjects.indexOf(trackedImage), 1);
          }
        }
        trackedImage.frameCount = frameCount;
      } else {
        Logger.warn("Images can not find " + trackingResult.index);
      }
    }

    for (let i = 0, n = requestTrackingImages.length; i < n; i++) {
      const { trackedImage } = requestTrackingImages[i];
      if (trackedImage.frameCount < frameCount && trackedImage.state === XRTrackingState.Tracking) {
        trackedImage.state = XRTrackingState.TrackingLost;
        removed.push(trackedImage);
        trackedObjects.splice(trackedObjects.indexOf(trackedImage), 1);
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
