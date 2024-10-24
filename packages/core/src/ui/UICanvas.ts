import { MathUtil, Matrix, Ray, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Camera, CameraModifyFlags } from "../Camera";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity, EntityModifyFlags } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ComponentType } from "../enums/ComponentType";
import { HitResult } from "../physics";
import { DisorderedArray } from "../utils/DisorderedArray";
import { GroupModifyFlags, UIGroup } from "./UIGroup";
import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { UIUtils } from "./UIUtils";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";
import { IUIElement } from "./interface/IUIElement";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component implements IUIElement {
  @ignoreClone
  depth: number = 0;
  @deepClone
  raycastPadding: Vector4 = new Vector4(0, 0, 0, 0);

  /** @internal */
  @ignoreClone
  _rootCanvas: UICanvas;
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
  _indexInCanvas: number = -1;
  /** @internal */
  @ignoreClone
  _group: UIGroup;
  /** @internal */
  @ignoreClone
  _indexInGroup: number = -1;
  /** @internal */
  @ignoreClone
  _renderElement: RenderElement;
  /** @internal */
  @ignoreClone
  _sortDistance: number = 0;
  /** @internal */
  @ignoreClone
  _disorderedElements: DisorderedArray<IUIElement> = new DisorderedArray();
  /** @internal */
  @ignoreClone
  _orderedElements: IUIElement[] = [];
  /** @internal */
  @ignoreClone
  _runtimeRaycastEnable: boolean = true;

  @ignoreClone
  private _raycastEnable: boolean = true;
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
  get elements(): IUIElement[] {
    const elements = this._orderedElements;
    if (this._hierarchyDirty) {
      elements.length = this._walk(this.entity, elements);
      this._hierarchyDirty = false;
    }
    return elements;
  }

  get raycastEnable(): boolean {
    return this._raycastEnable;
  }

  set raycastEnable(val: boolean) {
    if (this._raycastEnable !== val) {
      this._raycastEnable = val;
      const runtimeRaycastEnable = val && (!this._group || this._group._getGlobalRaycastEnable());
      if (this._runtimeRaycastEnable !== runtimeRaycastEnable) {
        this._runtimeRaycastEnable = runtimeRaycastEnable;
        this._entity._onUIInteractiveChange(runtimeRaycastEnable);
      }
    }
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
      if (element._runtimeRaycastEnable && element._raycast(ray, out, distance)) {
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
  _prepareRender(context: RenderContext): void {
    const { engine, elements, _realRenderMode: mode } = this;
    const { enableFrustumCulling, cullingMask, _frustum: frustum } = context.camera;
    const { frameCount } = engine.time;
    const renderElement = (this._renderElement = engine._renderElementPool.get());
    this._updateSortDistance(context.virtualCamera.position);
    renderElement.set(this.sortOrder, this._sortDistance);
    const { width, height } = engine.canvas;

    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      if ((element as unknown as Component)._componentType === ComponentType.UIRenderer) {
        const renderer = element as unknown as UIRenderer;
        // Filter by camera culling mask
        if (!(cullingMask & renderer._entity.layer)) {
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

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    const entity = this._entity;
    entity._dispatchModify(EntityModifyFlags.UICanvasEnableInScene);
    UIUtils.registerUIToGroup(this, UIUtils.getGroupInParents(entity));
    const rootCanvas = UIUtils.getRootCanvasInParent(entity);
    UIUtils.registerUIToCanvas(this, rootCanvas);
    this._setIsRootCanvas(!rootCanvas);
    UIUtils.registerEntityListener(this);
    entity._onUIInteractiveChange(this._runtimeRaycastEnable);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    UIUtils.registerUIToGroup(this, null);
    UIUtils.registerUIToCanvas(this, null);
    this._setIsRootCanvas(false);
    UIUtils.unRegisterEntityListener(this);
    const entity = this._entity;
    entity._dispatchModify(EntityModifyFlags.UICanvasDisableInScene);
    entity._onUIInteractiveChange(false);
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, out: HitResult, distance: number = Number.MAX_SAFE_INTEGER): boolean {
    const entity = this._entity;
    const plane = UIRenderer._tempPlane;
    const transform = entity.transform;
    const normal = plane.normal.copyFrom(transform.worldForward);
    plane.distance = -Vector3.dot(normal, transform.worldPosition);
    const curDistance = ray.intersectPlane(plane);
    if (curDistance >= 0 && curDistance < distance) {
      const hitPointWorld = ray.getPoint(curDistance, UIRenderer._tempVec30);
      const worldMatrixInv = UIRenderer._tempMat;
      Matrix.invert(this.entity.transform.worldMatrix, worldMatrixInv);
      const localPosition = UIRenderer._tempVec31;
      Vector3.transformCoordinate(hitPointWorld, worldMatrixInv, localPosition);
      if (this._hitTest(localPosition)) {
        out.distance = curDistance;
        out.entity = entity;
        out.component = this;
        out.normal.copyFrom(normal);
        out.point.copyFrom(hitPointWorld);
        return true;
      }
      return true;
    }
    return false;
  }

  /**
   * @internal
   */
  @ignoreClone
  _onEntityModify(flag: EntityModifyFlags): void {
    switch (flag) {
      case EntityModifyFlags.SiblingIndex:
        this._rootCanvas && (this._rootCanvas._hierarchyDirty = true);
        break;
      case EntityModifyFlags.UICanvasEnableInScene:
      case EntityModifyFlags.Parent:
        const rootCanvas = UIUtils.getRootCanvasInParent(this._entity);
        rootCanvas && (rootCanvas._hierarchyDirty = true);
        this._setIsRootCanvas(!rootCanvas);
        UIUtils.registerUIToCanvas(this, rootCanvas);
        UIUtils.registerEntityListener(this);
      case EntityModifyFlags.UIGroupEnableInScene:
        UIUtils.registerUIToGroup(this, UIUtils.getGroupInParents(this._entity));
        break;
      default:
        break;
    }
  }

  /**
   * @internal
   */
  @ignoreClone
  _onGroupModify(flag: GroupModifyFlags): void {
    if (flag & GroupModifyFlags.RaycastEnable) {
      const runtimeRaycastEnable = this.raycastEnable && this._group._getGlobalRaycastEnable();
      if (this._runtimeRaycastEnable !== runtimeRaycastEnable) {
        this._runtimeRaycastEnable = runtimeRaycastEnable;
        this.entity._onUIInteractiveChange(runtimeRaycastEnable);
      }
    }
  }

  private _hitTest(localPosition: Vector3): boolean {
    const { x, y } = localPosition;
    const uiTransform = this._transform;
    const { x: width, y: height } = uiTransform.size;
    const { x: pivotX, y: pivotY } = uiTransform.pivot;
    const { x: paddingLeft, y: paddingBottom, z: paddingRight, w: paddingTop } = this.raycastPadding;
    return (
      x >= -width * pivotX + paddingLeft &&
      x <= width * (1 - pivotX) - paddingRight &&
      y >= -height * pivotY + paddingTop &&
      y <= height * (1 - pivotY) - paddingBottom
    );
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

  private _walk(entity: Entity, elements: IUIElement[], depth = 0): number {
    const { _components: components, _children: children } = entity;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component.enabled && component._componentType & ComponentType.UIElement) {
        (component as unknown as IUIElement).depth = depth;
        elements[depth] = component as unknown as IUIElement;
        ++depth;
      }
    }
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
        preCamera.entity.transform._updateFlagManager.removeListener(this._onCameraTransformListener);
        preCamera._unRegisterModifyListener(this._onCameraModifyListener);
      }
      if (camera) {
        camera.entity.transform._updateFlagManager.addListener(this._onCameraTransformListener);
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
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onCanvasSizeListener);
  }

  private _removeCanvasListener(): void {
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
        disorderedElements.forEach(
          (element: IUIElement) => {
            UIUtils.registerUIToCanvas(element, UIUtils.getRootCanvasInParent(element._entity));
          },
          () => {}
        );
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
