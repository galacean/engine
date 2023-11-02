import {
  Engine,
  XRFeatureType,
  IXRImageTrackingDescriptor,
  Logger,
  XRPlatformImageTracking,
  XRTrackingState,
  Matrix,
  Vector3,
  Quaternion,
  XRReferenceImage,
  XRSessionState
} from "@galacean/engine";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
export class WebXRImageTracking extends XRPlatformImageTracking {
  private _sessionManager: WebXRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;

  override addReferenceImage(image: XRReferenceImage): void {
    if (this._engine.xrModule.sessionState === XRSessionState.NotInitialized) {
    }
  }

  override removeReferenceImage(image: XRReferenceImage): void {
    if (this._engine.xrModule.sessionState === XRSessionState.NotInitialized) {
    }
  }

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
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  }

  private _requestTrackingScore(): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.Waiting;
    this._sessionManager._platformSession
      // @ts-ignore
      .getTrackedImageScores()
      .then((trackingScores: ("untrackable" | "trackable")[]) => {
        if (trackingScores) {
          const { _trackedObjects: trackedObjects } = this;
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const { referenceImage } = trackedObjects[i];
            if (trackingScore === "trackable") {
              referenceImage.trackable = true;
              this._trackingScoreStatus = ImageTrackingScoreStatus.Received;
            } else {
              referenceImage.trackable = false;
              Logger.warn(referenceImage.name, " unTrackable");
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

    const trackingResults: {
      readonly imageSpace: XRSpace;
      readonly index: number;
      readonly trackingState: "tracked" | "emulated";
      readonly measuredWidthInMeters: number;
      // @ts-ignore
    }[] = platformFrame.getImageTrackingResults();
    const { _trackedObjects: trackedImages } = this;
    const { _added: added, _updated: updated, _removed: removed } = this;
    added.length = updated.length = removed.length = 0;
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      const idx = trackingResult.index;
      const trackedImage = trackedImages[idx];
      if (trackedImage) {
        const { transform } = platformFrame.getPose(trackingResult.imageSpace, platformSpace);
        const { pose } = trackedImage;
        pose.matrix.copyFromArray(transform.matrix);
        pose.rotation.copyFrom(transform.orientation);
        pose.position.copyFrom(transform.position);
        trackedImage.measuredWidthInMeters = trackingResult.measuredWidthInMeters;

        if (trackingResult.trackingState === "tracked") {
          if (trackedImage.state === XRTrackingState.Tracking) {
            updated.push(trackedImage);
          } else {
            added.push(trackedImage);
            trackedImage.state = XRTrackingState.Tracking;
          }
        } else {
          if (trackedImage.state === XRTrackingState.Tracking) {
            removed.push(trackedImage);
            trackedImage.state = XRTrackingState.TrackingLost;
          }
        }
      } else {
        Logger.warn("referenceImages can not find " + idx);
      }
    }
  }

  override _initialize(descriptor: IXRImageTrackingDescriptor): Promise<void> {
    const { referenceImages } = descriptor;
    const { _trackedObjects: trackedImages } = this;
    trackedImages.length = 0;
    for (let i = 0, n = referenceImages.length; i < n; i++) {
      trackedImages.push({
        id: this._generateUUID(),
        referenceImage: referenceImages[i],
        pose: { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() },
        state: XRTrackingState.NotTracking,
        measuredWidthInMeters: 0
      });
    }
    return Promise.resolve();
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
