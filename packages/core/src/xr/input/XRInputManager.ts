import { IXRInputEvent } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRCamera } from "./XRCamera";
import { XRController } from "./XRController";
import { XRInput } from "./XRInput";
import { XRInputButton } from "./XRInputButton";
import { XRInputEventType } from "./XRInputEventType";
import { XRTargetRayMode } from "./XRTargetRayMode";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";

/**
 * The manager of XR input.
 */
export class XRInputManager {
  /** @internal */
  _cameras: XRCamera[] = [];
  /** @internal */
  _controllers: XRController[] = [];

  private _engine: Engine;
  private _added: XRInput[] = [];
  private _removed: XRInput[] = [];
  private _trackedDevices: XRInput[] = [];
  private _statusSnapshot: XRTrackingState[] = [];
  private _listeners: ((added: readonly XRInput[], removed: readonly XRInput[]) => any)[] = [];

  /**
   * @internal
   */
  constructor(engine: Engine) {
    this._engine = engine;
    const { _trackedDevices: trackedDevices, _controllers: controllers, _cameras: cameras } = this;
    for (let i = XRTrackedInputDevice.Length - 1; i >= 0; i--) {
      switch (i) {
        case XRTrackedInputDevice.Camera:
        case XRTrackedInputDevice.LeftCamera:
        case XRTrackedInputDevice.RightCamera:
          cameras.push((trackedDevices[i] = new XRCamera(i)));
          break;
        case XRTrackedInputDevice.Controller:
        case XRTrackedInputDevice.LeftController:
        case XRTrackedInputDevice.RightController:
          controllers.push((trackedDevices[i] = new XRController(i)));
          break;
        default:
          break;
      }
    }
    this._statusSnapshot.fill(XRTrackingState.NotTracking, 0, XRTrackedInputDevice.Length);
  }

  /**
   * Returns the tracked device instance.
   * @param type - The tracked input device type
   * @returns The input instance
   */
  getTrackedDevice<T extends XRInput>(type: XRTrackedInputDevice): T {
    return <T>this._trackedDevices[type];
  }

  /**
   * Add a listener for tracked device changes.
   * @param listener - The listener to add
   */
  addTrackedDeviceChangedListener(listener: (added: readonly XRInput[], removed: readonly XRInput[]) => void): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a listener of tracked device changes.
   * @param listener - The listener to remove
   */
  removeTrackedDeviceChangedListener(listener: (added: readonly XRInput[], removed: readonly XRInput[]) => void): void {
    const { _listeners: listeners } = this;
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const { _added: added, _removed: removed, _listeners: listeners, _statusSnapshot: statusSnapshot } = this;
    const { _trackedDevices: trackedDevices, _controllers: controllers } = this;
    // Reset data
    added.length = removed.length = 0;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const controller = controllers[i];
      controller.down = controller.up = 0;
    }
    // Handle events and update tracked devices
    const { _platformSession: platformSession } = this._engine.xrManager.sessionManager;
    const { events: platformEvents } = platformSession;
    for (let i = 0, n = platformEvents.length; i < n; i++) {
      this._handleEvent(platformEvents[i]);
    }
    platformSession.resetEvents();
    platformSession.frame.updateInputs(trackedDevices);
    for (let i = 0, n = trackedDevices.length; i < n; i++) {
      const input = trackedDevices[i];
      if (!input) continue;
      const nowState = input.trackingState;
      if (statusSnapshot[i] === XRTrackingState.Tracking) {
        if (nowState !== XRTrackingState.Tracking) {
          removed.push(input);
        }
      } else {
        if (nowState === XRTrackingState.Tracking) {
          added.push(input);
        }
      }
      statusSnapshot[i] = nowState;
    }
    // Dispatch change event
    if (added.length > 0 || removed.length > 0) {
      for (let i = 0, n = listeners.length; i < n; i++) {
        listeners[i](added, removed);
      }
    }
  }

  /**
   * @internal
   */
  _onDestroy(): void {
    this._listeners.length = 0;
  }

  private _handleEvent(event: IXRInputEvent): void {
    const input = <XRController>this._trackedDevices[event.input];
    switch (event.targetRayMode) {
      case XRTargetRayMode.TrackedPointer:
        switch (event.type) {
          case XRInputEventType.SelectStart:
            input.down |= XRInputButton.Select;
            input.pressedButtons |= XRInputButton.Select;
            break;
          case XRInputEventType.SelectEnd:
            input.up |= XRInputButton.Select;
            input.pressedButtons &= ~XRInputButton.Select;
            break;
          case XRInputEventType.SqueezeStart:
            input.down |= XRInputButton.Squeeze;
            input.pressedButtons |= XRInputButton.Squeeze;
            break;
          case XRInputEventType.SqueezeEnd:
            input.up |= XRInputButton.Squeeze;
            input.pressedButtons &= ~XRInputButton.Squeeze;
            break;
          default:
            break;
        }
        break;
      case XRTargetRayMode.Screen:
        // @ts-ignore
        const canvas = <HTMLCanvasElement>this._engine.canvas._webCanvas;
        const { clientWidth, clientHeight } = canvas;
        const clientX = clientWidth * (event.x + 1) * 0.5;
        const clientY = clientHeight * (event.y + 1) * 0.5;
        switch (event.type) {
          case XRInputEventType.SelectStart:
            canvas.dispatchEvent(this._makeUpPointerEvent("pointerdown", event.id, clientX, clientY));
            break;
          case XRInputEventType.Select:
            canvas.dispatchEvent(this._makeUpPointerEvent("pointermove", event.id, clientX, clientY));
            break;
          case XRInputEventType.SelectEnd:
            canvas.dispatchEvent(this._makeUpPointerEvent("pointerup", event.id, clientX, clientY));
            canvas.dispatchEvent(this._makeUpPointerEvent("pointerleave", event.id, clientX, clientY));
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  }

  private _makeUpPointerEvent(type: string, pointerId: number, clientX: number, clientY: number): PointerEvent {
    const eventInitDict: PointerEventInit = {
      pointerId,
      clientX,
      clientY
    };
    switch (type) {
      case "pointerdown":
        eventInitDict.button = 0;
        eventInitDict.buttons = 1;
        break;
      case "pointermove":
        eventInitDict.button = -1;
        eventInitDict.buttons = 1;
        break;
      case "pointerup":
        eventInitDict.button = 0;
        eventInitDict.buttons = 0;
        break;
      case "pointerleave":
        eventInitDict.button = 0;
        eventInitDict.buttons = 0;
        break;
      default:
        break;
    }
    return new PointerEvent(type, eventInitDict);
  }
}
