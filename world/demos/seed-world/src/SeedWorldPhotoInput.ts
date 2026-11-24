import { Color, Script, type Entity, type PointerEventData, type Scene } from "@galacean/engine";
import { CanvasRenderMode, Image, ResolutionAdaptationMode, UICanvas, UITransform } from "@galacean/engine-ui";

export type PhotoPointerPhase = "begin" | "move" | "end";
type Handler = (phase: PhotoPointerPhase, event: PointerEventData) => void;

class PhotoPointerInput extends Script {
  handle?: Handler;
  override onPointerBeginDrag(event: PointerEventData): void {
    this.handle?.("begin", event);
  }
  override onPointerDrag(event: PointerEventData): void {
    this.handle?.("move", event);
  }
  override onPointerEndDrag(event: PointerEventData): void {
    this.handle?.("end", event);
  }
}

/** Engine UI owns the gesture from BeginDrag through EndDrag, even outside the original photo. */
export class SeedWorldPhotoInput {
  private readonly root: Entity;
  private readonly canvas: UICanvas;
  private readonly modal: Entity;
  private readonly badge: Entity;
  private readonly photos = new Map<string, Entity>();
  private width = 1;
  private height = 1;

  constructor(
    scene: Scene,
    private readonly handle: Handler
  ) {
    this.root = scene.createRootEntity("Photo input");
    this.canvas = this.root.addComponent(UICanvas);
    this.canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    this.canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    this.canvas.sortOrder = 32_500;
    this.modal = this.surface("Photo modal input");
    this.modal.isActive = false;
    this.badge = this.surface("Markup badge input");
    this.badge.isActive = false;
  }
  private surface(name: string): Entity {
    const entity = this.root.createChild(name);
    const image = entity.addComponent(Image);
    image.color = new Color(1, 1, 1, 0);
    entity.addComponent(PhotoPointerInput).handle = this.handle;
    return entity;
  }
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.referenceResolution.set(width, height);
    (this.modal.transform as UITransform).size.set(width, height);
  }
  setModal(active: boolean): void {
    this.modal.isActive = active;
    if (active) this.badge.isActive = false;
  }
  setBadge(rect: { x: number; y: number; width: number; height: number }, visible: boolean): void {
    this.badge.isActive = visible && !this.modal.isActive;
    if (!this.badge.isActive) return;
    const transform = this.badge.transform as UITransform;
    transform.size.set(rect.width, rect.height);
    transform.setPosition(rect.x - this.width / 2, this.height / 2 - rect.y, 0);
  }
  setPhoto(
    id: string,
    pose: { x: number; y: number; width: number; height: number; angle: number },
    visible: boolean
  ): void {
    let entity = this.photos.get(id);
    if (!entity) {
      entity = this.surface("Photo input " + id);
      this.photos.set(id, entity);
    }
    // During editing/animation the whole canvas owns input, including margins and toolbar.
    entity.isActive = visible && !this.modal.isActive;
    const transform = entity.transform as UITransform;
    // Slight invisible touch slop makes tapping and grabbing the compact mini card effortless on mobile.
    transform.size.set(pose.width + 20, pose.height + 20);
    transform.setPosition(pose.x - this.width / 2, this.height / 2 - pose.y, 0);
    transform.setRotation(0, 0, -pose.angle);
  }
  remove(id: string): void {
    this.photos.get(id)?.destroy();
    this.photos.delete(id);
  }
  dispose(): void {
    this.root.destroy();
  }
}
