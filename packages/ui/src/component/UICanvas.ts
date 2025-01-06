import {
  Camera,
  CameraModifyFlags,
  Component,
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
import { Utils } from "../Utils";
import { CanvasRenderMode } from "../enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "../enums/ResolutionAdaptationStrategy";
import { IElement } from "../interface/IElement";
import { IGroupAble } from "../interface/IGroupAble";
import { UIGroup } from "./UIGroup";
import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { UIInteractive } from "./interactive/UIInteractive";

/**
 * The UI Canvas component serves as the root node for UI elements,
 * handling rendering and events based on it.
 */
@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component implements IElement {
  /** @internal */
  static _hierarchyCounter: number = 1;
  private static _tempGroupAbleList: IGroupAble[] = [];

  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
  /** @internal */
  @ignoreClone
  _indexInRootCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _isRootCanvasDirty: boolean = false;
  /** @internal */
  @ignoreClone
  _rootCanvasListeningEntities: Entity[] = [];

  /** @internal */
  @ignoreClone
  _isRootCanvas: boolean = false;
  /** @internal */
  @ignoreClone
  _renderElement: any;
  /** @internal */
  @ignoreClone
  _sortDistance: number = 0;
  /** @internal */
  @ignoreClone
  _orderedRenderers: UIRenderer[] = [];
  /** @internal */
  @ignoreClone
  _realRenderMode: number = CanvasRealRenderMode.None;
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IElement> = new DisorderedArray<IElement>();

  @ignoreClone
  private _renderMode = CanvasRenderMode.WorldSpace;
  @ignoreClone
  private _renderCamera: Camera;
  @ignoreClone
  private _cameraObserver: Camera;
  @ignoreClone
  private _resolutionAdaptationStrategy = ResolutionAdaptationStrategy.HeightAdaptation;
  @ignoreClone
  private _sortOrder: number = 0;
  @ignoreClone
  private _distance: number = 10;
  @deepClone
  private _referenceResolution: Vector2 = new Vector2(800, 600);
  @deepClone
  private _referenceResolutionPerUnit: number = 100;
  @ignoreClone
  private _hierarchyVersion: number = -1;

  /**
   * The conversion ratio between reference resolution and unit for UI elements in this canvas.
   */
  get referenceResolutionPerUnit(): number {
    return this._referenceResolutionPerUnit;
  }

  set referenceResolutionPerUnit(value: number) {
    if (this._referenceResolutionPerUnit !== value) {
      this._referenceResolutionPerUnit = value;
      this._disorderedElements.forEach((element) => {
        element._onRootCanvasModify?.(RootCanvasModifyFlags.ReferenceResolutionPerUnit);
      });
    }
  }

  /**
   * The reference resolution of the UI canvas in `ScreenSpaceCamera` and `ScreenSpaceOverlay` mode.
   */
  get referenceResolution(): Vector2 {
    return this._referenceResolution;
  }

  set referenceResolution(value: Vector2) {
    const referenceResolution = this._referenceResolution;
    if (referenceResolution === value) return;
    (referenceResolution.x !== value.x || referenceResolution.y !== value.y) && referenceResolution.copyFrom(value);
  }

  /**
   * The rendering mode of the UI canvas.
   */
  get renderMode(): CanvasRenderMode {
    return this._renderMode;
  }

  set renderMode(mode: CanvasRenderMode) {
    const preMode = this._renderMode;
    if (preMode !== mode) {
      this._renderMode = mode;
      this._updateCameraObserver();
      this._setRealRenderMode(this._getRealRenderMode());
    }
  }

  /**
   * The camera used to render the UI canvas in `ScreenSpaceCamera` mode.
   * @remarks If set `ScreenSpaceCamera` but no corresponding camera is assigned, the actual rendering mode defaults to `ScreenSpaceOverlay`.
   */
  get renderCamera(): Camera {
    return this._renderCamera;
  }

  set renderCamera(value: Camera) {
    const preCamera = this._renderCamera;
    if (preCamera !== value) {
      this._renderCamera = value;
      this._updateCameraObserver();
      this._setRealRenderMode(this._getRealRenderMode());
    }
  }

  /**
   * The screen resolution adaptation strategy of the UI canvas in `ScreenSpaceCamera` and `ScreenSpaceOverlay` mode.
   */
  get resolutionAdaptationStrategy(): ResolutionAdaptationStrategy {
    return this._resolutionAdaptationStrategy;
  }

  set resolutionAdaptationStrategy(value: ResolutionAdaptationStrategy) {
    if (this._resolutionAdaptationStrategy !== value) {
      this._resolutionAdaptationStrategy = value;
      const realRenderMode = this._realRenderMode;
      if (
        realRenderMode === CanvasRenderMode.ScreenSpaceCamera ||
        realRenderMode === CanvasRenderMode.ScreenSpaceOverlay
      ) {
        this._adapterSizeInScreenSpace();
      }
    }
  }

  /**
   * The rendering order priority of the UI canvas in `ScreenSpaceOverlay` mode.
   */
  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(value: number) {
    if (this._sortOrder !== value) {
      this._sortOrder = value;
      this._realRenderMode === CanvasRenderMode.ScreenSpaceOverlay &&
        // @ts-ignore
        (this.scene._componentsManager._overlayCanvasesSortingFlag = true);
    }
  }

  /**
   * The distance between the UI canvas and the camera in `ScreenSpaceCamera` mode.
   */
  get distance(): number {
    return this._distance;
  }

  set distance(value: number) {
    if (this._distance !== value) {
      this._distance = value;
      if (this._realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
        this._adapterPoseInScreenSpace();
        this._adapterSizeInScreenSpace();
      }
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onCanvasSizeListener = this._onCanvasSizeListener.bind(this);
    this._onCameraModifyListener = this._onCameraModifyListener.bind(this);
    this._onCameraTransformListener = this._onCameraTransformListener.bind(this);
    this._onReferenceResolutionChanged = this._onReferenceResolutionChanged.bind(this);
    // @ts-ignore
    this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
    this._rootCanvasListener = this._rootCanvasListener.bind(this);
  }

  raycast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const renderers = this._getRenderers();
    for (let i = renderers.length - 1; i >= 0; i--) {
      const element = renderers[i];
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
  _getRootCanvas(): UICanvas {
    return this._rootCanvas;
  }

  /**
   * @internal
   */
  _canRender(camera: Camera): boolean {
    return this._renderMode !== CanvasRenderMode.ScreenSpaceCamera || this._renderCamera === camera;
  }

  /**
   * @internal
   */
  _prepareRender(context): void {
    const { engine, _realRenderMode: mode } = this;
    const { enableFrustumCulling, cullingMask, _frustum: frustum } = context.camera;
    const { frameCount } = engine.time;
    // @ts-ignore
    const renderElement = (this._renderElement = engine._renderElementPool.get());
    this._updateSortDistance(context.virtualCamera.position);
    renderElement.set(this.sortOrder, this._sortDistance);
    const { width, height } = engine.canvas;
    const renderers = this._getRenderers();
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
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
        this._sortDistance = Vector3.distance(cameraPosition, this.entity.transform.worldPosition);
        break;
    }
  }

  // @ts-ignore
  override _onEnableInScene(): void {
    const entity = this.entity;
    // @ts-ignore
    entity._dispatchModify(EntityUIModifyFlags.CanvasEnableInScene, this);
    const rootCanvas = Utils.searchRootCanvasInParents(this);
    this._setIsRootCanvas(!rootCanvas);
    Utils.setRootCanvas(this, rootCanvas);
  }

  // @ts-ignore
  override _onDisableInScene(): void {
    this._setIsRootCanvas(false);
    Utils.cleanRootCanvas(this);
  }

  /**
   * @internal
   */
  @ignoreClone
  _rootCanvasListener(flag: number, param: any): void {
    if (this._isRootCanvas) {
      if (flag === EntityModifyFlags.Parent) {
        const rootCanvas = Utils.searchRootCanvasInParents(this);
        this._setIsRootCanvas(!rootCanvas);
        Utils.setRootCanvas(this, rootCanvas);
      } else if (flag === EntityUIModifyFlags.CanvasEnableInScene) {
        this._setIsRootCanvas(false);
        Utils.setRootCanvas(this, <UICanvas>param);
      }
    } else {
      if (flag === EntityModifyFlags.Parent) {
        const rootCanvas = Utils.searchRootCanvasInParents(this);
        this._setIsRootCanvas(!rootCanvas);
        Utils.setRootCanvas(this, rootCanvas);
      }
    }
  }

  private _getRenderers(): UIRenderer[] {
    const { _orderedRenderers: renderers, entity } = this;
    const uiHierarchyVersion = entity._uiHierarchyVersion;
    if (this._hierarchyVersion !== uiHierarchyVersion) {
      renderers.length = this._walk(this.entity, renderers);
      UICanvas._tempGroupAbleList.length = 0;
      this._hierarchyVersion = uiHierarchyVersion;
      ++UICanvas._hierarchyCounter;
    }
    return renderers;
  }

  private _adapterPoseInScreenSpace(): void {
    const transform = this.entity.transform;
    const realRenderMode = this._realRenderMode;
    if (realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      const { transform: cameraTransform } = this._renderCamera.entity;
      const { worldPosition: cameraWorldPosition, worldForward: cameraWorldForward } = cameraTransform;
      const distance = this._distance;
      transform.setWorldPosition(
        cameraWorldPosition.x + cameraWorldForward.x * distance,
        cameraWorldPosition.y + cameraWorldForward.y * distance,
        cameraWorldPosition.z + cameraWorldForward.z * distance
      );
      transform.worldRotationQuaternion.copyFrom(cameraTransform.worldRotationQuaternion);
    } else {
      const { canvas } = this.engine;
      transform.setWorldPosition(canvas.width * 0.5, canvas.height * 0.5, 0);
      transform.worldRotationQuaternion.set(0, 0, 0, 1);
    }
  }

  private _adapterSizeInScreenSpace(): void {
    const transform = <UITransform>this.entity.transform;
    const realRenderMode = this._realRenderMode;
    const { x: width, y: height } = this._referenceResolution;
    let curWidth: number;
    let curHeight: number;
    if (realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      const renderCamera = this._renderCamera;
      curHeight = renderCamera.isOrthographic
        ? renderCamera.orthographicSize * 2
        : 2 * (Math.tan(MathUtil.degreeToRadian(renderCamera.fieldOfView * 0.5)) * this._distance);
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
        expectZ = (expectX + expectY) * 0.5;
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

  private _walk(entity: Entity, renderers: UIRenderer[], depth = 0, group: UIGroup = null): number {
    // @ts-ignore
    const components: Component[] = entity._components;
    const tempGroupAbleList = UICanvas._tempGroupAbleList;
    let groupAbleCount = 0;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (!component.enabled) continue;
      if (component instanceof UIRenderer) {
        renderers[depth] = component;
        ++depth;
        component._isRootCanvasDirty && Utils.setRootCanvas(component, this);
        if (component._isGroupDirty) {
          tempGroupAbleList[groupAbleCount++] = component;
        }
      } else if (component instanceof UIInteractive) {
        component._isRootCanvasDirty && Utils.setRootCanvas(component, this);
        if (component._isGroupDirty) {
          tempGroupAbleList[groupAbleCount++] = component;
        }
      } else if (component instanceof UIGroup) {
        component._isRootCanvasDirty && Utils.setRootCanvas(component, this);
        component._isGroupDirty && Utils.setGroup(component, group);
        group = component;
      }
    }
    for (let i = 0; i < groupAbleCount; i++) {
      Utils.setGroup(tempGroupAbleList[i], group);
    }
    const children = entity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      const child = children[i];
      child.isActive && (depth = this._walk(child, renderers, depth, group));
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
        preCamera.entity._updateFlagManager.removeListener(this._onCameraTransformListener);
        // @ts-ignore
        preCamera._unRegisterModifyListener(this._onCameraModifyListener);
      }
      if (camera) {
        // @ts-ignore
        camera.entity._updateFlagManager.addListener(this._onCameraTransformListener);
        // @ts-ignore
        camera._registerModifyListener(this._onCameraModifyListener);
      }
    }
  }

  @ignoreClone
  private _onCameraModifyListener(flag: CameraModifyFlags): void {
    if (this._realRenderMode === CanvasRenderMode.ScreenSpaceCamera) {
      switch (flag) {
        case CameraModifyFlags.ProjectionType:
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
    this.entity.transform.setWorldPosition(canvas.width * 0.5, canvas.height * 0.5, 0);
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
      if (isRootCanvas) {
        this.entity._updateUIHierarchyVersion(UICanvas._hierarchyCounter);
      } else {
        const { _disorderedElements: disorderedElements } = this;
        disorderedElements.forEach((element: IElement) => {
          if (element instanceof UICanvas) {
            const rootCanvas = Utils.searchRootCanvasInParents(element);
            element._setIsRootCanvas(!rootCanvas);
            Utils.setRootCanvas(element, rootCanvas);
          } else {
            Utils.setRootCanvasDirty(this);
            Utils.setGroupDirty(<IGroupAble>element);
          }
        });
        disorderedElements.length = 0;
        disorderedElements.garbageCollection();
        this._orderedRenderers.length = 0;
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
          componentsManager.removeUICanvas(this, preRealMode === CanvasRenderMode.ScreenSpaceOverlay);
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
          componentsManager.addUICanvas(this, curRealMode === CanvasRenderMode.ScreenSpaceOverlay);
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
  CanvasEnableInScene = 0x4,
  GroupEnableInScene = 0x8
}

export enum RootCanvasModifyFlags {
  None = 0x0,
  ReferenceResolutionPerUnit = 0x1,
  All = 0x1
}
