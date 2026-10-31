import {
  Camera,
  CameraClearFlags,
  CameraType,
  Engine,
  Entity,
  Matrix,
  Quaternion,
  Ray,
  Vector3,
  Vector4,
  XRManager
} from "@galacean/engine";
import { IXRInputEvent, IXRRequestTracking, IXRSession, IXRTracked } from "@galacean/engine-design";
import {
  TrackableType,
  XRCamera,
  XRAnchorTracking,
  XRController,
  XRHitTest,
  XRInputButton,
  XRInputEventType,
  XRPlaneTracking,
  XRRequestTrackingState,
  XRSessionMode,
  XRSessionState,
  XRTargetRayMode,
  XRTrackedInputDevice,
  XRTrackedPlane,
  XRTrackingState
} from "@galacean/engine-xr";
import { describe, expect, it, vi } from "vitest";

function createXR() {
  let onExit: (() => void) | undefined;
  const target = document.createElement("canvas");
  const rhi = { _mainFrameBuffer: null, _mainFrameWidth: 0, _mainFrameHeight: 0 };
  const engine = {
    _hardwareRenderer: rhi,
    isPaused: false,
    pause: vi.fn(),
    resume: vi.fn(),
    canvas: { _webCanvas: { clientWidth: 200, clientHeight: 100 } },
    inputManager: { _pointerManager: { _target: target } }
  };
  const session = {
    framebuffer: {} as WebGLFramebuffer,
    framebufferWidth: 800,
    framebufferHeight: 600,
    frameRate: undefined,
    supportedFrameRates: undefined,
    frame: { updateInputs: vi.fn() },
    events: [] as IXRInputEvent[],
    resetEvents: vi.fn(() => (session.events.length = 0)),
    start: vi.fn(),
    stop: vi.fn(),
    end: vi.fn(async () => onExit?.()),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setSessionExitCallBack: vi.fn((callback: () => void) => (onExit = callback)),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    getFixedFoveation: vi.fn(() => undefined),
    setFixedFoveation: vi.fn()
  };
  const platformFeature = {
    canModifyRequestTrackingAfterInit: true,
    checkAvailable: vi.fn(() => true),
    getTrackedResult: vi.fn(),
    onAddRequestTracking: vi.fn(
      (request: IXRRequestTracking<IXRTracked>) => (request.state = XRRequestTrackingState.Resolved)
    ),
    onDelRequestTracking: vi.fn(
      (request: IXRRequestTracking<IXRTracked>) => (request.state = XRRequestTrackingState.Destroyed)
    )
  };
  const device = {
    isSupportedSessionMode: vi.fn(async () => {}),
    isSupportedFeature: vi.fn(() => true),
    createPlatformFeature: vi.fn(() => platformFeature),
    requestSession: vi.fn(async () => session as unknown as IXRSession)
  };
  const xr = new XRManager();
  xr._initialize(engine as unknown as Engine, device);
  return { xr, engine, rhi, session, device, target, platformFeature };
}

function createCamera() {
  return {
    _cameraType: CameraType.Normal,
    entity: { transform: { position: new Vector3(), rotationQuaternion: new Quaternion() } },
    viewport: new Vector4(0, 0, 1, 1),
    projectionMatrix: new Matrix(),
    renderTarget: null,
    _adjustPixelViewport: vi.fn(),
    _updatePixelViewport: vi.fn(),
    screenPointToRay: vi.fn(() => new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0)))
  };
}

