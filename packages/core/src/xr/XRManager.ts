import { Engine } from "../Engine";
import { Logger } from "../base";
import { EnumXREvent } from "./enum/EnumXREvent";
import { EnumXRMode } from "./enum/EnumXRMode";
import { XRCamera } from "./XRCamera";
import { EnumXREye } from "./enum/EnumXREye";
import { EnumXRSpaceType } from "./enum/EnumXRSpaceType";

export class XRManager {
  private _engine: Engine;
  private _mode: EnumXRMode;
  private _spaceType: EnumXRSpaceType;
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
      navigator.xr.isSessionSupported(mode).then((isSupported: boolean) => {
        if (isSupported) {
          resolve();
        } else {
          reject(new Error("The current context doesn't support WebXR"));
        }
      });
    });
  }

  async init(
    mode: EnumXRMode,
    spaceType?: EnumXRSpaceType,
    requiredFeatures?: string[],
    optionalFeatures?: string[]
  ): Promise<void> {
    if (this._session) {
      return;
    }
    if (requiredFeatures) {
      requiredFeatures.push(spaceType);
    } else {
      requiredFeatures = [spaceType];
    }
    const session = (this._session = await navigator.xr.requestSession(mode, { requiredFeatures, optionalFeatures }));
    this._mode = mode;
    this._spaceType = spaceType;
    this._addXRListener();
    const gl = <WebGLRenderingContext>this._engine._hardwareRenderer.gl;
    const attributes = this._engine._hardwareRenderer.gl.getContextAttributes();
    if (!attributes) {
      throw Error("GetContextAttributes Error!");
    }
    if (!!!attributes.xrCompatible) {
      // 将 webgl
      await gl.makeXRCompatible();
    } else {
      throw Error("MakeXRCompatible Error!");
    }
    const scaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(session);
    if (session.renderState.layers === undefined) {
      const layerInit = {
        antialias: attributes.antialias,
        alpha: attributes.alpha,
        depth: attributes.depth,
        stencil: attributes.stencil,
        framebufferScaleFactor: scaleFactor
      };
      this._xrBaseLayer = new XRWebGLLayer(session, gl, layerInit);
      session.updateRenderState(<XRRenderStateInit>{
        baseLayer: this._xrBaseLayer
      });
    } else if (gl instanceof WebGLRenderingContext) {
      const layerInit = {
        antialias: true,
        alpha: attributes.alpha,
        depth: attributes.depth,
        stencil: attributes.stencil,
        framebufferScaleFactor: scaleFactor
      };
      this._xrBaseLayer = new XRWebGLLayer(session, gl, layerInit);
      session.updateRenderState(<XRRenderStateInit>{
        layers: [this._xrBaseLayer]
      });
    }
    this._xrSpace = await session.requestReferenceSpace(this._spaceType);
  }

  attachCamera(eye: EnumXREye, camera: XRCamera): void {
    this._xrCameras[eye] = camera;
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
      }
    } else {
      engine._hardwareRenderer._mainFrameBuffer;
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
    // end
    this._onEnd = this._onEnd.bind(this);
    // select
    this._onSelect = this._onSelect.bind(this);
    this._onSelectStart = this._onSelectStart.bind(this);
    this._onSelectEnd = this._onSelectEnd.bind(this);
    // squeeze
    this._onSqueeze = this._onSqueeze.bind(this);
    this._onSqueezeStart = this._onSqueezeStart.bind(this);
    this._onSqueezeEnd = this._onSqueezeEnd.bind(this);
    // input
    this._onInputSourcesChange = this._onInputSourcesChange.bind(this);
    this._update = this._update.bind(this);
  }

  private _addXRListener() {
    this._session.addEventListener(EnumXREvent.End, this._onEnd);
  }

  private _removeXRListener() {
    this._session.removeEventListener(EnumXREvent.End, this._onEnd);
  }

  private _onEnd(event: Event) {
    this.destroy();
  }

  private _onSelect(event: Event) {}
  private _onSelectStart(event: Event) {}
  private _onSelectEnd(event: Event) {}
  private _onSqueeze(event: Event) {}
  private _onSqueezeStart(event: Event) {}
  private _onSqueezeEnd(event: Event) {}
  private _onInputSourcesChange(event: Event) {}
}
