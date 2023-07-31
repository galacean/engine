import {
  Engine,
  EnumXRMode,
  EnumXRSubsystem,
  EnumXRTrackingMode,
  WebGLEngine,
  WebGLGraphicDevice,
  XRProvider,
  XRSubsystem
} from "@galacean/engine";
import { EnumWebXRSpaceType } from "./enum/EnumWebXRSpaceType";

export class WebXRProvider extends XRProvider {
  // @internal
  static _subsystemMap: IXRSubsystemFactory[] = [];
  // @internal
  _frame: XRFrame;
  // @internal
  _session: XRSession;
  // @internal
  _layer: XRWebGLLayer;
  // @internal
  _space: XRReferenceSpace | XRBoundedReferenceSpace;

  private _rhi: WebGLGraphicDevice;
  private _preRequestAnimationFrame: any;
  private _preCancelAnimationFrame: any;
  private _preAnimationLoop: any;

  override isSupportedMode(mode: number): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => void) => {
      if (window.isSecureContext === false) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)."));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      const sessionMode = this._parseXRMode(mode);
      if (!sessionMode) {
        reject(new Error("mode must be a value from the XRMode."));
        return;
      }
      navigator.xr.isSessionSupported(sessionMode).then(
        (isSupported: boolean) => {
          isSupported ? resolve() : reject(new Error("The current context doesn't support WebXR."));
        },
        (reason) => {
          reject(reason);
        }
      );
    });
  }

  override isSupportedTrackingMode(mode: EnumXRTrackingMode): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
      resolve();
    });
  }

  override isSupportedSubsystem(subsystem: EnumXRSubsystem): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
      const type = WebXRProvider._subsystemMap[subsystem];
      if (type) {
        type.isSupported(this._engine, this).then(resolve, reject);
      } else {
        reject(new Error("The current context doesn't support Feature."));
      }
    });
  }

  override createSubsystem<T extends XRSubsystem>(subsystem: EnumXRSubsystem): Promise<T> {
    return new Promise((resolve: (ins: T) => void, reject: (reason: Error) => void) => {
      const type = WebXRProvider._subsystemMap[subsystem];
      if (type) {
        type.create(this._engine, this).then(resolve, reject);
      } else {
        reject(new Error("The current context doesn't support Feature."));
      }
    });
  }

  initialize(
    mode: EnumXRMode,
    trackingMode: EnumXRTrackingMode,
    requestSubsystems: EnumXRSubsystem[] = []
  ): Promise<XRSubsystem[]> {
    return new Promise((resolve, reject) => {
      if (this._session) {
        reject(new Error("There is an undestroyed session."));
      }
      const sessionMode = this._parseXRMode(mode);
      if (!sessionMode) {
        reject(new Error("Mode must be a value from the XRMode."));
        return;
      }
      const requiredFeatures = this._parseSubsystem(requestSubsystems, [EnumWebXRSpaceType.Local]);
      navigator.xr.requestSession(sessionMode, { requiredFeatures }).then((session) => {
        this._session = session;
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
            this._layer = new XRWebGLLayer(session, gl, layerInit);
            session.updateRenderState({
              baseLayer: this._layer
            });
          } else {
            this._layer = new XRWebGLLayer(session, gl);
            session.updateRenderState({
              layers: [this._layer]
            });
          }
          session
            .requestReferenceSpace(EnumWebXRSpaceType.Local)
            .then((value: XRReferenceSpace | XRBoundedReferenceSpace) => {
              this._space = value;
              const promiseArr = [];
              const length = requestSubsystems.length;
              for (let i = 0; i < length; i++) {
                promiseArr.push(this.createSubsystem(requestSubsystems[i]));
              }
              Promise.all(promiseArr).then((subsystemArr: XRSubsystem[]) => {
                resolve(subsystemArr);
              });
            }, reject);
        }, reject);
      }, reject);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { _session: session } = this;
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
      const { _session: session } = this;
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

  onUpdate(): void {}

  onLateUpdate(): void {}

  onDestroy(): void {}

  private _webXRUpdate(time: DOMHighResTimeStamp, frame: XRFrame) {
    const { _layer: layer, _rhi: rhi } = this;
    this._frame = frame;
    const frameBuffer = this._layer?.framebuffer;
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
    this._frame = null;
  }

  private _parseXRMode(mode: number): XRSessionMode {
    switch (mode) {
      case EnumXRMode.AR:
        return "immersive-ar";
      case EnumXRMode.VR:
        return "immersive-vr";
      default:
        return null;
    }
  }

  private _parseSubsystem(subsystems: EnumXRSubsystem[], out: string[]): string[] {
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

  constructor(engine: WebGLEngine) {
    super(engine);
    this.name = "WebXR";
    // @ts-ignore
    this._rhi = engine._hardwareRenderer;
    this._webXRUpdate = this._webXRUpdate.bind(this);
  }
}

export function registerSubsystem(feature: number) {
  return <T extends IXRSubsystemFactory>(constructor: T) => {
    WebXRProvider._subsystemMap[feature] = constructor;
  };
}

export interface IXRSubsystemFactory {
  create(engine: Engine, provider: XRProvider): Promise<XRSubsystem>;
  isSupported(engine: Engine, provider: XRProvider): Promise<boolean>;
}
