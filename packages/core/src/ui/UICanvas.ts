import { MathUtil, Ray, Vector2 } from "@galacean/engine-math";
import { Camera, CameraModifyFlags } from "../Camera";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity, EntityModifyFlags } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { Transform } from "../Transform";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { CameraType } from "../enums/CameraType";
import { RendererType } from "../enums/RendererType";
import { HitResult } from "../physics";
import { CanvasGroup } from "./CanvasGroup";
import { UIRenderer } from "./UIRenderer";
import { UITransform } from "./UITransform";
import { CanvasRenderMode } from "./enums/CanvasRenderMode";
import { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";

@dependentComponents(UITransform, DependentMode.AutoAdd)
export class UICanvas extends Component {
  /** @internal */
  @ignoreClone
  _uiCanvasIndex: number = -1;
  /** @internal */
  @ignoreClone
  _renderElement = new RenderElement();
  /** @internal */
  @ignoreClone
  _overlayCamera: Camera;

  @assignmentClone
  private _priority: number = 0;
  private _renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  private _renderCamera: Camera;
  private _resolutionAdaptationStrategy = ResolutionAdaptationStrategy.BothAdaptation;
  private _sortOrder: number = 0;
  private _distance: number = 10;
  private _renderers = Array<UIRenderer>();
  private _transform: Transform;
  private _uiTransform: UITransform;
  private _referenceResolution = new Vector2(800, 600);
  private _isRootCanvas = false;
  private _enableBlocked = true;
  private _parents = Array<Entity>();
  // private _hierarchyDirty = true;

  /**
   * The rendering priority of all renderers under the canvas, lower values are rendered first and higher values are rendered last.
   */
  get priority(): number {
    return this._priority;
  }

  set priority(value: number) {
    this._priority = value;
  }

  /** @internal */
  get renderers(): UIRenderer[] {
    // if (this._hierarchyDirty) {
    this._renderers.length = 0;
    const canvasGroup = this.entity.getComponent(CanvasGroup);
    const groupAlpha = canvasGroup ? canvasGroup.groupAlpha : 1;
    this._walk(this.entity, this._renderers, groupAlpha);
    // this._canvasHierarchyDirty = false;
    // }
    return this._renderers;
  }

  get enableBlocked(): boolean {
    return this._enableBlocked;
  }

  set enableBlocked(value: boolean) {
    this._enableBlocked = value;
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
      if (this._isRootCanvas) {
        const camera = this._renderCamera;
        preMode =
          preMode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : preMode;
        mode = mode === CanvasRenderMode.ScreenSpaceCamera && !camera ? CanvasRenderMode.ScreenSpaceOverlay : mode;
        if (preMode !== mode) {
          if (preMode === CanvasRenderMode.ScreenSpaceCamera) {
            this._removeCameraListener(camera);
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
          } else if (preMode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._removeCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
          }

          if (mode === CanvasRenderMode.ScreenSpaceCamera) {
            this._addCameraListener(camera);
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
          } else if (mode === CanvasRenderMode.ScreenSpaceOverlay) {
            this._addCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
          }

          this._adapterPoseInScreenSpace();
          this._adapterSizeInScreenSpace();
          const { _componentsManager: componentsManager } = this.scene;
          componentsManager.removeUICanvas(preMode, this);
          componentsManager.addUICanvas(mode, this);
        }
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
        const preMode = preCamera ? CanvasRenderMode.ScreenSpaceCamera : CanvasRenderMode.ScreenSpaceOverlay;
        const curMode = val ? CanvasRenderMode.ScreenSpaceCamera : CanvasRenderMode.ScreenSpaceOverlay;
        if (val) {
          this._addCameraListener(val);
        } else {
          this._addCanvasListener();
        }
        this._adapterPoseInScreenSpace();
        this._adapterSizeInScreenSpace();
        if (preMode !== curMode) {
          const { _componentsManager: componentsManager } = this.scene;
          componentsManager.removeUICanvas(preMode, this);
          componentsManager.addUICanvas(curMode, this);
        }
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
      }
    }
  }

  get sortOrder(): number {
    return this._sortOrder;
  }

  set sortOrder(val: number) {
    if (this._sortOrder !== val) {
      this._sortOrder = val;
      this._overlayCamera.priority = (1 << 16) + val;
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
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._transform = entity.getComponent(Transform);
    this._uiTransform = entity.getComponent(UITransform);
    this._onEntityListener = this._onEntityListener.bind(this);
    this._onParentListener = this._onParentListener.bind(this);
    this._onCanvasSizeListener = this._onCanvasSizeListener.bind(this);
    this._onCameraPropertyListener = this._onCameraPropertyListener.bind(this);
    this._onCameraTransformListener = this._onCameraTransformListener.bind(this);
    this._onReferenceResolutionChanged = this._onReferenceResolutionChanged.bind(this);
    // @ts-ignore
    this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
    const overlayCamera = (this._overlayCamera = new Camera(entity));
    overlayCamera.isOrthographic = true;
    overlayCamera.clearFlags = CameraClearFlags.None;
    overlayCamera._cameraType = CameraType.UIOverlay;
  }

  _prepareRender(context: RenderContext): void {
    const { renderers, _renderElement: renderElement } = this;
    const { frameCount } = this.engine.time;
    renderElement.set(this._priority, this._distance);
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      renderer._renderFrameCount = frameCount;
      renderer._prepareRender(context);
    }
    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._entity._updateFlagManager.addListener(this._onEntityListener);
    this._addParentListener();
    this._setIsRootCanvas(this._checkIsRootCanvas());
    // TODO
    this.scene._componentsManager.addCamera(this._overlayCamera);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this._entity._updateFlagManager.removeListener(this._onEntityListener);
    this._removeParentListener();
    this._setIsRootCanvas(false);

    // TODO
    this.scene._componentsManager.removeCamera(this._overlayCamera);
  }

  /**
   * @internal
   */
  rayCast(ray: Ray, out: HitResult[], camera?: Camera): void {
    // 获取这个画布上所有的 renderer
    const { renderers } = this;
    const uiPath: UIRenderer[] = [];
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (!renderer.rayCastTarget) continue;
      if (renderer._raycast(ray, camera)) {
        uiPath.push(renderer);
      }
    }
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
    if (this._renderMode === CanvasRenderMode.ScreenSpaceCamera && renderCamera) {
      curHeight = renderCamera.isOrthographic
        ? renderCamera.orthographicSize * 2
        : 2 * (Math.tan(MathUtil.degreeToRadian(renderCamera.fieldOfView / 2)) * this._distance);
      curWidth = renderCamera.aspectRatio * curHeight;
    } else {
      const overlayCamera = this._overlayCamera;
      curHeight = overlayCamera.orthographicSize * 2;
      curWidth = overlayCamera.aspectRatio * curHeight;
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

  private _walk(entity: Entity, out: UIRenderer[], groupAlpha: number = 1): void {
    const { _children: children } = entity;
    for (let i = 0, n = children.length; i < n; i++) {
      const child = children[i];
      const canvasGroup = child.getComponent(CanvasGroup);
      const newGroupAlpha = groupAlpha * (canvasGroup ? canvasGroup.groupAlpha : 1);
      const { _components: components } = child;
      for (let j = 0, m = components.length; j < m; j++) {
        const component = components[j];
        // @ts-ignore
        if (component._rendererType === RendererType.UI) {
          const uiRenderer = <UIRenderer>component;
          out.push(uiRenderer);
          uiRenderer._uiCanvas = this;
          uiRenderer.groupAlpha = newGroupAlpha;
        }
      }
      this._walk(child, out, newGroupAlpha);
    }
  }

  private _addCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.addListener(this._onCameraTransformListener);
    camera._updateFlagManager.addListener(this._onCameraPropertyListener);
  }

  private _removeCameraListener(camera: Camera): void {
    camera.entity.transform._updateFlagManager.removeListener(this._onCameraTransformListener);
    camera._updateFlagManager.removeListener(this._onCameraPropertyListener);
  }

  private _onCameraPropertyListener(flag: CameraModifyFlags): void {
    switch (flag) {
      case CameraModifyFlags.NearPlane:
      case CameraModifyFlags.FarPlane:
        break;
      default:
        this._adapterSizeInScreenSpace();
        break;
    }
  }

  private _onCameraTransformListener(): void {
    this._adapterPoseInScreenSpace();
  }

  private _addCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onCanvasSizeListener);
  }

  private _removeCanvasListener(): void {
    this.engine.canvas._sizeUpdateFlagManager.removeListener(this._onCanvasSizeListener);
  }

  private _onCanvasSizeListener(): void {
    const { canvas } = this.engine;
    this._transform.setWorldPosition(canvas.width / 2, canvas.height / 2, 0);
    this._adapterSizeInScreenSpace();
  }

  private _addParentListener(): void {
    const { _parents: parents } = this;
    let entity = this.entity;
    while (entity.parent) {
      entity = entity.parent;
      parents.push(entity);
      entity._updateFlagManager.addListener(this._onParentListener);
    }
  }

  private _removeParentListener(): void {
    const { _parents: parents } = this;
    for (let i = 0, n = parents.length; i < n; i++) {
      parents[i]._updateFlagManager.removeListener(this._onParentListener);
    }
    parents.length = 0;
  }

  private _onEntityListener(flag: EntityModifyFlags, param?: any): void {
    if (flag === EntityModifyFlags.Parent) {
      this._removeParentListener();
      this._addParentListener();
      this._setIsRootCanvas(this._checkIsRootCanvas());
    }
  }

  private _onParentListener(flag: EntityModifyFlags, param?: any): void {
    switch (flag) {
      case EntityModifyFlags.Parent:
        this._removeParentListener();
        this._addParentListener();
        this._setIsRootCanvas(this._checkIsRootCanvas());
        break;
      case EntityModifyFlags.AddComponent:
        param instanceof UICanvas && this._setIsRootCanvas(false);
        break;
      case EntityModifyFlags.DelComponent:
        param instanceof UICanvas && this._setIsRootCanvas(this._checkIsRootCanvas());
        break;
      default:
        break;
    }
  }

  private _onReferenceResolutionChanged(): void {
    this._adapterSizeInScreenSpace();
  }

  private _checkIsRootCanvas(): boolean {
    const canvases = this.entity.getComponentsInParent(UICanvas, []);
    for (let i = 0, n = canvases.length; i < n; i++) {
      if (canvases[i].enabled) return false;
    }
    return true;
  }

  private _setIsRootCanvas(value: boolean): void {
    if (this._isRootCanvas !== value) {
      this._isRootCanvas = value;
      const { _renderMode: renderMode } = this;
      if (value) {
        switch (renderMode) {
          case CanvasRenderMode.ScreenSpaceCamera:
            if (this._renderCamera) {
              this._addCameraListener(this._renderCamera);
            } else {
              this._addCanvasListener();
            }
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
            this._adapterPoseInScreenSpace();
            this._adapterSizeInScreenSpace();
            break;
          case CanvasRenderMode.ScreenSpaceOverlay:
            this._addCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = this._onReferenceResolutionChanged;
            this._adapterPoseInScreenSpace();
            this._adapterSizeInScreenSpace();
            break;
          default:
            break;
        }
        this.scene._componentsManager.addUICanvas(renderMode, this);
      } else {
        switch (renderMode) {
          case CanvasRenderMode.ScreenSpaceCamera:
            if (this._renderCamera) {
              this._removeCameraListener(this._renderCamera);
            } else {
              this._removeCanvasListener();
            }
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
            break;
          case CanvasRenderMode.ScreenSpaceOverlay:
            this._removeCanvasListener();
            // @ts-ignore
            this._referenceResolution._onValueChanged = null;
            break;
          default:
            break;
        }
        this.scene._componentsManager.removeUICanvas(renderMode, this);
      }
    }
  }
}
