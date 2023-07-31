import { Engine } from "../../Engine";
import { registerFeature } from "../XRManager";
import { IXRDevice } from "../data/IXRDevice";
import { XRHandle } from "../data/XRHandle";
import { EnumXRButton } from "../enum/EnumXRButton";
import { EnumXRFeature } from "../enum/EnumXRFeature";
import { EnumXRInputSource } from "../enum/EnumXRInputSource";
import { EnumXRSubsystem } from "../enum/EnumXRSubsystem";
import { XRInputSubsystem } from "../subsystem/XRInputSubsystem";
import { XRFeature } from "./XRFeature";

@registerFeature(EnumXRFeature.input, [EnumXRSubsystem.input])
export class XRInputManager extends XRFeature {
  private _subSystem: XRInputSubsystem;

  getDevice<T extends IXRDevice>(source: EnumXRInputSource): T {
    return this._subSystem.devices[source] as T;
  }

  isButtonDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<XRHandle>this._subSystem.devices[handedness])?.downMap[button] === this._engine.time.frameCount);
  }

  isButtonUp(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<XRHandle>this._subSystem.devices[handedness])?.upMap[button] === this._engine.time.frameCount);
  }

  isButtonHeldDown(handedness: EnumXRInputSource, button: EnumXRButton): boolean {
    return !!((<XRHandle>this._subSystem.devices[handedness])?.pressedButtons & button);
  }

  override onEnable(): void {}

  override onDisable(): void {}

  override onDestroy(): void {}

  constructor(engine: Engine) {
    super(engine);
    this._subSystem = engine.xrManager.getSubsystem(EnumXRSubsystem.input);
  }
}
