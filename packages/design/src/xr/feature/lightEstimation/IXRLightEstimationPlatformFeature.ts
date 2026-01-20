import { IXRFrame } from "../../IXRFrame";
import { IXRSession } from "../../IXRSession";
import { IXRPlatformFeature } from "../IXRPlatformFeature";
import { IXRLightEstimate } from "./IXRLightEstimate";

export interface IXRLightEstimationPlatformFeature extends IXRPlatformFeature {
  /**
   * Check if the feature is available.
   * @param session - The XR session
   * @param frame - The XR frame
   */
  checkAvailable(session: IXRSession, frame: IXRFrame): boolean;

  /**
   * Update light estimation data.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param estimate - Output estimate data
   * @returns True if estimate updated
   */
  getLightEstimate(session: IXRSession, frame: IXRFrame, estimate: IXRLightEstimate): boolean;
}
