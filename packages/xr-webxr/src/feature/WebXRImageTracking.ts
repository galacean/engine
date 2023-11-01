import {
  Engine,
  XRFeatureType,
  IXRImageTrackingDescriptor,
  Logger,
  XRPlatformImageTracking,
  XRTrackingState,
  Matrix,
  Vector3,
  Quaternion
} from "@galacean/engine";
import { IXRTrackedImage } from "@galacean/engine-design";
import { WebXRSessionManager } from "../WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
export class WebXRImageTracking extends XRPlatformImageTracking {
  private _sessionManager: WebXRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;

  private _trackedImages: IXRTrackedImage[] = [];
  private _added: IXRTrackedImage[] = [];
  private _updated: IXRTrackedImage[] = [];
  private _removed: IXRTrackedImage[] = [];

  override getChanges(): {
    readonly added: IXRTrackedImage[];
    readonly updated: IXRTrackedImage[];
    readonly removed: IXRTrackedImage[];
  } {
    switch (this._trackingScoreStatus) {
      case ImageTrackingScoreStatus.NotReceived:
        this._requestTrackingScore();
        break;
      case ImageTrackingScoreStatus.Received:
        this._handleTrackingResults();
        if (this._added.length > 0) {
          console.log("图片追踪 added", this._added[0].id, JSON.stringify(this._added[0].pose));
        }
        if (this._updated.length > 0) {
          console.log("图片追踪 update", this._updated[0].id);
        }
        if (this._removed.length > 0) {
          console.log("图片追踪 remove", this._removed[0].id);
        }
        return { added: this._added, updated: this._updated, removed: this._removed };
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
          const { _trackedImages: trackedImages } = this;
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const { referenceImage } = trackedImages[i];
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
    const { _trackedImages: trackedImages } = this;
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
    const { _trackedImages: trackedImages } = this;
    trackedImages.length = 0;
    for (let i = 0, n = referenceImages.length; i < n; i++) {
      trackedImages.push({
        id: this.generateUUID(),
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
