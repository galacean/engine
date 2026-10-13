import { IXRInput, IXRRequestImage, IXRTrackedImage } from "@galacean/engine-design";
import {
  XRAnchor as EngineXRAnchor,
  XRController,
  XRPose,
  XRRequestTrackingState,
  XRTrackedInputDevice,
  XRTrackingState
} from "@galacean/engine-xr";
import { describe, expect, it, vi } from "vitest";
import { WebXRFrame } from "../../../packages/xr-webxr/src/WebXRFrame";
import { WebXRSession } from "../../../packages/xr-webxr/src/WebXRSession";
import { WebXRAnchorTracking } from "../../../packages/xr-webxr/src/feature/WebXRAnchorTracking";
import { WebXRImageTracking } from "../../../packages/xr-webxr/src/feature/WebXRImageTracking";

describe("WebXR tracking loss", () => {
  it.each([null, undefined])(
    "keeps the controller pose when getPose returns %s and recovers next frame",
    (missingPose) => {
      const getPose = vi.fn().mockReturnValue(missingPose);
      const session = {
        _platformSession: {
          inputSources: [{ targetRayMode: "tracked-pointer", handedness: "left", gripSpace: {}, targetRaySpace: {} }]
        },
        _platformReferenceSpace: {}
      } as unknown as WebXRSession;
      const frame = new WebXRFrame(session);
      frame._platformFrame = { getPose, getViewerPose: () => null } as unknown as XRFrame;
      const controller = new XRController(XRTrackedInputDevice.LeftController);
      controller.gripPose.position.set(1, 2, 3);
      controller.targetRayPose.position.set(4, 5, 6);
      controller.trackingState = XRTrackingState.Tracking;
      const inputs: IXRInput[] = [];
      inputs[XRTrackedInputDevice.LeftController] = controller;

      expect(() => frame.updateInputs(inputs)).not.toThrow();
      expect(controller.trackingState).toBe(XRTrackingState.TrackingLost);
      expect(controller.gripPose.position).toMatchObject({ x: 1, y: 2, z: 3 });
      expect(controller.targetRayPose.position).toMatchObject({ x: 4, y: 5, z: 6 });

      getPose.mockReturnValue({
        transform: {
          matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1]),
          position: { x: 7, y: 8, z: 9 },
          orientation: { x: 0, y: 0, z: 0, w: 1 }
        },
        emulatedPosition: false
      });
      frame.updateInputs(inputs);
      expect(controller.trackingState).toBe(XRTrackingState.Tracking);
      expect(controller.gripPose.position).toMatchObject({ x: 7, y: 8, z: 9 });
      expect(controller.targetRayPose.position).toMatchObject({ x: 7, y: 8, z: 9 });
    }
  );

  it("marks an anchor as lost without overwriting its last pose", () => {
    const xrAnchor = { anchorSpace: {} } as XRAnchor;
    const tracked = new EngineXRAnchor();
    tracked.state = XRTrackingState.Tracking;
    tracked.pose.position.set(1, 2, 3);
    const frame = {
      _platformFrame: { trackedAnchors: new Set([xrAnchor]), getPose: () => null }
    } as unknown as WebXRFrame;

    new WebXRAnchorTracking().getTrackedResult({ _platformReferenceSpace: {} } as WebXRSession, frame, [
      {
        state: XRRequestTrackingState.Resolved,
        tracked: [tracked],
        xrAnchor,
        position: tracked.pose.position,
        rotation: tracked.pose.rotation
      }
    ]);

    expect(tracked.state).toBe(XRTrackingState.TrackingLost);
    expect(tracked.pose.position).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it("marks an image as lost when a tracking result has no pose", () => {
    const tracked = { pose: new XRPose(), state: XRTrackingState.Tracking } as IXRTrackedImage;
    tracked.pose.position.set(1, 2, 3);
    const frame = {
      _platformFrame: {
        getImageTrackingResults: () => [{ index: 0, trackingState: "tracked", imageSpace: {} }],
        getPose: () => null
      }
    } as unknown as WebXRFrame;
    const request = { tracked: [tracked] } as IXRRequestImage;

    new WebXRImageTracking([]).getTrackedResult(
      { _platformReferenceSpace: {} } as WebXRSession,
      frame,
      [request],
      () => tracked
    );

    expect(tracked.state).toBe(XRTrackingState.TrackingLost);
    expect(tracked.pose.position).toMatchObject({ x: 1, y: 2, z: 3 });
  });
});
