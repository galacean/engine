import { Logger } from "../../../base";
import { XRPlatformFeature } from "../XRPlatformFeature";

export abstract class XRPlatformCamera extends XRPlatformFeature {
  get fixedFoveation(): number {
    Logger.warn("This method needs to be override.");
    return 1;
  }

  set fixedFoveation(value: number) {
    Logger.warn("This method needs to be override.");
  }
}
