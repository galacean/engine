import { CanvasRenderer } from "./CanvasRenderer";

export class CanvasCapability {
  _rhi: CanvasRenderer;

  get maxTextureSize(): number {
    return 2048;
  }

  get maxAnisoLevel(): number {
    return 0;
  }

  get rhi() {
    return this._rhi;
  }

  constructor(rhi: CanvasRenderer) {
    this._rhi = rhi;
  }
}
