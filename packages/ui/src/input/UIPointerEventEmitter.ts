import {
  Camera,
  CameraClearFlags,
  DisorderedArray,
  Entity,
  Pointer,
  PointerEventData,
  PointerEventEmitter,
  Ray,
  RenderElement,
  Scene,
  registerPointerEventEmitter
} from "@galacean/engine";
import { UICanvas } from "..";
import { UIRenderer } from "../component/UIRenderer";
import { UIHitResult } from "./UIHitResult";

/**
 * Structural view of the `@internal` render queue fields consumed by the hit test.
 */
interface RenderedQueue {
  batchedElements: ReadonlyArray<RenderElement>;
}

/**
 * State of the scan in progress, reused so the helpers below stay free of long parameter lists.
 */
interface RaycastScan {
  camera: Camera;
  cursors: Map<number, number>;
  ray: Ray;
  hitResult: UIHitResult;
  nearestOnly: boolean;
  maxDistance: number;
  accepted: boolean;
}

/**
 * @internal
 */
@registerPointerEventEmitter()
export class UIPointerEventEmitter extends PointerEventEmitter {
  private static _MAX_PATH_DEPTH = 2048;
  private static _tempSet: Set<number> = new Set();
  private static _path: Entity[] = [];
  private static _tempArray0: Entity[] = [];
  private static _tempArray1: Entity[] = [];
  /** Per canvas read cursor into its own painted element list, reused by every query. */
  private static _elementCursors: Map<number, number> = new Map();
  /** Cursor value marking a canvas that is tested as a whole instead of expanded. */
  private static _WHOLE_CANVAS = -1;

  private _enteredPath: Entity[] = [];
  private _pressedPath: Entity[] = [];
  private _draggedPath: Entity[] = [];
  /** Nearest hit of the depth writing passes, the depth the transparent pass is tested against. */
  private _barrierHitResult = new UIHitResult();
  /** Staging result of a single candidate, so a rejected hit cannot overwrite the accepted one. */
  private _scratchHitResult = new UIHitResult();
  /** Valid only while `_raycastRenderedContent` runs; the scan is synchronous and not reentrant. */
  private _scan: RaycastScan = {
    camera: null,
    cursors: null,
    ray: null,
    hitResult: null,
    nearestOnly: false,
    maxDistance: 0,
    accepted: false
  };

  _init(): void {
    this._hitResult = new UIHitResult();
  }

