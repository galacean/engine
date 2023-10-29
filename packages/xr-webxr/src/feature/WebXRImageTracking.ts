import {
  Engine,
  XRFeatureType,
  XRFeatureChangeFlag,
  IXRImageTrackingDescriptor,
  Logger,
  XRPlatformFeature
} from "@galacean/engine";
import { IXRTrackable } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
export class WebXRImageTracking extends XRPlatformFeature {
  private _trackedImage: IXRTrackable[] = [];
  private _sessionManager: WebXRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;

  _onUpdate() {
    switch (this._trackingScoreStatus) {
      case ImageTrackingScoreStatus.NotReceived:
        this._requestTrackingScore();
        break;
      case ImageTrackingScoreStatus.Received:
        this._handleTrackingResults();
        break;
      default:
        break;
    }
  }

  _onSessionDestroy(): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  }

  _onFlagChange(flag: XRFeatureChangeFlag, ...param): void {}

  private _requestTrackingScore(): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.Waiting;
    // @ts-ignore
    this._sessionManager._platformSession.getTrackedImageScores().then((trackingScores: XRImageTrackingScore[]) => {
      let canWork = false;
      if (trackingScores) {
        const { referenceImages } = <IXRImageTrackingDescriptor>this.descriptor;
        for (let i = 0, n = trackingScores.length; i < n; i++) {
          const trackingScore = trackingScores[i];
          if (trackingScore === "trackable") {
            canWork = true;
          } else {
            Logger.warn(referenceImages[i].name, " unTrackable");
          }
        }
      }
      this._trackingScoreStatus = canWork ? ImageTrackingScoreStatus.Received : ImageTrackingScoreStatus.NotReceived;
    });
  }

  private _handleTrackingResults(): void {
    const { _platformFrame: platformFrame, _platformSpace: platformSpace } = this._sessionManager;
    if (!platformFrame || !platformSpace) {
      return;
    }
    // @ts-ignore
    const trackingResults = platformFrame.getImageTrackingResults();
    const { referenceImages } = <IXRImageTrackingDescriptor>this.descriptor;
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      if (!referenceImages[trackingResult.index]) continue;
      const pose = <XRPose>platformFrame.getPose(trackingResult.imageSpace, platformSpace);
      if (pose) {
        console.log("Image tracked:", JSON.stringify(pose.transform.matrix));
      }
    }
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
