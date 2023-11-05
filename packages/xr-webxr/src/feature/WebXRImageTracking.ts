import {
  Engine,
  XRFeatureType,
  XRPlatformImageTracking,
  XRTrackingState,
  Logger,
  Matrix,
  Quaternion,
  Vector3,
  XRRequestTrackingState
} from "@galacean/engine";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRTrackedImage } from "@galacean/engine-design";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
/**
 * Each tracked image can appear at most once in the tracking results.
 * If multiple copies of the same image exist in the user’s environment,
 * the device can choose an arbitrary instance to report a pose,
 * and this choice can change for future XRFrames.
 */
export class WebXRImageTracking extends XRPlatformImageTracking {
  private _sessionManager: WebXRSessionManager;
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

  override _onSessionDestroy(): void {
    super._onSessionDestroy();
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
    this._trackedObjects.length = 0;
  }

  private _requestTrackingScore(): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.Waiting;
    this._sessionManager._platformSession
      // @ts-ignore
      .getTrackedImageScores()
      .then((trackingScores: ("untrackable" | "trackable")[]) => {
        if (trackingScores) {
          const { _requestTrackingImages: requestTrackingImages } = this;
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const requestTrackingImage = requestTrackingImages[i];
            if (trackingScore === "trackable") {
              requestTrackingImage.state = XRRequestTrackingState.Resolved;
              this._trackingScoreStatus = ImageTrackingScoreStatus.Received;
            } else {
              requestTrackingImage.state = XRRequestTrackingState.Rejected;
              Logger.warn(requestTrackingImage.image.name, " unTrackable");
            }
          }
        }
      });
  }

  private _handleTrackingResults(): void {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }

    // @ts-ignore
    const trackingResults = <XRImageTrackingResult[]>platformFrame.getImageTrackingResults();
    const {
      _trackedObjects: trackedObjects,
      _requestTrackingImages: requestTrackingImages,
      _added: added,
      _updated: updated,
      _removed: removed
    } = this;
    added.length = updated.length = removed.length = 0;
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      const requestTrackingImage = requestTrackingImages[trackingResult.index];
      if (requestTrackingImage) {
        if (trackingResult.trackingState === "tracked") {
          const trackedImage = (requestTrackingImage.trackedResult ||= {
            id: this._generateUUID(),
            requestTracking: requestTrackingImage,
            pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
            state: XRTrackingState.NotTracking,
            measuredWidthInMeters: 0
          });
          this._updateTrackedImage(platformFrame, platformSpace, trackedImage, trackingResult);
          if (trackedImage.state === XRTrackingState.Tracking) {
            updated.push(trackedImage);
          } else {
            added.push(trackedImage);
            trackedObjects.push(trackedImage);
          }
        } else {
          const trackedImage = requestTrackingImage.trackedResult;
          if (trackedImage?.state === XRTrackingState.Tracking) {
            removed.push(trackedImage);
            trackedImage.state = XRTrackingState.TrackingLost;
            trackedObjects.splice(trackedObjects.indexOf(trackedImage), 1);
          }
        }
      } else {
        Logger.warn("Images can not find " + trackingResult.index);
      }
    }
  }

  private _updateTrackedImage(
    frame: XRFrame,
    space: XRSpace,
    trackedImage: IXRTrackedImage,
    trackingResult: XRImageTrackingResult
  ) {
    const { pose } = trackedImage;
    const { transform } = frame.getPose(trackingResult.imageSpace, space);
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    trackedImage.measuredWidthInMeters = trackingResult.measuredWidthInMeters;
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}

/**
 * Enum that describes the state of the image trackability score status for this session.
 */
enum ImageTrackingScoreStatus {
  // AR Session has not yet assessed image trackability scores.
  NotReceived,
  // A request to retrieve trackability scores has been sent, but no response has been received.
  Waiting,
  // Image trackability scores have been received for this session
  Received
}

interface XRImageTrackingResult {
  readonly index: number;
  readonly imageSpace: XRSpace;
  readonly trackingState: "tracked" | "emulated";
  readonly measuredWidthInMeters: number;
}