  override processRaycast(scenes: readonly Scene[], pointer: Pointer): void {
    const { _tempRay: ray } = PointerEventEmitter;
    const hitResult = this._hitResult;
    const { position } = pointer;
    const { x, y } = position;
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      // @ts-ignore
      const componentsManager = scene._componentsManager;
      // Overlay Canvas
      const overlayCanvases: DisorderedArray<UICanvas> = componentsManager._overlayCanvases;
      // Screen to world ( Assume that world units have a one-to-one relationship with pixel units )
      ray.origin.set(position.x, scene.engine.canvas.height - position.y, 1);
      ray.direction.set(0, 0, -1);
      for (let j = overlayCanvases.length - 1; j >= 0; j--) {
        if (overlayCanvases.get(j)._raycast(ray, hitResult)) {
          this._updateRaycast((<UIHitResult>hitResult).component, pointer);
          return;
        }
      }

      const cameras = componentsManager._activeCameras;
      for (let j = cameras.length - 1; j >= 0; j--) {
        const camera = cameras.get(j);
        if (camera.renderTarget) continue;
        const { pixelViewport } = camera;
        if (
          x < pixelViewport.x ||
          y < pixelViewport.y ||
          x > pixelViewport.x + pixelViewport.width ||
          y > pixelViewport.y + pixelViewport.height
        ) {
          continue;
        }
        camera.screenPointToRay(pointer.position, ray);

        // The hit order is the one the camera actually painted, so it is consumed instead of derived
        if (this._raycastRenderedContent(camera, ray, hitResult)) {
          this._updateRaycast((<UIHitResult>hitResult).component, pointer);
          return;
        }
        if (camera.clearFlags & CameraClearFlags.Color) {
          this._updateRaycast(null);
          return;
        }
      }
      this._updateRaycast(null);
    }
  }

  /**
   * Hit-test the content of the pass this camera completed last, topmost painted first.
   *
   * The hit test consumes the draw order rather than deriving it again: `Engine.update()` runs the
   * pointer raycast before it renders, and the queues are only reset — and their pooled elements only
   * reused — while rendering, so the queues still hold the pass the pointer is aiming at, which is the
   * frame currently on screen. Both containers are rebuilt for every pass (`CullingResults.reset` empties
   * the queues and `UICanvas._prepareRender` refills `_renderElements` before the pass paints), so the
   * counts and contents read here are that pass rather than an accumulation of earlier ones. A camera
   * that did not render keeps its previous pass, which `processRaycast` skips through its viewport test.
   * Elements of one canvas can be interleaved with another canvas' elements, so the walk stays at element
   * level: each batch leader is expanded back through `canvas._renderElements`, which is the per renderer
   * draw order the canvas sorted and batched from. The invariants relied upon here are stated next to the
   * code that owns them, `BasicRenderPipeline.render` and `ClearableObjectPool.clear`.
   *
   * Draw order alone is not visibility: `opaque` and `alphaTest` are painted first so that depth
   * writing content rejects whatever is farther, which is what the `Less` depth test of the UI shaders
   * then enforces. The nearest hit of those two passes is therefore the depth barrier the transparent
   * pass is tested against, and transparent content behind it must not answer even though it is painted
   * last.
   */
  private _raycastRenderedContent(camera: Camera, ray: Ray, hitResult: UIHitResult): boolean {
    // @ts-ignore
    const cullingResults = camera._renderPipeline?._cullingResults;
    if (!cullingResults) return false;

    const scan = this._scan;
    scan.camera = camera;
    scan.ray = ray;
    scan.cursors = UIPointerEventEmitter._elementCursors;
    scan.cursors.clear();
    const barrier = this._barrierHitResult;

    const hasOpaqueBarrier = this._raycastQueue(cullingResults.opaqueQueue, barrier, true, Number.MAX_VALUE);
    const hasBarrier =
      this._raycastQueue(
        cullingResults.alphaTestQueue,
        barrier,
        true,
        hasOpaqueBarrier ? barrier.distance : Number.MAX_VALUE
      ) || hasOpaqueBarrier;

    // Transparent content is painted last, so the first hit that passes the depth test is the visible one
    if (
      this._raycastQueue(
        cullingResults.transparentQueue,
        hitResult,
        false,
        hasBarrier ? barrier.distance : Number.MAX_VALUE
      )
    ) {
      return true;
    }
    if (hasBarrier) {
      this._copyHitResult(barrier, hitResult);
      return true;
    }
    return false;
  }

  /**
   * Read one queue in painted order and raycast the elements of its batch leaders.
   *
   * @param out - receives the accepted hit
   * @param nearestOnly - keep the nearest accepted hit and read the whole queue, instead of accepting the
   * first one that passes and stopping there
   * @param maxDistance - hits at or beyond this depth are rejected, which mirrors the `Less` depth test
   * @returns true when `out` holds a hit to use
   */
  private _raycastQueue(queue: RenderedQueue, out: UIHitResult, nearestOnly: boolean, maxDistance: number): boolean {
    const scan = this._scan;
    scan.hitResult = out;
    scan.nearestOnly = nearestOnly;
    scan.maxDistance = maxDistance;
    scan.accepted = false;

    const leaders = queue.batchedElements;
    for (let i = leaders.length - 1; i >= 0; i--) {
      const leader = leaders[i];
      const canvas = this._resolveRenderedCanvas(leader);
      if (canvas && this._readCanvasElements(leader, canvas)) {
        return true;
      }
    }
    return scan.accepted;
  }

  /**
   * Resolve the canvas a queue entry belongs to.
   *
   * The queue is one pass old, so the entry can have been destroyed, deactivated or reassigned to another
   * camera since it was written: only a canvas this camera still draws is a candidate.
   */
  private _resolveRenderedCanvas(leader: RenderElement): UICanvas {
    const leaderComponent = leader.component;
    if (!(leaderComponent instanceof UIRenderer) || leaderComponent.destroyed) return null;
    const canvas = leaderComponent._getRootCanvas();
    if (
      !canvas ||
      canvas.destroyed ||
      !canvas.entity.isActiveInHierarchy ||
      !canvas._canDispatchEvent(this._scan.camera)
    ) {
      return null;
    }
    return canvas;
  }

  /**
   * Read the elements of one queue entry.
   *
   * A canvas hands its batch leaders to the queue in its own element order, so its prepared element list is
   * read backwards with a per canvas cursor: one leader run per queue entry, without any lookup. That list
   * belongs to the pass which prepared it last while a canvas shared by several cameras is prepared once
   * per camera, so the leader is verified before trusting the order. Whenever the flat order cannot
   * describe this queue, the canvas is tested as a whole instead: coarse order, but no content is dropped.
   *
   * @returns true when the scan has to stop, because the first accepted hit was taken
   */
  private _readCanvasElements(leader: RenderElement, canvas: UICanvas): boolean {
    const scan = this._scan;
    const cursors = scan.cursors;
    const renderedElements = canvas._renderElements;
    const canvasId = canvas.instanceId;
    let cursor = cursors.get(canvasId);

    if (cursor === undefined) {
      // The prepared list has to be the one of this queue, otherwise another camera replaced it
      if (renderedElements.indexOf(leader) < 0) {
        return this._raycastWholeCanvas(canvas);
      }
      cursor = renderedElements.length;
    } else if (cursor === UIPointerEventEmitter._WHOLE_CANVAS) {
      return this._raycastWholeCanvas(canvas);
    }

    while (cursor > 0) {
      const element = renderedElements[cursor - 1];
      // @ts-ignore `_isBatched` is @internal: another leader means the elements of this canvas are not
      // ordered by this queue, so the flat order must not be trusted any further
      if (element !== leader && element._isBatched) {
        return this._raycastWholeCanvas(canvas);
      }
      cursor--;
      const component = element.component;
      if (
        component instanceof UIRenderer &&
        this._isLiveRenderer(component) &&
        component._raycast(scan.ray, this._scratchHitResult, scan.camera.farClipPlane) &&
        this._scratchHitResult.distance < scan.maxDistance
      ) {
        if (this._acceptHit()) return true;
      }
      if (element === leader) break;
    }
    cursors.set(canvasId, cursor);
    return false;
  }

  /**
   * Raycast a canvas as a whole, for entries whose prepared element list cannot describe the queue.
   *
   * @returns true when the scan has to stop, because the first accepted hit was taken
   */
  private _raycastWholeCanvas(canvas: UICanvas): boolean {
    const scan = this._scan;
    const { camera, ray } = scan;
    scan.cursors.set(canvas.instanceId, UIPointerEventEmitter._WHOLE_CANVAS);
    const scratch = this._scratchHitResult;
    if (canvas._raycast(ray, scratch, camera.farClipPlane, camera.cullingMask) && scratch.distance < scan.maxDistance) {
      return this._acceptHit();
    }
    return false;
  }

  /**
   * Whether a renderer of the prepared list is still a candidate.
   *
   * The list is one pass old: the renderer can be destroyed, disabled or deactivated since, and it must not
   * be hit outside the layers this camera draws.
   */
  private _isLiveRenderer(component: UIRenderer): boolean {
    const camera = this._scan.camera;
    return (
      component.enabled &&
      component.raycastEnabled &&
      !component.destroyed &&
      component.entity.isActiveInHierarchy &&
      (camera.cullingMask & component.entity.layer) !== 0
    );
  }

  /**
   * Apply the scan mode to a hit just written into the scratch result.
   *
   * @returns true when the scan has to stop, which happens when the first accepted hit was taken rather
   * than the nearest one
   */
  private _acceptHit(): boolean {
    const scan = this._scan;
    if (scan.nearestOnly) {
      if (!scan.accepted || this._scratchHitResult.distance < scan.hitResult.distance) {
        this._copyHitResult(this._scratchHitResult, scan.hitResult);
      }
      scan.accepted = true;
      return false;
    }
    this._copyHitResult(this._scratchHitResult, scan.hitResult);
    scan.accepted = true;
    return true;
  }

  private _copyHitResult(source: UIHitResult, target: UIHitResult): void {
    target.entity = source.entity;
    target.distance = source.distance;
    target.point.copyFrom(source.point);
    target.normal.copyFrom(source.normal);
    target.component = source.component;
  }

  override processDrag(pointer: Pointer): void {
    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireDrag);
    }
  }

  override processDown(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    const pressedPath = this._pressedPath;
    const draggedPath = this._draggedPath;
    const length = (draggedPath.length = pressedPath.length = enteredPath.length);
    if (length > 0) {
      for (let i = 0; i < length; i++) {
        pressedPath[i] = draggedPath[i] = enteredPath[i];
      }
      this._bubble(pressedPath, pointer, this._fireDown);
      this._bubble(draggedPath, pointer, this._fireBeginDrag);
    }
  }

  override processUp(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    const pressedPath = this._pressedPath;
    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireUp);
      if (pressedPath.length > 0) {
        const common = UIPointerEventEmitter._tempArray0;
        if (this._findCommonInPath(enteredPath, pressedPath, common)) {
          const eventData = this._createEventData(pointer);
          for (let i = 0, n = common.length; i < n; i++) {
            this._fireClick(common[i], eventData);
          }
          common.length = 0;
        }
      }
    }

    pressedPath.length = 0;

    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireEndDrag);
      draggedPath.length = 0;
    }

    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireDrop);
    }
  }

  override processLeave(pointer: Pointer): void {
    const enteredPath = this._enteredPath;
    if (enteredPath.length > 0) {
      this._bubble(enteredPath, pointer, this._fireExit);
      enteredPath.length = 0;
    }

    const draggedPath = this._draggedPath;
    if (draggedPath.length > 0) {
      this._bubble(draggedPath, pointer, this._fireEndDrag);
      draggedPath.length = 0;
    }

    this._pressedPath.length = 0;
  }

  override dispose(): void {
    this._enteredPath.length = this._pressedPath.length = this._draggedPath.length = 0;
  }

  private _updateRaycast(element: UIRenderer, pointer: Pointer = null): void {
    const enteredPath = this._enteredPath;
    const curPath = this._composedPath(element, UIPointerEventEmitter._path);
    const add = UIPointerEventEmitter._tempArray0;
    const del = UIPointerEventEmitter._tempArray1;
    if (this._findDiffInPath(enteredPath, curPath, add, del)) {
      const eventData = this._createEventData(pointer);
      for (let i = 0, n = add.length; i < n; i++) {
        this._fireEnter(add[i], eventData);
      }
      for (let i = 0, n = del.length; i < n; i++) {
        this._fireExit(del[i], eventData);
      }

      const length = (enteredPath.length = curPath.length);
      for (let i = 0; i < length; i++) {
        enteredPath[i] = curPath[i];
      }
      add.length = del.length = 0;
    }
    curPath.length = 0;
  }

  private _composedPath(element: UIRenderer, path: Entity[]): Entity[] {
    if (!element) {
      path.length = 0;
      return path;
    }
    let entity = (path[0] = element.entity);
    let i = 1;
    const rootEntity = element._getRootCanvas().entity;
    for (; i < UIPointerEventEmitter._MAX_PATH_DEPTH && !!entity && entity !== rootEntity; i++) {
      entity = path[i] = entity.parent;
    }
    path.length = i;
    return path;
  }

  private _findCommonInPath(prePath: Entity[], curPath: Entity[], common: Entity[]): boolean {
    const idSet = UIPointerEventEmitter._tempSet;
    idSet.clear();
    for (let i = 0, n = prePath.length; i < n; i++) {
      idSet.add(prePath[i].instanceId);
    }
    let hasCommon = false;
    for (let i = 0, n = curPath.length; i < n; i++) {
      const entity = curPath[i];
      if (idSet.has(entity.instanceId)) {
        common.push(entity);
        hasCommon = true;
      }
    }
    return hasCommon;
  }

  private _findDiffInPath(prePath: Entity[], curPath: Entity[], add: Entity[], del: Entity[]): boolean {
    const idSet = UIPointerEventEmitter._tempSet;
    idSet.clear();
    let changed = false;
    for (let i = 0, n = prePath.length; i < n; i++) {
      idSet.add(prePath[i].instanceId);
    }
    for (let i = 0, n = curPath.length; i < n; i++) {
      const entity = curPath[i];
      if (!idSet.has(entity.instanceId)) {
        add.push(entity);
        changed = true;
      }
    }
    idSet.clear();
    for (let i = 0, n = curPath.length; i < n; i++) {
      idSet.add(curPath[i].instanceId);
    }
    for (let i = 0, n = prePath.length; i < n; i++) {
      const entity = prePath[i];
      if (!idSet.has(entity.instanceId)) {
        del.push(entity);
        changed = true;
      }
    }
    return changed;
  }

  private _bubble(path: Entity[], pointer: Pointer, fireEvent: FireEvent): void {
    const length = path.length;
    if (length <= 0) return;
    const eventData = this._createEventData(pointer);
    for (let i = 0; i < length; i++) {
      fireEvent(path[i], eventData);
    }
  }
}

type FireEvent = (entity: Entity, eventData: PointerEventData) => void;
