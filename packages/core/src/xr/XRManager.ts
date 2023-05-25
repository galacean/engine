import { Engine } from "../Engine";
import { Logger } from "../base";
import { EnumXREvent } from "./enum/EnumXREvent";
import { EnumXRMode } from "./enum/EnumXRMode";
import { XRCamera } from "./XRCamera";
import { EnumXREye } from "./enum/EnumXREye";
import { EnumXRSpaceType } from "./enum/EnumXRSpaceType";
import { Entity } from "../Entity";
import { XRInputManager } from "./XRInputManager";

export class XRManager {
  xrInput: XRInputManager;

  private _mode: EnumXRMode;
  private _engine: Engine;
  private _spaceType: EnumXRSpaceType = EnumXRSpaceType.Local;
  private _session: XRSession;
  private _requestId: number;
  private _isPaused: boolean = true;
  private _xrCameras: XRCamera[] = [];

  private _xrBaseLayer: XRWebGLLayer;
  private _xrSpace: XRReferenceSpace | XRBoundedReferenceSpace;

  private _fixedFoveation: number;

  get xrBaseLayer(): XRWebGLLayer {
    return this._xrBaseLayer;
  }

  get xrSpace(): XRReferenceSpace | XRBoundedReferenceSpace {
    return this._xrSpace;
  }

  get fixedFoveation() {
    return this._fixedFoveation;
  }

  set fixedFoveation(value: number) {
    this._fixedFoveation = value;
  }

  isSupported(mode: EnumXRMode): Promise<void> {
    return new Promise((resolve, reject: (reason: Error) => any) => {
      if (window.isSecureContext === false) {
        reject(new Error("WebXR is available only in secure contexts (HTTPS)"));
        return;
      }
      if (!navigator.xr) {
        reject(new Error("WebXR isn't available"));
        return;
      }
      navigator.xr.isSessionSupported(mode).then(
        (isSupported: boolean) => {
          if (isSupported) {
            resolve();
          } else {
            reject(new Error("The current context doesn't support WebXR"));
          }
        },
        (reason) => {
          reject(reason);
        }
      );
    });
  }

  async init(
    mode: EnumXRMode,
    spaceType?: EnumXRSpaceType,
    requiredFeatures?: string[],
    optionalFeatures?: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._session) {
        resolve();
      }
      if (spaceType) {
        this._spaceType = spaceType;
        if (requiredFeatures) {
          requiredFeatures.push(spaceType);
        } else {
          requiredFeatures = [spaceType];
        }
      }
      optionalFeatures ||= [];
      navigator.xr.requestSession(mode, { requiredFeatures, optionalFeatures }).then((session) => {
        this._session = session;
        this._mode = mode;
        this._addXRListener();
        const gl = <WebGLRenderingContext>this._engine._hardwareRenderer.gl;
        const attributes = gl.getContextAttributes();
        if (!attributes) {
          reject(Error("GetContextAttributes Error!"));
        }
        // if (!!!attributes.xrCompatible) {
        // Pico 此处有问题
        gl.makeXRCompatible().then(() => {
          console.log("makeXRCompatible success");
          const scaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(session);
          if (session.renderState.layers === undefined || !!!this._engine._hardwareRenderer.isWebGL2) {
            const layerInit = {
              antialias: session.renderState.layers === undefined ? attributes.antialias : true,
              alpha: true,
              depth: attributes.depth,
              stencil: attributes.stencil,
              framebufferScaleFactor: scaleFactor
            };
            this._xrBaseLayer = new XRWebGLLayer(session, gl, layerInit);
            session.updateRenderState({
              baseLayer: this._xrBaseLayer
            });
          } else {
            // console.log("makeXRCompatible WebGLRenderingContext");
            // const layerInit = {
            //   antialias: true,
            //   alpha: attributes.alpha,
            //   depth: attributes.depth,
            //   stencil: attributes.stencil,
            //   framebufferScaleFactor: scaleFactor
            // };
            this._xrBaseLayer = new XRWebGLLayer(session, gl);
            session.updateRenderState(<XRRenderStateInit>{
              layers: [this._xrBaseLayer]
            });
          }
          session.requestReferenceSpace(this._spaceType).then((value: XRReferenceSpace | XRBoundedReferenceSpace) => {
            this._xrSpace = value;
            resolve();
          }, reject);
        }, reject);
        // } else {
        //   reject(Error("MakeXRCompatible Error!"));
        // }
      }, reject);
    });
  }

  attachCamera(eye: EnumXREye, camera: XRCamera): void {
    this._xrCameras[eye] = camera;
  }

  createCamera(eye: EnumXREye, entity: Entity): XRCamera {
    const camera = entity.addComponent(XRCamera);
    this._xrCameras[eye] = camera;
    return camera;
  }

  run(): void {
    this.resume();
  }

  /**
   * Pause the engine.
   */
  pause(): void {
    if (this._isPaused) return;
    this._isPaused = true;
    this._session.cancelAnimationFrame(this._requestId);
  }

  resume(): void {
    if (!this._session) {
      Logger.warn("There are currently no available sessions");
      return;
    }
    if (!this._isPaused) return;
    this._isPaused = false;
    this._requestId = this._session.requestAnimationFrame(this._update);
  }

  private _update(systemTime: number, frame: XRFrame) {
    const engine = this._engine;
    if (frame) {
      engine._hardwareRenderer._mainFrameBuffer = this._xrBaseLayer?.framebuffer || null;
      const viewerPose = frame.getViewerPose(this._xrSpace);
      if (viewerPose) {
        const views = viewerPose.views;
        const xrCameras = this._xrCameras;
        for (let i = 0, n = views.length; i < n; i++) {
          const view = views[i];
          xrCameras[EnumXREye[view.eye]]?.updateByEye(view);
        }
        this.xrInput.updateHandedness(frame, this._xrSpace);
        this.xrInput.updateSessionEvent();
      }
    } else {
      const rhi = engine._hardwareRenderer;
      rhi._mainFrameBuffer = null;
      rhi._mainFrameWidth = 0;
      rhi._mainFrameHeight = 0;
    }
    this._requestId = this._session.requestAnimationFrame(this._update);
    engine.update();
  }

  destroy(): void {
    this._removeXRListener();
    this._mode = null;
    this._session = null;
    this._spaceType = null;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    this.xrInput = new XRInputManager(engine);
    this._update = this._update.bind(this);
    this._onEnd = this._onEnd.bind(this);
  }

  private _addXRListener() {
    this.xrInput.init(this._session);
    this._session.addEventListener(EnumXREvent.End, this._onEnd);
  }

  private _removeXRListener() {
    this._session?.removeEventListener(EnumXREvent.End, this._onEnd);
  }

  private _onEnd(event: Event) {
    this.destroy();
  }
}
