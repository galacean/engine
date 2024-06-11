import { Camera } from "../Camera";
import { Component } from "../Component";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { ignoreClone } from "../clone/CloneManager";
import { UIRenderer } from "./UIRenderer";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

export class UICanvas extends Component {
  /** @internal */
  static _overlayCamera: Camera;

  /** @internal */
  _camera: Camera;

  /** @internal */
  @ignoreClone
  _uiCanvasIndex: number = -1;

  private _renderMode: CanvasRenderMode = CanvasRenderMode.ScreenSpaceOverlay;
  private _renderCamera: Camera;
  private _resolutionAdaptationStrategy: ResolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
  private _sortOrder: number = 0;
  private _distance: number = 0;

  get renderMode(): CanvasRenderMode {
    return this._renderMode;
  }

  set renderMode(val: CanvasRenderMode) {
    if (this._renderMode !== val) {
      this._renderMode = val;
      this._renderCamera && this._updateCameraProiroty(this._renderCamera);
    }
  }

  get renderCamera(): Camera {
    if (this._renderMode === CanvasRenderMode.ScreenSpaceOverlay) {
      return UICanvas._overlayCamera;
    } else if (this._renderMode === CanvasRenderMode.ScreenSpaceCamera) {
      return this._renderCamera || UICanvas._overlayCamera;
    } else {
      return this._renderCamera;
    }
  }

  set renderCamera(val: Camera) {
    if (this._renderCamera !== val) {
      if (val) {
        this._renderCamera = val;
        this._updateCameraProiroty(val);
      } else {
        this._updateCameraProiroty(this._renderCamera);
        this._renderCamera = null;
      }
    }
  }

  get resolutionAdaptationStrategy(): ResolutionAdaptationStrategy {
    return this._resolutionAdaptationStrategy;
  }

  set resolutionAdaptationStrategy(val: ResolutionAdaptationStrategy) {}

  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(val: number) {
    if (this._sortOrder !== val) {
      this._sortOrder = val;
    }
  }

  get distance(): number {
    return this._distance;
  }

  set distance(val: number) {
    if (this._distance !== val) {
      this._distance = val;
    }
  }

  /**
   * @internal
   */
  _prepareRender(context: RenderContext): void {
    const children = this.entity.children;
    for (let i = 0, n = children.length; i < n; ++i) {
      const uiRenderer = children[i].getComponent(UIRenderer);
      if (uiRenderer) {
        
      }
    }
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene._componentsManager.addUICanvas(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._componentsManager.removeUICanvas(this);
  }

  private _updateCameraProiroty(camera: Camera): void {
    if (this._renderMode === CanvasRenderMode.ScreenSpaceOverlay) return;
    const priority = camera.priority;
    camera.priority = this._renderMode === CanvasRenderMode.WorldSpace ? priority & ~(1 << 30) : priority | (1 << 30);
  }
}
