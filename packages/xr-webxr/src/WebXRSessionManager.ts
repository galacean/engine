import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine, EnumXRMode, WebGLGraphicDevice, XRSessionManager } from "@galacean/engine";
import { parseFeature, parseXRMode } from "./util";

export class WebXRSessionManager extends XRSessionManager {
  // @internal
  _platformSession: XRSession;
  // @internal
  _platformFrame: XRFrame;
  // @internal
  _platformLayer: XRWebGLLayer;
  // @internal
  _platformSpace: XRReferenceSpace;

  private _engine: Engine;
  private _rhi: WebGLGraphicDevice;

  initialize(mode: EnumXRMode, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const sessionMode = parseXRMode(mode);
      const options: XRSessionInit = { requiredFeatures: ["local"] };
      const promiseArr = [];
      for (let i = 0, n = requestFeatures.length; i < n; i++) {
        const promise = parseFeature(requestFeatures[i], options);
        promise && promiseArr.push(promise);
      }
      Promise.all(promiseArr).then(() => {
        navigator.xr.requestSession(sessionMode, options).then((session) => {
          this._platformSession = session;

          session.addEventListener("end", () => {
            this._platformSession = this._platformFrame = this._platformLayer = this._platformSpace = null;
            this._clearCustomAnimationFrameRequester();
            this._unBindMainFBO();
          });

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
            session.requestReferenceSpace("local").then((value: XRReferenceSpace) => {
              this._platformSpace = value.getOffsetReferenceSpace(
                new XRRigidTransform({ x: 0, y: -1.5, z: 0, w: 1.0 })
              );
              resolve();
            }, reject);
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
      this._makeUpCustomAnimationFrameRequester(session);
      this._engine.pause();
      this._engine.resume();
      resolve();
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._platformSession) {
        reject();
        return;
      }
      this._clearCustomAnimationFrameRequester();
      this._unBindMainFBO();
      this._engine.pause();
      this._engine.resume();
      resolve();
    });
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _platformSession: session } = this;
      if (session) {
        session.end().then(resolve, reject);
      } else {
        resolve();
      }
    });
  }

  constructor(engine: Engine) {
    super();
    this._engine = engine;
    // @ts-ignore
    this._rhi = engine._hardwareRenderer;
    this._webXRUpdate = this._webXRUpdate.bind(this);
  }

  private _webXRUpdate(time: DOMHighResTimeStamp, frame: XRFrame) {
    this._platformFrame = frame;
    this._setMainFBO();
  }

  private _unBindMainFBO(): void {
    const { _rhi: rhi } = this;
    // @ts-ignore
    rhi._mainFrameBuffer = null;
    // @ts-ignore
    rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
  }

  private _setMainFBO(): void {
    const { framebuffer, framebufferWidth, framebufferHeight } = this._platformLayer;
    const { _rhi: rhi } = this;
    if (framebuffer && framebufferWidth && framebufferHeight) {
      // @ts-ignore
      rhi._mainFrameBuffer = framebuffer;
      // @ts-ignore
      rhi._mainFrameWidth = framebufferWidth;
      // @ts-ignore
      rhi._mainFrameHeight = framebufferHeight;
    } else {
      // @ts-ignore
      rhi._mainFrameBuffer = null;
      // @ts-ignore
      rhi._mainFrameWidth = rhi._mainFrameHeight = 0;
    }
  }

  private _makeUpCustomAnimationFrameRequester(session: XRSession): void {
    // @ts-ignore
    this._engine._customAnimationFrameRequester = {
      requestAnimationFrame: session.requestAnimationFrame.bind(session),
      cancelAnimationFrame: session.cancelAnimationFrame.bind(session),
      update: this._webXRUpdate
    };
  }

  private _clearCustomAnimationFrameRequester(): void {
    // @ts-ignore
    this._engine._customAnimationFrameRequester = null;
  }
}
