import { Engine, IXRFeatureDescriptor, IXRSession, IXRSessionDescriptor, WebGLGraphicDevice } from "@galacean/engine";
import { EnumWebXRSpaceType } from "./enum/EnumWebXRSpaceType";
import { parseXRMode } from "./util";

export class WebXRSession implements IXRSession {
  // @internal
  _platformSession: XRSession;
  // @internal
  _platformFrame: XRFrame;
  // @internal
  _platformLayer: XRWebGLLayer;
  // @internal
  _platformSpace: XRReferenceSpace | XRBoundedReferenceSpace;

  private _engine: Engine;
  private _rhi: WebGLGraphicDevice;
  private _preRequestAnimationFrame: any;
  private _preCancelAnimationFrame: any;
  private _preAnimationLoop: any;

  initialize(descriptor: IXRSessionDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      const mode = parseXRMode(descriptor.mode);
      if (!mode) {
        reject(new Error("Mode must be a value from the XRMode."));
        return;
      }
      const requiredFeatures = this._parseFeatures(descriptor.requestFeatures, [EnumWebXRSpaceType.Local]);
      navigator.xr.requestSession(mode, { requiredFeatures }).then((session) => {
        this._platformSession = session;
        const { _rhi: rhi } = this;
        const { gl } = rhi;
        const attributes = gl.getContextAttributes();
        if (!attributes) {
          reject(Error("GetContextAttributes Error!"));
        }
        gl.makeXRCompatible().then(() => {
          const scaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(session);
          if (session.renderState.layers === undefined || !!!rhi.isWebGL2) {
            const layerInit = {
              antialias: session.renderState.layers === undefined ? attributes.antialias : true,
              alpha: true,
              depth: attributes.depth,
              stencil: attributes.stencil,
              framebufferScaleFactor: scaleFactor
            };
            this._platformLayer = new XRWebGLLayer(session, gl, layerInit);
            session.updateRenderState({
              baseLayer: this._platformLayer
            });
          } else {
            this._platformLayer = new XRWebGLLayer(session, gl);
            session.updateRenderState({
              layers: [this._platformLayer]
            });
          }
          session
            .requestReferenceSpace(EnumWebXRSpaceType.Local)
            .then((value: XRReferenceSpace | XRBoundedReferenceSpace) => {
              this._platformSpace = value;
              resolve();
            }, reject);
        }, reject);
      }, reject);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _platformSession: session } = this;
      if (!session) {
        reject();
        return;
      }
      const { ticker } = this._engine;
      ticker.pause();
      this._preRequestAnimationFrame = ticker.requestAnimationFrame;
      this._preCancelAnimationFrame = ticker.cancelAnimationFrame;
      this._preAnimationLoop = ticker.animationLoop;
      ticker.requestAnimationFrame = session.requestAnimationFrame.bind(session);
      ticker.cancelAnimationFrame = session.cancelAnimationFrame.bind(session);
      ticker.animationLoop = this._webXRUpdate;
      ticker.resume();
      resolve();
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _platformSession: session } = this;
      if (!session) {
        reject();
        return;
      }
      const { ticker } = this._engine;
      ticker.requestAnimationFrame = this._preRequestAnimationFrame;
      ticker.cancelAnimationFrame = this._preCancelAnimationFrame;
      ticker.animationLoop = this._preAnimationLoop;
      resolve();
    });
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {});
  }

  addTracking(): void {}

  delTracking(): void {}

  getTracking(): void {}

  on(eventName: string, fn: (...args: any[]) => any): void {}

  off(eventName: string, fn: (...args: any[]) => any): void {}

  private _webXRUpdate(time: DOMHighResTimeStamp, frame: XRFrame) {
    const { _platformLayer: layer, _rhi: rhi } = this;
    this._platformFrame = frame;
    const frameBuffer = this._platformLayer?.framebuffer;
    if (frameBuffer && layer.framebufferWidth && layer.framebufferHeight) {
      // @ts-ignore
      rhi._mainFrameBuffer = frame;
      // @ts-ignore
      rhi._mainFrameWidth = layer.framebufferWidth;
      // @ts-ignore
      rhi._mainFrameHeight = layer.framebufferHeight;
    } else {
      // @ts-ignore
      rhi._mainFrameBuffer = null;
      // @ts-ignore
      rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
    }
    this._engine.update();
  }

  constructor(engine: Engine) {
    this._engine = engine;
    // @ts-ignore
    this._rhi = engine._hardwareRenderer;
    this._webXRUpdate = this._webXRUpdate.bind(this);
  }

  private _parseFeatures(descriptor: IXRFeatureDescriptor[], out: string[]): string[] {
    // for (let i = 0, n = subsystems.length; i < n; i++) {
    //   const feature = subsystems[i];
    //   switch (feature) {
    //     case EnumXRSubsystem.imageTracking:
    //       out.push()
    //       break;
    //     default:
    //       break;
    //   }
    // }
    return out;
  }
}
