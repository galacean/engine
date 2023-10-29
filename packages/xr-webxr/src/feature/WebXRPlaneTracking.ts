import { Engine, XRFeatureType, XRFeatureChangeFlag, XRPlatformFeature } from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRPlaneTracking extends XRPlatformFeature {
  private _sessionManager: WebXRSessionManager;
  private _trackingScoreStatus: ImageTrackingScoreStatus = ImageTrackingScoreStatus.NotReceived;

  _onUpdate() {
    const { _platformFrame: platformFrame } = this._sessionManager;
    if (!platformFrame) {
      return;
    }
    // // @ts-ignore
    // const { detectedPlanes } = platformFrame;
    // if (detectedPlanes) {
    //   // remove all planes that are not currently detected in the frame
    //   for (let i = 0; i < this._detectedPlanes.length; i++) {
    //     const plane = this._detectedPlanes[i];
    //     if (!detectedPlanes.has(plane.xrPlane)) {
    //       this._detectedPlanes.splice(i--, 1);
    //     }
    //   }

    //   // now check for new ones
    //   detectedPlanes.forEach((xrPlane) => {
    //     if (!this._lastFrameDetected.has(xrPlane)) {
    //       const newPlane: Partial<IWebXRPlane> = {
    //         id: planeIdProvider++,
    //         xrPlane: xrPlane,
    //         polygonDefinition: []
    //       };
    //       const plane = this._updatePlaneWithXRPlane(xrPlane, newPlane, platformFrame);
    //       this._detectedPlanes.push(plane);
    //       this.onPlaneAddedObservable.notifyObservers(plane);
    //     } else {
    //       // updated?
    //       if (xrPlane.lastChangedTime === this._xrSessionManager.currentTimestamp) {
    //         const index = this._findIndexInPlaneArray(xrPlane);
    //         const plane = this._detectedPlanes[index];
    //         this._updatePlaneWithXRPlane(xrPlane, plane, platformFrame);
    //         this.onPlaneUpdatedObservable.notifyObservers(plane);
    //       }
    //     }
    //   });
    //   this._lastFrameDetected = detectedPlanes;
    // }
  }

  _onSessionDestroy(): void {
    this._trackingScoreStatus = ImageTrackingScoreStatus.NotReceived;
  }

  _onFlagChange(flag: XRFeatureChangeFlag, ...param): void {}

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
