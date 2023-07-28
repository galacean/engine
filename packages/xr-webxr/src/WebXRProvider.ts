import { Engine, EnumXRFeature, EnumXRMode, WebGLEngine } from "@galacean/engine";
import { IXRProvider, IXRFeature } from "@galacean/engine-design";
import { EnumWebXRSpaceType } from "./enum/EnumWebXRSpaceType";
import { IWebXRDescriptor } from "./descriptor/IWebXRDescriptor";

export class WebXRProvider implements IXRProvider {
  // @internal
  static _featureTypeMap: IXRFeatureGen[] = [];

  name: string = "WebXR";
  // @internal
  _engine: WebGLEngine;
  // @internal
  _frame: XRFrame;
  // @internal
  _session: XRSession;
  // @internal
  _layer: XRWebGLLayer;
  // @internal
  _space: XRReferenceSpace | XRBoundedReferenceSpace;

  private _preRequestAnimationFrame: any;
  private _preCancelAnimationFrame: any;
  private _preAnimationLoop: any;

  isSupportedMode(mode: number): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => void) => {
      if (window.isSecureContext === false) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)."));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      const sessionMode = this._parseWebXRMode(mode);
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

  isSupportedFeature(feature: EnumXRFeature): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
      const type = WebXRProvider._featureTypeMap[feature];
      if (type) {
        return type.isSupported(this._engine, this);
      } else {
        reject(new Error("The current context doesn't support Feature."));
      }
    });
  }

  createFeature<T extends IXRFeature>(feature: EnumXRFeature): Promise<T> {
    return new Promise((resolve: (ins: T) => void, reject: (reason: Error) => void) => {
      const type = WebXRProvider._featureTypeMap[feature];
      if (type) {
        type.create(this._engine, this).then(resolve, reject);
      } else {
        reject(new Error("The current context doesn't support Feature."));
      }
    });
  }

  initialize(descriptor: IWebXRDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._session) {
        resolve();
      }
      const sessionMode = this._parseWebXRMode(descriptor.mode);
      if (!sessionMode) {
        reject(new Error("mode must be a value from the XRMode."));
        return;
      }
      const features = descriptor.features || [];
      const requiredFeatures = this._parseWebXRFeature(features, [EnumWebXRSpaceType.Local]);
      navigator.xr.requestSession(sessionMode, { requiredFeatures }).then((session) => {
        this._session = session;
        // @ts-ignore
        const rhi = <WebGLGraphicDevice>this._engine._hardwareRenderer;
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
            session.updateRenderState(<XRRenderStateInit>{
              layers: [this._layer]
            });
          }
          session
            .requestReferenceSpace(EnumWebXRSpaceType.Local)
            .then((value: XRReferenceSpace | XRBoundedReferenceSpace) => {
              this._space = value;
              resolve();
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
    this._frame = frame;
    this._engine.update();
    this._frame = null;
  }

  private _parseWebXRMode(mode: number): XRSessionMode {
    switch (mode) {
      case EnumXRMode.AR:
        return "immersive-ar";
      case EnumXRMode.VR:
        return "immersive-vr";
      default:
        return null;
    }
  }

  private _parseWebXRFeature(features: number[], out: string[]): string[] {
    for (let i = 0, n = features.length; i < n; i++) {
      const feature = features[i];
      switch (feature) {
        case EnumXRFeature.imageTracking:
          // 添加图片追踪的能力
          break;
        case EnumXRFeature.objectTracking:
          // 添加物体识别的能力
          break;
        default:
          break;
      }
    }
    return out;
  }

  constructor(engine: WebGLEngine) {
    this._engine = engine;
    this._webXRUpdate = this._webXRUpdate.bind(this);
  }
}

export function registerXRFeature(feature: number) {
  return <T extends IXRFeatureGen>(constructor: T) => {
    WebXRProvider._featureTypeMap[feature] = constructor;
  };
}

export interface IXRFeatureGen {
  create(engine: Engine, provider: IXRProvider): Promise<IXRFeature>;
  isSupported(engine: Engine, provider: IXRProvider): Promise<boolean>;
}
