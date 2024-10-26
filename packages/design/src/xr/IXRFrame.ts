import { IXRInput } from "./input/IXRInput";

/**
 * The base interface of XR frame.
 * It can be understood as a snapshot of
 * the information of each input in this frame.
 */
export interface IXRFrame {
  /**
   * Update xr input information.
   * @param inputs - xr input
   */
  updateInputs(inputs: IXRInput[]): void;
}
