import { IXRInput } from "./input/IXRInput";

export interface IXRFrame {
  updateInputs(inputs: IXRInput[]): void;
}
