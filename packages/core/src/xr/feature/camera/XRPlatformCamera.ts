import { Logger } from "../../../base";
import { XRPlatformFeature } from "../XRPlatformFeature";

export abstract class XRPlatformCamera extends XRPlatformFeature {
  getFixedFoveation(): number {
    Logger.warn("This method needs to be override.");
    return 1;
  }

  setFixedFoveation(value: number): void {
    Logger.warn("This method needs to be override.");
  }
}
