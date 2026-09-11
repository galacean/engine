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

  private _enteredPath: Entity[] = [];
  private _pressedPath: Entity[] = [];
  private _draggedPath: Entity[] = [];
  /** Nearest hit of the depth writing passes, the depth the transparent pass is tested against. */
  private _barrierHitResult = new UIHitResult();
  /** Staging result of a single candidate, so a rejected hit cannot overwrite the accepted one. */
  private _scratchHitResult = new UIHitResult();

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
   * frame currently on screen. Elements of one canvas can be interleaved with another canvas' elements,
   * so the walk stays at element level: each batch leader is expanded back through the canvas' own
   * prepared element list, which is the per renderer draw order the canvas sorted and batched from.
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

    const cursors = UIPointerEventEmitter._elementCursors;
    const barrier = this._barrierHitResult;
    cursors.clear();

    const hasOpaqueBarrier = this._raycastQueue(
      cullingResults.opaqueQueue,
      camera,
      cursors,
      ray,
      barrier,
      true,
      Number.MAX_VALUE
    );
    const hasBarrier =
      this._raycastQueue(
        cullingResults.alphaTestQueue,
        camera,
        cursors,
        ray,
        barrier,
        true,
        hasOpaqueBarrier ? barrier.distance : Number.MAX_VALUE
      ) || hasOpaqueBarrier;

    // Transparent content is painted last, so the first hit that passes the depth test is the visible one
    if (
      this._raycastQueue(
        cullingResults.transparentQueue,
        camera,
        cursors,
        ray,
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
   * Read one queue in painted order and raycast its elements.
   *
   * @param nearestOnly - keep the nearest accepted hit and scan the whole queue, instead of accepting the
   * first one that passes and returning
   * @param maxDistance - hits at or beyond this depth are rejected, which mirrors the `Less` depth test
   */
  private _raycastQueue(
    queue: RenderedQueue,
    camera: Camera,
    cursors: Map<number, number>,
    ray: Ray,
    hitResult: UIHitResult,
    nearestOnly: boolean,
    maxDistance: number
  ): boolean {
    const farClipPlane = camera.farClipPlane;
    const cullingMask = camera.cullingMask;
    const scratch = this._scratchHitResult;
    let found = false;
    const leaders = queue.batchedElements;
    for (let i = leaders.length - 1; i >= 0; i--) {
      const leader = leaders[i];
      const leaderComponent = leader.component;
      if (!(leaderComponent instanceof UIRenderer) || leaderComponent.destroyed) continue;
      const canvas = leaderComponent._getRootCanvas();
      if (!canvas || canvas.destroyed || !canvas.entity.isActiveInHierarchy || !canvas._canDispatchEvent(camera)) {
        continue;
      }

      // A canvas hands its batch leaders to the queue in its own element order, so reading its prepared
      // elements backwards with a cursor consumes one leader run per queue entry without any lookup.
      // That list belongs to the pass which prepared it last, and a canvas shared by several cameras is
      // prepared once per camera, so the leader is verified once per canvas before trusting the order.
      const renderedElements = canvas._renderElements;
      const canvasId = canvas.instanceId;
      let cursor = cursors.get(canvasId);
      if (cursor === undefined) {
        if (renderedElements.indexOf(leader) < 0) {
          // These queue elements were not prepared from the list at hand: test the canvas as a whole,
          // which keeps the canvas order taken from the queue and the previous within-canvas order
          cursors.set(canvasId, -1);
          if (canvas._raycast(ray, scratch, farClipPlane, cullingMask) && scratch.distance < maxDistance) {
            if (this._acceptHit(hitResult, nearestOnly, found)) return true;
            found = true;
          }
          continue;
        }
        cursor = renderedElements.length;
      } else if (cursor < 0) {
        if (canvas._raycast(ray, scratch, farClipPlane, cullingMask) && scratch.distance < maxDistance) {
          if (this._acceptHit(hitResult, nearestOnly, found)) return true;
          found = true;
        }
        continue;
      }
      while (cursor > 0) {
        const element = renderedElements[cursor - 1];
        // @ts-ignore `_isBatched` is @internal: another leader means another run comes first
        if (element !== leader && element._isBatched) {
          // Elements of one canvas can land in different queues (the queue of a material overrides the
          // canvas element order), so the flat order may not describe this queue: test the canvas as a
          // whole instead of dropping the content that has not been reached yet
          cursor = -1;
          break;
        }
        cursor--;
        const component = element.component;
        if (
          component instanceof UIRenderer &&
          component.enabled &&
          component.raycastEnabled &&
          !component.destroyed &&
          component.entity.isActiveInHierarchy &&
          (cullingMask & component.entity.layer) !== 0 &&
          component._raycast(ray, scratch, farClipPlane) &&
          scratch.distance < maxDistance
        ) {
          if (this._acceptHit(hitResult, nearestOnly, found)) return true;
          found = true;
        }
        if (element === leader) break;
      }
      if (cursor < 0) {
        cursors.set(canvasId, -1);
        if (canvas._raycast(ray, scratch, farClipPlane, cullingMask) && scratch.distance < maxDistance) {
          if (this._acceptHit(hitResult, nearestOnly, found)) return true;
          found = true;
        }
        continue;
      }
      cursors.set(canvasId, cursor);
    }
    return found;
  }

  /**
   * Apply the scan mode to a hit just written into the scratch result.
   *
   * @returns true when the caller has to stop scanning, which happens when the first accepted hit was
   * taken rather than the nearest one
   */
  private _acceptHit(hitResult: UIHitResult, nearestOnly: boolean, found: boolean): boolean {
    if (nearestOnly) {
      if (!found || this._scratchHitResult.distance < hitResult.distance) {
        this._copyHitResult(this._scratchHitResult, hitResult);
      }
      return false;
    }
    this._copyHitResult(this._scratchHitResult, hitResult);
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
