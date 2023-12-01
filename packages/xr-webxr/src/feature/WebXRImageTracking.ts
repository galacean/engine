import { Matrix, Quaternion, Vector3, XRFeatureType, XRRequestTrackingState, XRTrackingState } from "@galacean/engine";
import {
  IXRImageTracking,
  IXRImageTrackingConfig,
  IXRRequestImageTracking,
  IXRTrackedImage
} from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { generateUUID } from "../util";

@registerXRPlatformFeature(XRFeatureType.ImageTracking)
/**
 * WebXR implementation of XRPlatformImageTracking.
 * Note: each tracked image can appear at most once in the tracking results.
 * If multiple copies of the same image exist in the user’s environment,
 * the device can choose an arbitrary instance to report a pose,
 * and this choice can change for future XRFrames.
 */
export class WebXRImageTracking implements IXRImageTracking {
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  private _tempIdx: number = 0;
  private _tempArr: number[] = [];

  get canModifyRequestTrackingAfterInit(): boolean {
    return false;
  }

  isSupported(config: IXRImageTrackingConfig): Promise<void> {
    return Promise.resolve();
  }

  initialize(requestTrackings: IXRRequestImageTracking[]): Promise<void> {
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      requestTrackings[i].state = XRRequestTrackingState.Submitted;
    }
    return Promise.resolve();
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestImageTracking[]): boolean {
    if (!frame._platformFrame) return false;
    switch (this._trackingScoreStatus) {
      case ImageTrackingScoreStatus.NotReceived:
        this._requestTrackingScore(session, requestTrackings);
        return false;
      case ImageTrackingScoreStatus.Waiting:
        return false;
    }
    return true;
  }

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestImageTracking[]): void {
    const { _platformReferenceSpace: platformReferenceSpace } = session;
    const { _platformFrame: platformFrame } = frame;
    const { _tempArr: tempArr } = this;
    const idx = ++this._tempIdx;
    // @ts-ignore
    const trackingResults = platformFrame.getImageTrackingResults();
    for (let i = 0, n = trackingResults.length; i < n; i++) {
      const trackingResult = trackingResults[i];
      const { index } = trackingResult;
      const requestTrackingImage = requestTrackings[index];
      if (requestTrackingImage) {
        const tracked = requestTrackingImage.tracked[0];
        if (trackingResult.trackingState === "tracked") {
          this._updateTrackedImage(platformFrame, platformReferenceSpace, tracked, trackingResult);
          tracked.state = XRTrackingState.Tracking;
        } else {
          tracked.state = XRTrackingState.TrackingLost;
        }
        tempArr[index] = idx;
      } else {
        console.warn("Images can not find " + index);
      }
    }

    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      if (tempArr[i] < idx) requestTrackings[i].tracked[0].state = XRTrackingState.NotTracking;
    }
  }

  private _requestTrackingScore(session: WebXRSession, requestTrackings: IXRRequestImageTracking[]): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.Waiting;
    session._platformSession
      // @ts-ignore
      .getTrackedImageScores()
      .then((trackingScores: ("untrackable" | "trackable")[]) => {
        if (trackingScores) {
          for (let i = 0, n = trackingScores.length; i < n; i++) {
            const trackingScore = trackingScores[i];
            const requestTracking = requestTrackings[i];
            if (trackingScore === "trackable") {
              this._trackingScoreStatus = ImageTrackingScoreStatus.Received;
              requestTracking.state = XRRequestTrackingState.Resolved;
              requestTracking.tracked = [
                {
                  id: generateUUID(),
                  measuredWidthInMeters: 1,
                  pose: {
                    matrix: new Matrix(),
                    rotation: new Quaternion(),
                    position: new Vector3()
                  },
                  state: 0
                }
              ];
            } else {
              requestTracking.state = XRRequestTrackingState.Rejected;
              console.warn(requestTracking.image.name, " unTrackable");
            }
          }
        }
      });
  }

  private _updateTrackedImage(frame: XRFrame, space: XRSpace, trackedImage: IXRTrackedImage, trackingResult: any) {
    const { pose } = trackedImage;
    const { transform } = frame.getPose(trackingResult.imageSpace, space);
    pose.matrix.copyFromArray(transform.matrix);
    pose.rotation.copyFrom(transform.orientation);
    pose.position.copyFrom(transform.position);
    trackedImage.measuredWidthInMeters = trackingResult.measuredWidthInMeters;
  }
}

enum ImageTrackingScoreStatus {
  NotReceived,
  Waiting,
  Received
}