describe("XR session lifecycle", () => {
  it("switches rendering and animation callbacks when a session starts, stops and exits", async () => {
    const { xr, engine, rhi, session } = createXR();
    const states: XRSessionState[] = [];
    xr.sessionManager.onStateChanged.on((state) => states.push(state));
    expect(() => xr.sessionManager.run()).toThrow("Without session");
    expect(() => xr.sessionManager.stop()).toThrow("Without session");
    await expect(xr.exitXR()).rejects.toBe("Without session to stop.");
    expect(() => xr.enterXR(XRSessionMode.AR)).toThrow("Please set origin");
    expect(() => xr.cameraManager.fixedFoveation).toThrow("XR session is not available");
    expect(() => (xr.cameraManager.fixedFoveation = 0.5)).toThrow("XR session is not available");
    const outsideRAF = xr._getRequestAnimationFrame();
    const outsideCAF = xr._getCancelAnimationFrame();
    xr.origin = {} as Entity;

    await xr.enterXR(XRSessionMode.AR);
    expect(xr.sessionManager.mode).toBe(XRSessionMode.AR);
    expect(xr.sessionManager.frameRate).toBeUndefined();
    expect(xr.sessionManager.supportedFrameRate).toBeUndefined();
    expect(xr.cameraManager.fixedFoveation).toBeUndefined();
    xr.cameraManager.fixedFoveation = 0.5;
    expect(session.setFixedFoveation).toHaveBeenCalledWith(0.5);
    expect(xr._getRequestAnimationFrame()).toBe(session.requestAnimationFrame);
    expect(xr._getCancelAnimationFrame()).toBe(session.cancelAnimationFrame);
    expect(() => xr.enterXR(XRSessionMode.AR)).toThrow("Please exit XR");
    expect(() => (xr.origin = {} as Entity)).toThrow("Cannot set origin");

    xr._update();
    expect(rhi).toMatchObject({ _mainFrameBuffer: session.framebuffer, _mainFrameWidth: 800, _mainFrameHeight: 600 });
    xr.sessionManager.stop();
    expect(rhi).toEqual({ _mainFrameBuffer: null, _mainFrameWidth: 0, _mainFrameHeight: 0 });
    expect(xr._getRequestAnimationFrame()).toBe(outsideRAF);
    expect(xr._getCancelAnimationFrame()).toBe(outsideCAF);
    expect(() => xr.sessionManager.stop()).toThrow("Session is not running");
    const frameCount = session.frame.updateInputs.mock.calls.length;
    xr._update();
    expect(session.frame.updateInputs).toHaveBeenCalledTimes(frameCount);

    xr.sessionManager.run();
    await xr.exitXR();
    expect(xr.sessionManager._platformSession).toBeNull();
    expect(session.removeEventListener).toHaveBeenCalledOnce();
    expect(engine.pause).toHaveBeenCalledTimes(4);
    expect(engine.resume).toHaveBeenCalledTimes(4);
    expect(states).toEqual([
      XRSessionState.Initializing,
      XRSessionState.Initialized,
      XRSessionState.Running,
      XRSessionState.Paused,
      XRSessionState.Running,
      XRSessionState.None
    ]);
    xr._destroy();
  });

  it("propagates unavailable session errors without starting rendering", async () => {
    const { xr, device, session } = createXR();
    xr.origin = {} as Entity;
    device.isSupportedSessionMode.mockRejectedValueOnce(new Error("unsupported mode"));
    await expect(xr.enterXR(XRSessionMode.AR)).rejects.toThrow("unsupported mode");
    device.requestSession.mockRejectedValueOnce(new Error("permission denied"));
    await expect(xr.enterXR(XRSessionMode.AR)).rejects.toThrow("permission denied");
    expect(session.start).not.toHaveBeenCalled();
    expect(xr.sessionManager._platformSession).toBeFalsy();
    xr._destroy();
  });

  it("updates attached cameras and restores their viewport when the session exits", async () => {
    const { xr } = createXR();
    xr.origin = {} as Entity;
    const camera = createCamera();
    const previous = createCamera();
    const input = xr.inputManager.getTrackedDevice<XRCamera>(XRTrackedInputDevice.Camera);
    xr.cameraManager.attachCamera(XRTrackedInputDevice.Camera, previous as unknown as Camera);
    xr.cameraManager.attachCamera(XRTrackedInputDevice.Camera, camera as unknown as Camera);
    expect(previous._cameraType).toBe(CameraType.Normal);
    expect(camera._cameraType).toBe(CameraType.XRCenterCamera);
    input.pose.position.set(1, 2, 3);
    input.viewport.set(0.25, 0, 0.5, 1);
    input.projectionMatrix.elements[0] = 2;

    await xr.enterXR(XRSessionMode.AR);
    xr._update();
    expect(camera.entity.transform.position).toBe(input.pose.position);
    expect(camera.viewport).toEqual(new Vector4(0.25, 0, 0.5, 1));
    expect(camera.projectionMatrix).toBe(input.projectionMatrix);
    expect(camera._adjustPixelViewport).toHaveBeenCalledWith(800, 600);
    expect(xr._getCameraIgnoreClearFlags(CameraType.XRCenterCamera)).toBe(CameraClearFlags.Color);
    expect(xr._getCameraIgnoreClearFlags(CameraType.Normal)).toBe(CameraClearFlags.None);
    await xr.exitXR();
    expect(camera._updatePixelViewport).toHaveBeenCalledOnce();
    expect(xr._getCameraIgnoreClearFlags(CameraType.XRCenterCamera)).toBe(CameraClearFlags.None);
    expect(xr.cameraManager.detachCamera(XRTrackedInputDevice.Camera)).toBe(camera);
    expect(xr.cameraManager.detachCamera(XRTrackedInputDevice.Camera)).toBeNull();
    expect(input._camera).toBeNull();
    expect(camera._cameraType).toBe(CameraType.Normal);
    xr._destroy();
  });
});

