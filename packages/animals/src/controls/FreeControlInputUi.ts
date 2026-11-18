import { Camera, Color, type Entity, PointerButton, type PointerEventData, Script } from "@galacean/engine";
import {
  CanvasRenderMode,
  HorizontalAlignmentMode,
  Image,
  ResolutionAdaptationMode,
  UICanvas,
  UITransform,
  VerticalAlignmentMode
} from "@galacean/engine-ui";

// World navigation is the fallback input surface. Product UI must win the
// raycast before a pointer can become a movement or rotation drag.
const WORLD_CONTROL_INPUT_SORT_ORDER = -32_000;

export interface FreeControlPointerInputTarget {
  onWorldPointerClick?: () => void;
  handlePointerBeginDrag(pointerId: number, screenX: number, screenY: number): void;
  handlePointerDrag(pointerId: number, screenX: number, screenY: number): void;
  handlePointerEndDrag(pointerId: number): void;
}

class FreeControlPointerInput extends Script {
  target: FreeControlPointerInputTarget | undefined;

  override onPointerClick(eventData: PointerEventData): void {
    if (eventData.pointer.button === PointerButton.Primary) this.target?.onWorldPointerClick?.();
  }

  override onPointerBeginDrag(eventData: PointerEventData): void {
    const pointer = eventData.pointer;
    if (pointer.button !== PointerButton.Primary) return;
    this.target?.handlePointerBeginDrag(pointer.id, pointer.position.x, pointer.position.y);
  }

  override onPointerDrag(eventData: PointerEventData): void {
    const pointer = eventData.pointer;
    this.target?.handlePointerDrag(pointer.id, pointer.position.x, pointer.position.y);
  }

  override onPointerEndDrag(eventData: PointerEventData): void {
    this.target?.handlePointerEndDrag(eventData.pointer.id);
  }
}

/** Low-priority UI hit surface that routes InputManager drag ownership to FreeControl. */
export class FreeControlInputUi {
  private readonly _owner: Entity;
  private readonly _target: FreeControlPointerInputTarget;
  private _root: Entity | null = null;

  constructor(owner: Entity, target: FreeControlPointerInputTarget) {
    this._owner = owner;
    this._target = target;
  }

  mount(): void {
    if (this._root || !this._owner.scene) return;
    const inputCamera = this._owner.getComponent(Camera);
    if (!inputCamera) return;
    const root = (this._root = this._owner.scene.createRootEntity("World FreeControl Input"));
    const canvas = root.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
    canvas.camera = inputCamera;
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    canvas.sortOrder = WORLD_CONTROL_INPUT_SORT_ORDER;

    const surface = root.createChild("World navigation drag surface");
    const transform = surface.transform as UITransform;
    transform.horizontalAlignment = HorizontalAlignmentMode.LeftAndRight;
    transform.verticalAlignment = VerticalAlignmentMode.TopAndBottom;
    transform.alignLeft = 0;
    transform.alignRight = 0;
    transform.alignTop = 0;
    transform.alignBottom = 0;

    // A sprite is unnecessary for hit testing. Keeping the renderer transparent
    // makes this a pure input surface while allowing higher-sort UI to win.
    const hitTarget = surface.addComponent(Image);
    hitTarget.color = new Color(1, 1, 1, 0);
    hitTarget.raycastEnabled = true;
    surface.addComponent(FreeControlPointerInput).target = this._target;
  }

  setEnabled(enabled: boolean): void {
    if (enabled) this.mount();
    if (this._root) this._root.isActive = enabled;
  }

  destroy(): void {
    this._root?.destroy();
    this._root = null;
  }
}
