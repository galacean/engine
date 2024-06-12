import { MathUtil, Vector2 } from "@galacean/engine-math";
import { Camera, CameraModifyFlags } from "../Camera";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Transform } from "../Transform";
import { Logger } from "../base";
import { ignoreClone } from "../clone/CloneManager";
import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component {
  /** @internal */
  @ignoreClone
  _uiCanvasIndex: number = -1;

  private _renderMode: CanvasRenderMode = CanvasRenderMode.ScreenSpaceOverlay;
  private _renderCamera: Camera;
  private _resolutionAdaptationStrategy: ResolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
  private _sortOrder: number = 0;
  private _distance: number = 10;
  private _renderers: UIRenderer[] = [];
  private _transform: Transform;
  private _uiTransform: UITransform;
  private _referenceResolution: Vector2 = new Vector2(750, 1624);
  private _isRootCanvas: boolean = false;

  get referenceResolution(): Vector2 {
    return this._referenceResolution;
  }

  set referenceResolution(val: Vector2) {
    const { _referenceResolution: referenceResolution } = this;
    if (referenceResolution === val) return;
    (referenceResolution.x !== val.x || referenceResolution.y !== val.y) && referenceResolution.copyFrom(val);
  }

  get renderMode(): CanvasRenderMode {
    return this._renderMode;
  }

  set renderMode(mode: CanvasRenderMode) {
    let preMode = this._renderMode;
    if (preMode !== mode) {
      this._renderMode = mode;
      if (this._isRootCanvas) {
        const camera = this._renderCamera;
        preMode =
          preMode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : preMode;
        mode = mode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : mode;
        if (preMode !== mode) {
          if (preMode === CanvasRenderMode.ScreenSpaceCamera) {
            this._removeCameraListener(camera);
          } else if (preMode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._removeCanvasListener();
          }
          if (mode === CanvasRenderMode.ScreenSpaceCamera) {
            this._addCameraListener(camera);
          } else if (mode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._addCanvasListener();
          }
        }
      } else {
        Logger.error("「根画布」");
      }
    }
  }

  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(val: Camera) {
    const preCamera = this._renderCamera;
    if (preCamera !== val) {
      this._renderCamera = val;
      if (this._isRootCanvas && this._renderMode === CanvasRenderMode.ScreenSpaceCamera) {
        preCamera ? this._removeCameraListener(preCamera) : this._removeCanvasListener();
        if (val) {
          this._addCameraListener(val);
        } else {
          this._addCanvasListener();
        }
        this._adapterPoseInScreenSpace();
        this._adapterSizeInScreenSpace();
      } else {
        Logger.error("「根画布」「渲染模式 ScreenSpaceCamera 」");
      }
    }
  }

  get resolutionAdaptationStrategy(): ResolutionAdaptationStrategy {
    return this._resolutionAdaptationStrategy;
  }

  set resolutionAdaptationStrategy(val: ResolutionAdaptationStrategy) {
    if (this._resolutionAdaptationStrategy !== val) {
      this._resolutionAdaptationStrategy = val;
      if (this._isRootCanvas && this._renderMode !== CanvasRenderMode.WorldSpace) {
        this._adapterSizeInScreenSpace();
      } else {
        Logger.error("「根画布」「渲染模式 ScreenSpaceXXX 」");
      }
    }
  }

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
      const { _isRootCanvas: isRootCanvas, _renderMode: renderMode } = this;
      this._distance = val;
      if (isRootCanvas && renderMode === CanvasRenderMode.ScreenSpaceCamera && this._renderCamera) {
        this._adapterPoseInScreenSpace();
      } else {
        Logger.error("「根画布」 「渲染模式 ScreenSpaceCamera 」 「设置相机」");
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._transform = entity.getComponent(Transform);
    this._uiTransform = entity.getComponent(UITransform);
    this._onCanvasSizeChange = this._onCanvasSizeChange.bind(this);
    this._onCameraPropertyChange = this._onCameraPropertyChange.bind(this);
    this._onCameraTransformChange = this._onCameraTransformChange.bind(this);
    this._onReferenceResolutionChanged = this._onReferenceResolutionChanged.bind(this);
    // @ts-ignore
    this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged.bind(this);
  }

  _prepareRender(context: RenderContext): void {
    const { _renderers: renderers } = this;
    // 先清空，后续需要设置 dirty
    renderers.length = 0;
    this._walk(this.entity, renderers);
    const distanceForSort = this._distance;
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      renderer._distanceForSort = distanceForSort;
      renderer._prepareRender(context);
    }
  }

  _setIsRootCanvas(value: boolean): void {
    if (this._isRootCanvas !== value) {
      this._isRootCanvas = value;
      if (value) {
        this.scene._componentsManager.addUICanvas(this);
      } else {
        this.scene._componentsManager.removeUICanvas(this);
      }
    }
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._setIsRootCanvas(this.entity._isRoot);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._isRootCanvas && this.scene._componentsManager.removeUICanvas(this);
  }

  private _onReferenceResolutionChanged(): void {
    if (this._isRootCanvas && this.renderMode !== CanvasRenderMode.WorldSpace) {
      this._adapterSizeInScreenSpace();
    } else {
      Logger.error("「根画布」「渲染模式 ScreenSpaceXXX 」");
    }
  }

  private _onCameraTransformChange(): void {
    this._adapterPoseInScreenSpace();
  }

  private _onCameraPropertyChange(flag: CameraModifyFlags): void {
    switch (flag) {
      case CameraModifyFlags.NearPlane:
      case CameraModifyFlags.FarPlane:
        break;
      default:
        this._adapterSizeInScreenSpace();
        break;
    }
  }

  private _onCanvasSizeChange(): void {
    const { canvas } = this.engine;
    this._transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
    this._adapterSizeInScreenSpace();
  }

  private _adapterPoseInScreenSpace(): void {
    const { _renderCamera: renderCamera, _transform: transform } = this;
    if (renderCamera) {
      const { transform: cameraTransform } = renderCamera.entity;
      const { worldPosition: cameraWorldPosition, worldForward: cameraWorldForward } = cameraTransform;
      const { _distance: distance } = this;
      transform.setWorldPosition(
        cameraWorldPosition.x + cameraWorldForward.x * distance,
        cameraWorldPosition.y + cameraWorldForward.y * distance,
        cameraWorldPosition.z + cameraWorldForward.z * distance
      );
      transform.worldRotationQuaternion.copyFrom(cameraTransform.worldRotationQuaternion);
    } else {
      const { canvas } = this.engine;
      transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
      transform.worldRotationQuaternion.set(0, 0, 0, 1);
    }
  }

  private _adapterSizeInScreenSpace(): void {
    const { _renderCamera: renderCamera } = this;
    const { x: width, y: height } = this._referenceResolution;
    let curWidth: number;
    let curHeight: number;
    if (renderCamera) {
      curHeight = renderCamera.isOrthographic
        ? renderCamera.orthographicSize * 2
        : 2 * (Math.tan(MathUtil.degreeToRadian(renderCamera.fieldOfView / 2)) * this._distance);
      curWidth = renderCamera.aspectRatio * curHeight;
    } else {
      const canvas = this.engine.canvas;
      curHeight = canvas.height;
      curWidth = canvas.width;
    }
    let expectX: number, expectY: number, expectZ: number;
    switch (this._resolutionAdaptationStrategy) {
      case ResolutionAdaptationStrategy.WidthAdaptation:
        expectX = expectY = expectZ = curWidth / width;
        break;
      case ResolutionAdaptationStrategy.HeightAdaptation:
        expectX = expectY = expectZ = curHeight / height;
        break;
      case ResolutionAdaptationStrategy.BothAdaptation:
        expectX = curWidth / width;
        expectY = curHeight / height;
        expectZ = (expectX + expectY) / 2;
        break;
      case ResolutionAdaptationStrategy.ExpandAdaptation:
        expectX = expectY = expectZ = Math.min(curWidth / width, curHeight / height);
        break;
      case ResolutionAdaptationStrategy.ShrinkAdaptation:
        expectX = expectY = expectZ = Math.max(curWidth / width, curHeight / height);
        break;
      default:
        break;
    }
    this.entity.transform.setScale(expectX, expectY, expectZ);
    this._uiTransform.rect.set(curWidth / expectX, curHeight / expectY);
  }

  private _walk(entity: Entity, out: UIRenderer[]): void {
    const { _children: children } = entity;
    for (let i = 0, n = children.length; i < n; i++) {
      const { _components: components } = children[i];
      for (let j = 0, m = components.length; j < m; j++) {
        const component = components[j];
        component instanceof UIRenderer && out.push(component);
      }
    }
  }

  private _addCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.addListener(this._onCameraTransformChange);
    camera._updateFlagManager.addListener(this._onCameraPropertyChange);
  }

  private _addCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onCanvasSizeChange);
  }

  private _removeCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.removeListener(this._onCameraTransformChange);
    camera._updateFlagManager.removeListener(this._onCameraPropertyChange);
  }

  private _removeCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.removeListener(this._onCanvasSizeChange);
  }

  override _onParentChange(seniority: number): void {
    this._setIsRootCanvas(this.entity._isRoot);
  }
}
