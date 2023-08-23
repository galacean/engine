import { IXRSession } from "../IXRSession";

export interface IXRFeatureProvider {
  attach(session: IXRSession): void;
  detach(): void;
  destroy(): void;
  onXRFrame(): void;
}
