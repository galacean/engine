import { IXRSession } from "../interface/IXRSession";

export interface IXRFeatureProvider {
  attach(session: IXRSession): void;
  detach(): void;
  destroy(): void;
  update(): void;
}
