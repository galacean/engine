import { Camera } from "../Camera";
import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

export class UICanvas extends Component {
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
      this._updateCameraProiroty();
    }
  }

  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(val: Camera) {
    if (this._renderCamera !== val) {
      if (val) {
        this._renderCamera = val;
        this._updateCameraProiroty();
      } else {
        this._renderCamera.priority &= ~(1 << 30);
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
  override _onEnableInScene(): void {
    this.scene._componentsManager.addUICanvas(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._componentsManager.removeUICanvas(this);
  }

  private _updateCameraProiroty(): void {
    if (this._renderCamera) {
      const priority = this._renderCamera.priority;
      this._renderCamera.priority =
        this._renderMode === CanvasRenderMode.WorldSpace ? priority & ~(1 << 30) : priority | (1 << 30);
    }
  }
}
