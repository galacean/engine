export const TURN_DISMISS_DISTANCE = 112;
const TURN_DRAG_DISTANCE = 8;

/** Lock intent once the gesture is deliberate; overflowing body text retains vertical scrolling. */
export function turnDragIntent(scrollableBody: boolean, x: number, y: number): "scroll" | "throw" | undefined {
  if (Math.hypot(x, y) < TURN_DRAG_DISTANCE) return;
  if (scrollableBody && Math.hypot(x, y) < 20 && Math.max(Math.abs(x), Math.abs(y)) < Math.min(Math.abs(x), Math.abs(y)) * 1.25) return;
  return scrollableBody && Math.abs(y) >= Math.abs(x) ? "scroll" : "throw";
}

/** Distances are HUD units, independent of screen density. */
export class SeedWorldTurnGesture {
  private _press?: { id: number; x: number; y: number; dragged: boolean };
  private _samples: { x: number; y: number; time: number }[] = [];
  x = 0;
  y = 0;

  begin(id: number, x: number, y: number, time = performance.now()): boolean {
    if (this._press) return false;
    this._press = { id, x, y, dragged: false };
    this.x = this.y = 0;
    this._samples = [{ x: 0, y: 0, time }];
    return true;
  }

  move(id: number, x: number, y: number, time = performance.now()): boolean {
    const press = this._press;
    if (!press || press.id !== id) return false;
    this.x = x - press.x;
    this.y = y - press.y;
    const last = this._samples.at(-1)!;
    if (time > last.time) this._samples.push({ x: this.x, y: this.y, time });
    else { last.x = this.x; last.y = this.y; }
    while (this._samples.length > 2 && this._samples[1].time < time - 100) this._samples.shift();
    if (Math.hypot(this.x, this.y) >= TURN_DRAG_DISTANCE) press.dragged = true;
    return press.dragged;
  }

  finish(id: number, cancelled = false): "click" | "dismiss" | "return" | undefined {
    const press = this._press;
    if (!press || press.id !== id) return;
    this._press = undefined;
    if (cancelled) return "return";
    if (!press.dragged) return "click";
    return Math.hypot(this.x, this.y) >= TURN_DISMISS_DISTANCE ? "dismiss" : "return";
  }

  /** Last 100 ms, including stationary samples, so a held release has no stale fling. */
  velocity(time = performance.now()): { x: number; y: number } {
    const last = this._samples.at(-1);
    const first = this._samples.find(sample => sample.time >= time - 100);
    if (!first || !last || time - last.time > 80 || last.time - first.time < 8) return { x: 0, y: 0 };
    const seconds = (last.time - first.time) / 1000;
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  }

  owns(id: number): boolean { return this._press?.id === id; }

  cancel(): void { this._press = undefined; }
}


/** Translation needed to keep the grabbed local point fixed while scaling/rotating. */
export function turnAnchorOffset(x: number, y: number, scale: number, degrees: number): { x: number; y: number } {
  const angle = degrees * Math.PI / 180;
  return { x: x - scale * (x * Math.cos(angle) - y * Math.sin(angle)),
    y: y - scale * (x * Math.sin(angle) + y * Math.cos(angle)) };
}

export function turnThrow(x: number, y: number, velocity: { x: number; y: number }): { x: number; y: number; duration: number } {
  const speed = Math.hypot(velocity.x, velocity.y);
  const direction = speed > 60 ? velocity : { x, y };
  const length = Math.max(Math.hypot(direction.x, direction.y), 1);
  const distance = 180 + Math.min(speed * 0.16, 460);
  return { x: x + direction.x / length * distance, y: y + direction.y / length * distance,
    duration: 0.3 - Math.min(speed / 4000, 1) * 0.1 };
}
