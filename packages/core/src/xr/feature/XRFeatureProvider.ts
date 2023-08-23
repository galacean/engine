import { IXRFeatureProvider, IXRSession } from "@galacean/engine-design";

export abstract class XRFeatureProvider implements IXRFeatureProvider {
  protected _session: IXRSession;
  protected _attached: boolean = false;

  attach(session: IXRSession): void {
    this._attached = true;
    this._session = session;
  }

  detach(): void {
    this._attached = false;
    this._session = null;
  }

  onXRFrame(): void {}

  destroy(): void {
    this.detach();
  }
}
