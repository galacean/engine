import { IXRTracked } from "../tracked/IXRTracked";

export interface IXRRequestTracking<T extends IXRTracked> {
  state: number;
  tracked: T[];
}
