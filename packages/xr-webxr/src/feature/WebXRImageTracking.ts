import {
  IXRFeatureDescriptor,
  IXRImageTracking,
  IXRRequestImageTracking,
  IXRTrackedImage
} from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRSession } from "../WebXRSession";
import { WebXRFrame } from "../WebXRFrame";
import { generateUUID } from "../util";

// XRFeatureType.ImageTracking
@registerXRPlatformFeature(2)
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

  isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  initialize(requestTrackings: IXRRequestImageTracking[]): Promise<void> {
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      // XRRequestTrackingState.Submitted
      requestTrackings[i].state = 1;
    }
    return Promise.resolve();
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestImageTracking[]): boolean {
    if (!session._platformSession || !session._platformReferenceSpace || !frame._platformFrame) {
      return false;
    }
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
      const { index } = trackingResult.index;
      const requestTrackingImage = requestTrackings[index];
      if (requestTrackingImage) {
        const tracked = requestTrackingImage.tracked[0];
        if (trackingResult.trackingState === "tracked") {
          this._updateTrackedImage(platformFrame, platformReferenceSpace, tracked, trackingResult);
          // XRTrackingState.Tracking
          tracked.state = 1;
        } else {
          // XRTrackingState.TrackingLost
          tracked.state = 2;
        }
        tempArr[index] = idx;
      } else {
        console.warn("Images can not find " + index);
      }
    }

    for (let i = 0, n = requestTrackings.length; i < n; i++) {
      // XRTrackingState.NotTracking
      if (tempArr[i] !== idx) requestTrackings[i].tracked[0].state = 0;
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
              // XRRequestTrackingState.Resolved
              requestTracking.state = 2;
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
              // XRRequestTrackingState.Rejected
              requestTracking.state = 3;
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
