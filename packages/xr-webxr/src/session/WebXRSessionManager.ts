import { IXRFeatureDescriptor } from "@galacean/engine-design";
import { Engine, EnumXRMode, SessionStateChangeFlags, WebGLGraphicDevice, XRSessionManager } from "@galacean/engine";
import { parseFeatures, parseXRMode } from "../util";

export class WebXRSessionManager extends XRSessionManager {
  // @internal
  _platformSession: XRSession;
  // @internal
  _platformFrame: XRFrame;
  // @internal
  _platformLayer: XRWebGLLayer;
  // @internal
  _platformSpace: XRReferenceSpace;

  viewerReferenceSpace: XRReferenceSpace;

  private _engine: Engine;
  private _rhi: WebGLGraphicDevice;
  private _preRequestAnimationFrame: any;
  private _preCancelAnimationFrame: any;
  private _preAnimationLoop: any;

  initialize(mode: EnumXRMode, requestFeatures: IXRFeatureDescriptor[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const sessionMode = parseXRMode(mode);
      if (!sessionMode) {
        reject(new Error("Mode must be a value from the XRMode."));
        return;
      }
      const requiredFeatures = parseFeatures(requestFeatures, ["local"]);
      navigator.xr.requestSession(sessionMode, { requiredFeatures }).then((session) => {
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
          session.requestReferenceSpace("viewer").then((value: XRReferenceSpace) => {
            this.viewerReferenceSpace = value;
          });
          session.requestReferenceSpace("local").then((value: XRReferenceSpace) => {
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
      this._dispatchStateChange(SessionStateChangeFlags.start);
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
      this._dispatchStateChange(SessionStateChangeFlags.stop);
      resolve();
    });
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      resolve();
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
    this._engine.update();
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
      rhi._mainFrameWidth = 0;
      // @ts-ignore
      rhi._mainFrameHeight = 0;
    }
  }
}
