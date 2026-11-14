interface WorldClickInput { onWorldPointerClick?: () => void }

/** Native events measure cumulative CSS movement; engine UI grants world click ownership. */
class WorldClickInputBinding implements EventListenerObject {
  private readonly pointers = new Set<number>();
  private pointerId = -1;
  private x = 0;
  private y = 0;
  private distance = 0;
  private pending = false;
  private pendingX = 0;
  private pendingY = 0;
  private readonly clickBound = this.click.bind(this);
  readonly disposeBound = this.dispose.bind(this);
  constructor(private readonly canvas: HTMLCanvasElement, private readonly input: WorldClickInput,
    private readonly clickWorld: (x: number, y: number) => void) {
    input.onWorldPointerClick = this.clickBound;
    const document = canvas.ownerDocument;
    document.addEventListener("pointerdown", this, true);
    document.addEventListener("pointermove", this, true);
    document.addEventListener("pointerup", this, true);
    document.addEventListener("pointercancel", this, true);
    document.defaultView?.addEventListener("blur", this);
  }
  handleEvent(event: Event): void {
    switch (event.type) {
      case "pointerdown": this.down(event as PointerEvent); break;
      case "pointermove": this.move(event as PointerEvent); break;
      case "pointerup": this.up(event as PointerEvent); break;
      case "pointercancel": this.cancel(event as PointerEvent); break;
      case "blur": this.reset(); break;
    }
  }
  private click(): void {
    if (!this.pending) return;
    this.pending = false;
    this.clickWorld(this.pendingX, this.pendingY);
  }
  private down(event: PointerEvent): void {
    this.pending = false;
    this.pointers.add(event.pointerId);
    if (this.pointers.size > 1) { this.pointerId = -1; return; }
    if (event.target !== this.canvas || event.button !== 0 || !event.isPrimary) return;
    this.pointerId = event.pointerId; this.x = event.clientX; this.y = event.clientY; this.distance = 0;
  }
  private move(event: PointerEvent): void {
    if (this.pointerId !== event.pointerId) return;
    this.distance += Math.hypot(event.clientX - this.x, event.clientY - this.y);
    this.x = event.clientX; this.y = event.clientY;
  }
  private up(event: PointerEvent): void {
    this.move(event);
    this.pointers.delete(event.pointerId);
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = -1;
    if (this.distance > 10) return;
    // Query only on a click, so scrolling/layout changes cannot leave a stale hit origin.
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pendingX = (event.clientX - rect.left) * this.canvas.width / rect.width;
    this.pendingY = (event.clientY - rect.top) * this.canvas.height / rect.height;
    this.pending = true;
  }
  private cancel(event: PointerEvent): void {
    this.pending = false; this.pointers.delete(event.pointerId);
    if (this.pointerId === event.pointerId) this.pointerId = -1;
  }
  private reset(): void { this.pointerId = -1; this.pending = false; this.pointers.clear(); }
  private dispose(): void {
    if (this.input.onWorldPointerClick === this.clickBound) this.input.onWorldPointerClick = undefined;
    const document = this.canvas.ownerDocument;
    document.removeEventListener("pointerdown", this, true);
    document.removeEventListener("pointermove", this, true);
    document.removeEventListener("pointerup", this, true);
    document.removeEventListener("pointercancel", this, true);
    document.defaultView?.removeEventListener("blur", this);
    this.reset();
  }
}

export function bindWorldClickInput(canvas: HTMLCanvasElement, input: WorldClickInput, clickWorld: (x: number, y: number) => void): () => void {
  return new WorldClickInputBinding(canvas, input, clickWorld).disposeBound;
}