describe("XR input and tracking lifecycle", () => {
  it("reports controller loss and recovery and clears per-frame button transitions", async () => {
    const { xr, session } = createXR();
    xr.origin = {} as Entity;
    await xr.enterXR(XRSessionMode.AR);
    const controller = xr.inputManager.getTrackedDevice<XRController>(XRTrackedInputDevice.LeftController);
    const changed = vi.fn();
    xr.inputManager.onTrackedDeviceChanged.on(changed);
    const event = { input: XRTrackedInputDevice.LeftController, targetRayMode: XRTargetRayMode.TrackedPointer };
    session.events.push(
      { ...event, type: XRInputEventType.SelectStart },
      { ...event, type: XRInputEventType.SqueezeStart }
    );
    session.frame.updateInputs.mockImplementation(() => (controller.trackingState = XRTrackingState.Tracking));
    xr._update();
    expect(changed).toHaveBeenLastCalledWith([controller], []);
    expect(controller.isButtonDown(XRInputButton.Select)).toBe(true);
    expect(controller.isButtonHeldDown(XRInputButton.Squeeze)).toBe(true);

    session.events.push(
      { ...event, type: XRInputEventType.SelectEnd },
      { ...event, type: XRInputEventType.SqueezeEnd }
    );
    session.frame.updateInputs.mockImplementation(() => (controller.trackingState = XRTrackingState.TrackingLost));
    xr._update();
    expect(changed).toHaveBeenLastCalledWith([], [controller]);
    expect(controller.isButtonUp(XRInputButton.Select)).toBe(true);
    expect(controller.isButtonHeldDown(XRInputButton.Squeeze)).toBe(false);
    expect(controller.isButtonDown(XRInputButton.Select)).toBe(false);

    session.frame.updateInputs.mockImplementation(() => (controller.trackingState = XRTrackingState.Tracking));
    xr._update();
    expect(changed).toHaveBeenLastCalledWith([controller], []);
    expect(controller.isButtonUp(XRInputButton.Select)).toBe(false);
    await xr.exitXR();
    xr._destroy();
  });

  it("converts screen input into pointer events with session coordinates", async () => {
    const { xr, session, target } = createXR();
    xr.origin = {} as Entity;
    await xr.enterXR(XRSessionMode.AR);
    const events: PointerEvent[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointerleave"]) {
      target.addEventListener(type, (event) => events.push(event as PointerEvent));
    }
    const event = {
      input: XRTrackedInputDevice.Controller,
      targetRayMode: XRTargetRayMode.Screen,
      id: 7,
      x: 0,
      y: -0.5
    };
    session.events.push(
      { ...event, type: XRInputEventType.SelectStart },
      { ...event, type: XRInputEventType.Select },
      { ...event, type: XRInputEventType.SelectEnd }
    );
    xr._update();
    expect(events.map(({ type }) => type)).toEqual(["pointerdown", "pointermove", "pointerup", "pointerleave"]);
    expect(events.map(({ buttons }) => buttons)).toEqual([1, 1, 0, 0]);
    for (const event of events) {
      expect(event).toMatchObject({ pointerId: 7, clientX: 100, clientY: 25 });
    }
    await xr.exitXR();
    xr._destroy();
  });

  it("removes lost anchors and re-adds them on recovery before request deletion", async () => {
    const { xr, platformFeature } = createXR();
    xr.origin = {} as Entity;
    const feature = xr.addFeature(XRAnchorTracking)!;
    expect(xr.getFeature(XRAnchorTracking)).toBe(feature);
    expect(xr.getFeature(XRPlaneTracking)).toBeUndefined();
    const anchor = feature.addAnchor(new Vector3(), new Quaternion());
    expect(feature.trackingAnchors).toEqual([anchor]);
    await xr.enterXR(XRSessionMode.AR, false);
    const changed = vi.fn();
    feature.onChanged.on(changed);
    anchor.state = XRTrackingState.Tracking;
    feature._onUpdate();
    expect(changed).toHaveBeenLastCalledWith([anchor], [], []);
    feature._onUpdate();
    expect(changed).toHaveBeenLastCalledWith([], [anchor], []);
    anchor.state = XRTrackingState.TrackingLost;
    feature._onUpdate();
    expect(feature.trackedAnchors).toEqual([]);
    expect(changed).toHaveBeenLastCalledWith([], [], [anchor]);
    anchor.state = XRTrackingState.Tracking;
    feature._onUpdate();
    expect(feature.trackedAnchors).toEqual([anchor]);

    platformFeature.canModifyRequestTrackingAfterInit = false;
    expect(() => feature.addAnchor(new Vector3(), new Quaternion())).toThrow("cannot be modified");
    expect(() => feature.removeAnchor(anchor)).toThrow("cannot be modified");
    expect(() => feature.clearAnchors()).toThrow("cannot be modified");
    platformFeature.canModifyRequestTrackingAfterInit = true;
    feature.removeAnchor(anchor);
    feature._onUpdate();
    expect(feature.trackedAnchors).toEqual([]);
    expect(changed).toHaveBeenLastCalledWith([], [], [anchor]);
    expect(feature.trackingAnchors).toEqual([]);
    await xr.exitXR();
    expect(xr.features).toEqual([]);
    xr._destroy();
  });

  it("requires an AR camera for screen hit tests and checks plane boundaries", async () => {
    const { xr } = createXR();
    xr.origin = {} as Entity;
    const hitTest = xr.addFeature(XRHitTest)!;
    const planes = xr.addFeature(XRPlaneTracking)!;
    expect(() => hitTest.screenHitTest(0, 0, TrackableType.Plane)).toThrow("Only AR mode");
    await xr.enterXR(XRSessionMode.AR, false);
    expect(() => hitTest.screenHitTest(0, 0, TrackableType.Plane)).toThrow("No camera available");
    const camera = createCamera();
    xr.cameraManager.attachCamera(XRTrackedInputDevice.Camera, camera as unknown as Camera);
    const plane = new XRTrackedPlane();
    plane.polygon = [new Vector3(-1, 0, -1), new Vector3(-1, 0, 1), new Vector3(1, 0, 1), new Vector3(1, 0, -1)];
    planes["_tracked"].push(plane);
    const hits = hitTest.screenHitTest(100, 50, TrackableType.Plane);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ distance: 1, trackedObject: plane, trackableType: TrackableType.Plane });
    expect(hits[0].point).toEqual(new Vector3());
    expect(hitTest.hitTest(new Ray(new Vector3(2, 1, 0), new Vector3(0, -1, 0)), TrackableType.Plane)).toEqual([]);
    expect(hitTest.hitTest(new Ray(new Vector3(0, 1, 0), new Vector3(0, 1, 0)), TrackableType.Plane)).toEqual([]);
    planes.enabled = false;
    expect(() => hitTest.screenHitTest(0, 0, TrackableType.Plane)).toThrow("plane estimation");
    await xr.exitXR();
    xr._destroy();
  });
});
