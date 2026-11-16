import { IXRInput, IXRRequestImage, IXRTrackedImage } from "@galacean/engine-design";
import {
  XRAnchor as EngineXRAnchor,
  XRController,
  XRFeatureType,
  XRPose,
  XRRequestTrackingState,
  XRSessionMode,
  XRTrackedInputDevice,
  XRTrackingState
} from "@galacean/engine-xr";
import { describe, expect, it, vi } from "vitest";
import { WebXRFrame } from "../../../packages/xr-webxr/src/WebXRFrame";
import { WebXRDevice } from "../../../packages/xr-webxr/src/WebXRDevice";
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

  it("rejects a missing WebGL context before trying to make it XR compatible", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "xr");
    const requestSession = vi.fn().mockResolvedValue({});
    const makeXRCompatible = vi.fn();
    Object.defineProperty(navigator, "xr", { configurable: true, value: { requestSession } });
    try {
      await expect(new WebXRDevice().requestSession({}, XRSessionMode.AR, [])).rejects.toThrow(
        "WebXR requires a WebGL graphics device."
      );
      await expect(
        new WebXRDevice().requestSession(
          {
            get gl(): never {
              throw new Error("unavailable");
            }
          },
          XRSessionMode.AR,
          []
        )
      ).rejects.toThrow("WebXR requires a WebGL graphics device.");
      expect(requestSession).not.toHaveBeenCalled();

      const rhi = { gl: { getContextAttributes: () => null, makeXRCompatible } };
      await expect(new WebXRDevice().requestSession(rhi, XRSessionMode.AR, [])).rejects.toThrow(
        "GetContextAttributes Error!"
      );
      expect(requestSession).toHaveBeenCalledOnce();
      expect(makeXRCompatible).not.toHaveBeenCalled();
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, "xr", descriptor);
      } else {
        Reflect.deleteProperty(navigator, "xr");
      }
    }
  });

  it("synchronizes and resets the WebGL main framebuffer across session updates, stop and exit", async () => {
    const framebuffer = {} as WebGLFramebuffer;
    const rhi = {
      isWebGL2: true,
      gl: {} as WebGL2RenderingContext,
      _mainFrameBuffer: null as WebGLFramebuffer | null,
      _mainFrameWidth: 0,
      _mainFrameHeight: 0
    };
    const end = vi.fn().mockResolvedValue(undefined);
    const session = new WebXRSession(
      rhi,
      { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, end } as unknown as XRSession,
      { framebuffer, framebufferWidth: 1024, framebufferHeight: 768 } as XRWebGLLayer,
      {} as XRReferenceSpace
    );

    session.onUpdate();
    expect(rhi).toMatchObject({ _mainFrameBuffer: framebuffer, _mainFrameWidth: 1024, _mainFrameHeight: 768 });
    session.stop();
    expect(rhi).toMatchObject({ _mainFrameBuffer: null, _mainFrameWidth: 0, _mainFrameHeight: 0 });
    session.onUpdate();
    await session.end();
    expect(rhi).toMatchObject({ _mainFrameBuffer: null, _mainFrameWidth: 0, _mainFrameHeight: 0 });
  });

  it("returns false and no platform feature for an unknown feature type", () => {
    const device = new WebXRDevice();
    const type = -1 as XRFeatureType;
    expect(device.isSupportedFeature(type)).toBe(false);
    expect(device.createPlatformFeature(type)).toBeNull();
  });
});
