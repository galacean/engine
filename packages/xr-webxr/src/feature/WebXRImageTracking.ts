import { IXRReferenceImage, IXRRequestImage, IXRTrackedImage } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { WebXRDevice, registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRTrackableFeature } from "./WebXRTrackableFeature";

/**
 * WebXR implementation of XRPlatformImageTracking.
 * Note: each tracked image can appear at most once in the tracking results.
 * If multiple copies of the same image exist in the user’s environment,
 * the device can choose an arbitrary instance to report a pose,
 * and this choice can change for future XRFrames.
 */
@registerXRPlatformFeature(1)
export class WebXRImageTracking implements WebXRTrackableFeature<IXRTrackedImage, IXRRequestImage> {
  private _images: IXRReferenceImage[];
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  private _tempIdx: number = 0;
  private _tempArr: number[] = [];

  get canModifyRequestTrackingAfterInit(): boolean {
    return false;
  }

  constructor(images: IXRReferenceImage[]) {
    this._images = images;
  }

  onAddRequestTracking(requestTracking: IXRRequestImage): void {
    // XRRequestTrackingState.Submitted
    requestTracking.state = 1;
    requestTracking.tracked[0] = {
      id: WebXRDevice.generateUUID(),
      measuredWidthInMeters: 1,
      pose: {
        matrix: new Matrix(),
        rotation: new Quaternion(),
        position: new Vector3(),
        inverseMatrix: new Matrix()
      },
      // XRTrackingState.NotTracking
      state: 0
    };
  }

  checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestImage[]): boolean {
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

  getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: IXRRequestImage[]): void {
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
      if (tempArr[i] < idx) requestTrackings[i].tracked[0].state = 0;
    }
  }

  /**
   * @internal
   */
  _assembleOptions(options: XRSessionInit): Promise<void> | void {
    options.requiredFeatures.push("image-tracking");
    const { _images: images } = this;
    const promiseArr: Promise<ImageBitmap>[] = [];
    if (images) {
      for (let i = 0, n = images.length; i < n; i++) {
        const referenceImage = images[i];
        const { imageSource } = images[i];
        if (!imageSource) {
          return Promise.reject(new Error("referenceImage[" + referenceImage.name + "].src is null"));
        } else {
          promiseArr.push(createImageBitmap(imageSource));
        }
      }
      return new Promise((resolve, reject) => {
        // @ts-ignore
        const trackedImages = (options.trackedImages = []);
        Promise.all(promiseArr).then((bitmaps: ImageBitmap[]) => {
          for (let i = 0, n = bitmaps.length; i < n; i++) {
            const bitmap = bitmaps[i];
            trackedImages.push({
              image: bitmap,
              widthInMeters: images[i].physicalWidth ?? bitmap.width / 100
            });
          }
          resolve();
        }, reject);
      });
    } else {
      return Promise.reject(new Error("Images.length is 0"));
    }
  }

  private _requestTrackingScore(session: WebXRSession, requestTrackings: IXRRequestImage[]): void {
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
