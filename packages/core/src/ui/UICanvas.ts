import { Camera } from "../Camera";
import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

export class UICanvas extends Component {
  private _renderMode: number = CanvasRenderMode.ScreenSpaceOverlay;
  private _renderCamera: Camera;
  private _resolutionAdaptationStrategy: number = ResolutionAdaptationStrategy.BothAdaptation;
  private _sortOrder: number = 0;
  private _distance: number = 0;

  /** @internal */
  @ignoreClone
  _uiCanvasIndex: number = -1;

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
