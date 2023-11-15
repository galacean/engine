import { IXRInput, IXRSession } from "@galacean/engine-design";
import { Engine } from "../../Engine";
import { XRController } from "./XRController";
import { XRCamera } from "./XRCamera";
import { XRInputType } from "./XRInputType";
import { UpdateFlagManager } from "../../UpdateFlagManager";
import { XRInputEvent } from "./XRInputEvent";
import { XRInputButton } from "./XRInputButton";
import { XRTrackingState } from "./XRTrackingState";
import { XRTrackedUpdateFlag } from "./XRTrackedUpdateFlag";

/**
 * The manager of XR input.
 */
export class XRInputManager {
  protected _engine: Engine;
  protected _session: IXRSession;
  protected _inputs: IXRInput[] = [];
  protected _controllers: XRController[] = [];
  protected _added: IXRInput[] = [];
  protected _updated: IXRInput[] = [];
  protected _removed: IXRInput[] = [];
  protected _statusSnapshot: XRTrackingState[] = [];
  protected _trackingUpdate: UpdateFlagManager = new UpdateFlagManager();

  /**
   * Returns the input instance.
   * @param type - The input type
   * @returns The input instance
   */
  getInput<T extends IXRInput>(type: XRInputType): T {
    return <T>this._inputs[type];
  }

  /**
   * Add a listener to the input update event.
   * @param listener - The listener to add
   */
  addListener(listener: (type: XRTrackedUpdateFlag, param: readonly IXRInput[]) => any): void {
    this._trackingUpdate.addListener(listener);
  }

  /**
   * Remove a listener from the input update event.
   * @param listener - The listener to remove
   */
  removeListener(listener: (type: XRTrackedUpdateFlag, param: readonly IXRInput[]) => any): void {
    this._trackingUpdate.removeListener(listener);
  }

  /**
   * Returns whether the button is pressed.
   * @param button - The button to check
   * @returns Whether the button is pressed
   */
  isButtonDown(button: number, out: XRController[]): XRController[] {
    const { _controllers: controllers } = this;
    const { frameCount } = this._engine.time;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const controller = controllers[i];
      controller.downMap[button] === frameCount && out.push(controller);
    }
    return out;
  }

  /**
   * Returns whether the button is lifted.
   * @param button - The button to check
   * @returns Whether the button is lifted
   */
  isButtonUp(button: number, out: XRController[]): XRController[] {
    const { _controllers: controllers } = this;
    const { frameCount } = this._engine.time;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const controller = controllers[i];
      controller.upMap[button] === frameCount && out.push(controller);
    }
    return out;
  }

  /**
   * Returns whether the button is held down.
   * @param button - The button to check
   * @returns Whether the button is held down
   */
  isButtonHeldDown(button: number, out: XRController[]): XRController[] {
    const { _controllers: controllers } = this;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const controller = controllers[i];
      (controller.pressedButtons & button) !== 0 && out.push(controller);
    }
    return out;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    const { _inputs: inputs, _controllers: controllers } = this;
    for (let i = XRInputType.Length - 1; i >= 0; i--) {
      switch (i) {
        case XRInputType.Camera:
        case XRInputType.LeftCamera:
        case XRInputType.RightCamera:
          inputs[i] = new XRCamera(i);
          break;
        case XRInputType.Controller:
        case XRInputType.LeftController:
        case XRInputType.RightController:
          controllers.push((inputs[i] = new XRController(i)));
          break;
        default:
          break;
      }
    }
    this._statusSnapshot.fill(XRTrackingState.NotTracking, 0, XRInputType.Length);
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const {
      _added: added,
      _updated: updated,
      _removed: removed,
      _trackingUpdate: trackingUpdate,
      _statusSnapshot: statusSnapshot
    } = this;
    const { _inputs: inputs, _session: session } = this;
    const { events } = session;
    for (let i = 0, n = events.length; i < n; i++) {
      this._handleEvent(events[i]);
    }
    session.resetEvents();
    session.frame.updateInputs(inputs);
    for (let i = 0, n = inputs.length; i < n; i++) {
      const input = inputs[i];
      if (!input) continue;
      const nowState = input.trackingState;
      if (statusSnapshot[i] === XRTrackingState.Tracking) {
        if (nowState === XRTrackingState.Tracking) {
          updated.push(input);
        } else {
          removed.push(input);
        }
      } else {
        if (nowState === XRTrackingState.Tracking) {
          added.push(input);
        }
      }
      statusSnapshot[i] = nowState;
    }
    if (added.length > 0) trackingUpdate.dispatch(XRTrackedUpdateFlag.Added, added);
    if (updated.length > 0) trackingUpdate.dispatch(XRTrackedUpdateFlag.Updated, updated);
    if (removed.length > 0) trackingUpdate.dispatch(XRTrackedUpdateFlag.Removed, removed);
  }

  private _handleEvent(event: XRInputEvent): void {
    const { frameCount } = this._engine.time;
    const input = <XRController>this._inputs[event.input];
    switch (event.targetRayMode) {
      case "tracked-pointer":
        switch (event.type) {
          case "selectstart":
            input.downList.add(XRInputButton.Select);
            input.downMap[XRInputButton.Select] = frameCount;
            input.pressedButtons |= XRInputButton.Select;
            break;
          case "selectend":
            input.upList.add(XRInputButton.Select);
            input.upMap[XRInputButton.Select] = frameCount;
            input.pressedButtons &= ~XRInputButton.Select;
            break;
          case "squeezestart":
            input.downList.add(XRInputButton.Squeeze);
            input.downMap[XRInputButton.Squeeze] = frameCount;
            input.pressedButtons |= XRInputButton.Squeeze;
            break;
          case "squeezeend":
            input.upList.add(XRInputButton.Squeeze);
            input.upMap[XRInputButton.Squeeze] = frameCount;
            input.pressedButtons &= ~XRInputButton.Squeeze;
            break;
          default:
            break;
        }
        break;
      case "screen":
        // @ts-ignore
        const canvas = <HTMLCanvasElement>this._engine.canvas._webCanvas;
        const { clientWidth, clientHeight } = canvas;
        const clientX = clientWidth * (event.x + 1) * 0.5;
        const clientY = clientHeight * (event.y + 1) * 0.5;
        switch (event.type) {
          case "selectstart":
            canvas.dispatchEvent(this._makeUpPointerEvent("pointerdown", event.id, clientX, clientY));
            break;
          case "select":
            canvas.dispatchEvent(this._makeUpPointerEvent("pointermove", event.id, clientX, clientY));
            break;
          case "selectend":
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

  /**
   * @internal
   */
  _onSessionInit(session: IXRSession): void {
    this._session = session;
  }

  /**
   * @internal
   */
  _onSessionStart(): void {
    this._session?.addEventListener();
  }

  /**
   * @internal
   */
  _onSessionStop(): void {
    this._session?.addEventListener();
  }

  /**
   * @internal
   */
  _onSessionDestroy(): void {
    this._session = null;
  }

  /**
   * @internal
   */
  _onDestroy(): void {}

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
      case "pointerup":
        eventInitDict.button = 0;
        eventInitDict.buttons = 0;
        break;
      case "pointerleave":
        eventInitDict.button = -1;
        eventInitDict.buttons = 0;
        break;
      default:
        break;
    }
    return new PointerEvent(type, eventInitDict);
  }
}
