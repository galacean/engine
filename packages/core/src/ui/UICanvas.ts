import { Camera } from "../Camera";
import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

export class UICanvas extends Component {
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

  set renderMode(val: CanvasRenderMode) {}

  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(val: Camera) {
    if (this._renderCamera !== val) {
      this._renderCamera = val;
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
}
