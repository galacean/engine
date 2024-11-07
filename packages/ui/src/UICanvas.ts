import {
  Camera,
  CameraModifyFlags,
  Component,
  ComponentType,
  DependentMode,
  DisorderedArray,
  Entity,
  EntityModifyFlags,
  HitResult,
  MathUtil,
  Ray,
  Vector2,
  Vector3,
  deepClone,
  dependentComponents,
  ignoreClone
} from "@galacean/engine";

import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { Utils } from "./Utils";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";
import { IUIElement } from "./interface/IUIElement";
import { IUIGraphics } from "./interface/IUIGraphics";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component implements IUIElement {
  /** @internal */
  @ignoreClone
  _isRootCanvas: boolean = false;
  /** @internal */
  @ignoreClone
  _canvasIndex: number = -1;
  /** @internal */
  @ignoreClone
  _parents: Entity[] = [];
  /** @internal */
  @ignoreClone
  _hierarchyDirty: boolean = true;
  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _renderElement;
  /** @internal */
  @ignoreClone
  _sortDistance: number = 0;
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IUIElement> = new DisorderedArray();
  /** @internal */
  @ignoreClone
  _orderedElements: IUIGraphics[] = [];

  @ignoreClone
  private _renderMode = CanvasRenderMode.WorldSpace;
  @ignoreClone
  private _realRenderMode: number = CanvasRealRenderMode.None;
  @ignoreClone
  private _renderCamera: Camera;
  @ignoreClone
  private _cameraObserver: Camera;
  @ignoreClone
  private _resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
  @ignoreClone
  private _sortOrder: number = 0;
  @ignoreClone
  private _distance: number = 10;
  @ignoreClone
  private _transform: UITransform;
  @deepClone
  private _referenceResolution: Vector2 = new Vector2(800, 600);

  /** @internal */
  get elements(): IUIGraphics[] {
    const elements = this._orderedElements;
    if (this._hierarchyDirty) {
      elements.length = this._walk(this.entity, elements);
      this._hierarchyDirty = false;
    }
    return elements;
  }

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
      this._updateCameraObserver();
      this._setRealRenderMode(this._getRealRenderMode());
    }
  }

  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(val: Camera) {
    const preCamera = this._renderCamera;
    if (preCamera !== val) {
      this._renderCamera = val;
      this._updateCameraObserver();
      this._setRealRenderMode(this._getRealRenderMode());
    }
  }

  get resolutionAdaptationStrategy(): ResolutionAdaptationStrategy {
    return this._resolutionAdaptationStrategy;
  }

  set resolutionAdaptationStrategy(val: ResolutionAdaptationStrategy) {
    if (this._resolutionAdaptationStrategy !== val) {
      this._resolutionAdaptationStrategy = val;
      const realRenderMode = this._realRenderMode;
      if (
        realRenderMode === CanvasRenderMode.ScreenSpaceCamera ||
        realRenderMode === CanvasRenderMode.ScreenSpaceOverlay
      ) {
        this._adapterSizeInScreenSpace();
      }
    }
  }

  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(val: number) {
    if (this._sortOrder !== val) {
      this._sortOrder = val;
      this._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay &&
        // @ts-ignore
        this.scene._componentsManager._overlayCanvasesSortingFlag;
    }
  }

  get distance(): number {
    return this._distance;
  }

  set distance(val: number) {
    if (this._distance !== val) {
      this._distance = val;
      this._realRenderMode === CanvasRenderMode.ScreenSpaceCamera && this._adapterPoseInScreenSpace();
    }
  }

  constructor(entity: Entity) {
    super(entity);
    // @ts-ignore
    this._componentType = ComponentType.UICanvas;
    this._transform = <UITransform>entity.transform;
    this._onEntityModify = this._onEntityModify.bind(this);
    this._onCanvasSizeListener = this._onCanvasSizeListener.bind(this);
    this._onCameraModifyListener = this._onCameraModifyListener.bind(this);
    this._onCameraTransformListener = this._onCameraTransformListener.bind(this);
    this._onReferenceResolutionChanged = this._onReferenceResolutionChanged.bind(this);
    // @ts-ignore
    this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
  }

  raycast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const { elements } = this;
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      if (element.raycastEnable && element._raycast(ray, out, distance)) {
        return true;
      }
    }
    out.entity = null;
    out.component = null;
    out.distance = 0;
    out.point.set(0, 0, 0);
    out.normal.set(0, 0, 0);
    return false;
  }

  /**
   * @internal
   */
  _prepareRender(context): void {
    const { engine, elements, _realRenderMode: mode } = this;
    const { enableFrustumCulling, cullingMask, _frustum: frustum } = context.camera;
    const { frameCount } = engine.time;
    // @ts-ignore
    const renderElement = (this._renderElement = engine._renderElementPool.get());
    this._updateSortDistance(context.virtualCamera.position);
    renderElement.set(this.sortOrder, this._sortDistance);
    const { width, height } = engine.canvas;

    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      // @ts-ignore
      if ((element as unknown as Component)._componentType === ComponentType.UIRenderer) {
        const renderer = element as unknown as UIRenderer;
        // Filter by camera culling mask
        if (!(cullingMask & renderer.entity.layer)) {
          continue;
        }
        // Filter by camera frustum
        if (enableFrustumCulling) {
          switch (mode) {
            case CanvasRenderMode.ScreenSpaceOverlay:
              const { min, max } = renderer.bounds;
              if (min.x > width || max.x < 0 || min.y > height || max.y < 0) {
                continue;
              }
              break;
            case CanvasRenderMode.ScreenSpaceCamera:
            case CanvasRenderMode.WorldSpace:
              if (!frustum.intersectsBox(renderer.bounds)) {
                continue;
              }
              break;
            default:
              break;
          }
        }
        renderer._prepareRender(context);
        renderer._renderFrameCount = frameCount;
      }
    }
  }

  /**
   * @internal
   */
  _updateSortDistance(cameraPosition: Vector3): void {
    switch (this._realRenderMode) {
      case CanvasRenderMode.ScreenSpaceOverlay:
        this._sortDistance = 0;
        break;
      case CanvasRenderMode.ScreenSpaceCamera:
        this._sortDistance = this._distance;
        break;
      case CanvasRenderMode.WorldSpace:
        this._sortDistance = Vector3.distance(cameraPosition, this._transform.worldPosition);
        break;
    }
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    const entity = this.entity;
    // @ts-ignore
    entity._dispatchModify(EntityUIModifyFlags.UICanvasEnableInScene);
    const rootCanvas = Utils.getRootCanvasInParent(entity);
    Utils.registerElementToCanvas(this, rootCanvas);
    this._setIsRootCanvas(!rootCanvas);
    Utils.registerEntityListener(this);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    Utils.registerElementToCanvas(this, null);
    this._setIsRootCanvas(false);
    Utils.unRegisterEntityListener(this);
    // @ts-ignore
    this.entity._dispatchModify(EntityUIModifyFlags.UICanvasDisableInScene);
  }

  /**
   * @internal
   */
  @ignoreClone
  _onEntityModify(flag: number): void {
    if (flag === EntityUIModifyFlags.UICanvasEnableInScene || flag === EntityModifyFlags.Parent) {
      const rootCanvas = Utils.getRootCanvasInParent(this.entity);
      this._setIsRootCanvas(!rootCanvas);
      Utils.registerElementToCanvas(this, rootCanvas);
      Utils.registerEntityListener(this);
    }
  }

  private _adapterPoseInScreenSpace(): void {
    const { _transform: transform, _realRenderMode: realRenderMode } = this;
    if (realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      const { transform: cameraTransform } = this._renderCamera.entity;
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
    const { _transform: transform, _realRenderMode: realRenderMode } = this;
    const { x: width, y: height } = this._referenceResolution;
    let curWidth: number;
    let curHeight: number;
    if (realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      const renderCamera = this._renderCamera;
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
    transform.setScale(expectX, expectY, expectZ);
    transform.size.set(curWidth / expectX, curHeight / expectY);
  }

  private _walk(entity: Entity, elements: IUIGraphics[], depth = 0): number {
    // @ts-ignore
    const components = entity._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component.enabled && component._componentType === ComponentType.UIRenderer) {
        (component as unknown as IUIGraphics).depth = depth;
        elements[depth] = component as unknown as IUIGraphics;
        ++depth;
      }
    }
    const children = entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      const child = children[i];
      child.isActive && (depth = this._walk(child, elements, depth));
    }
    return depth;
  }

  private _updateCameraObserver(): void {
    const camera =
      this._isRootCanvas && this._renderMode === CanvasRenderMode.ScreenSpaceCamera ? this._renderCamera : null;
    const preCamera = this._cameraObserver;
    if (preCamera !== camera) {
      this._cameraObserver = camera;
      if (preCamera) {
        // @ts-ignore
        preCamera.entity.transform._updateFlagManager.removeListener(this._onCameraTransformListener);
        // @ts-ignore
        preCamera._unRegisterModifyListener(this._onCameraModifyListener);
      }
      if (camera) {
        // @ts-ignore
        camera.entity.transform._updateFlagManager.addListener(this._onCameraTransformListener);
        // @ts-ignore
        camera._registerModifyListener(this._onCameraModifyListener);
      }
    }
  }

  @ignoreClone
  private _onCameraModifyListener(flag: CameraModifyFlags): void {
    if (this._realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      switch (flag) {
        case CameraModifyFlags.CameraType:
        case CameraModifyFlags.AspectRatio:
          this._adapterSizeInScreenSpace();
          break;
        case CameraModifyFlags.FieldOfView:
          !this._renderCamera.isOrthographic && this._adapterSizeInScreenSpace();
          break;
        case CameraModifyFlags.OrthographicSize:
          this._renderCamera.isOrthographic && this._adapterSizeInScreenSpace();
          break;
        case CameraModifyFlags.DisableInScene:
          this._setRealRenderMode(CanvasRenderMode.ScreenSpaceOverlay);
          break;
        default:
          break;
      }
    } else {
      flag === CameraModifyFlags.EnableInScene && this._setRealRenderMode(CanvasRenderMode.ScreenSpaceCamera);
    }
  }

  @ignoreClone
  private _onCameraTransformListener(): void {
    this._realRenderMode === CanvasRenderMode.ScreenSpaceCamera && this._adapterPoseInScreenSpace();
  }

  private _addCanvasListener(): void {
    // @ts-ignore
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onCanvasSizeListener);
  }

  private _removeCanvasListener(): void {
    // @ts-ignore
    this.engine.canvas._sizeUpdateFlagManager.removeListener(this._onCanvasSizeListener);
  }

  @ignoreClone
  private _onCanvasSizeListener(): void {
    const { canvas } = this.engine;
    this._transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
    this._adapterSizeInScreenSpace();
  }

  @ignoreClone
  private _onReferenceResolutionChanged(): void {
    const realRenderMode = this._realRenderMode;
    if (
      realRenderMode === CanvasRenderMode.ScreenSpaceOverlay ||
      realRenderMode === CanvasRenderMode.ScreenSpaceCamera
    ) {
      this._adapterSizeInScreenSpace();
    }
  }

  private _setIsRootCanvas(isRootCanvas: boolean): void {
    if (this._isRootCanvas !== isRootCanvas) {
      this._isRootCanvas = isRootCanvas;
      this._updateCameraObserver();
      this._setRealRenderMode(this._getRealRenderMode());
      if (!isRootCanvas) {
        const { _disorderedElements: disorderedElements } = this;
        disorderedElements.forEach((element: IUIGraphics) => {
          Utils.registerElementToCanvas(element, Utils.getRootCanvasInParent(element.entity));
        });
        disorderedElements.length = 0;
        disorderedElements.garbageCollection();
        this._orderedElements.length = 0;
      }
    }
  }

  private _getRealRenderMode(): number {
    if (this._isRootCanvas) {
      const mode = this._renderMode;
      if (mode === CanvasRenderMode.ScreenSpaceCamera && !this._renderCamera?.enabled) {
        return CanvasRenderMode.ScreenSpaceOverlay;
      } else {
        return mode;
      }
    } else {
      return CanvasRealRenderMode.None;
    }
  }

  private _setRealRenderMode(curRealMode: number): void {
    const preRealMode = this._realRenderMode;
    if (preRealMode !== curRealMode) {
      this._realRenderMode = curRealMode;
      // @ts-ignore
      const componentsManager = this.scene._componentsManager;
      switch (preRealMode) {
        case CanvasRenderMode.ScreenSpaceOverlay:
          this._removeCanvasListener();
        case CanvasRenderMode.ScreenSpaceCamera:
        case CanvasRenderMode.WorldSpace:
          componentsManager.removeUICanvas(preRealMode, this);
          break;
        default:
          break;
      }
      switch (curRealMode) {
        case CanvasRenderMode.ScreenSpaceOverlay:
          this._addCanvasListener();
        case CanvasRenderMode.ScreenSpaceCamera:
          this._adapterPoseInScreenSpace();
          this._adapterSizeInScreenSpace();
        case CanvasRenderMode.WorldSpace:
          componentsManager.addUICanvas(curRealMode, this);
          break;
        default:
          break;
      }
    }
  }
}

/**
 * @remarks Extends `CanvasRenderMode`.
 */
enum CanvasRealRenderMode {
  None = 4
}

/**
 * @remarks Extends `EntityModifyFlags`.
 */
export enum EntityUIModifyFlags {
  UICanvasEnableInScene = 0x4,
  UICanvasDisableInScene = 0x8,
  UIGroupEnableInScene = 0x10,
  UIGroupDisableInScene = 0x20
}
