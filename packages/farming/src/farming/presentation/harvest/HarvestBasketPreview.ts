import type { Entity } from "@galacean/engine";
import { HarvestBasketPresenter } from "./HarvestBasketPresenter";

/** Explicit animation showcase; product baskets use FarmItemPresentation and persistent contents. */
export class HarvestBasketPreview {
  readonly id = "harvest";
  playing = false;
  loop = false;
  speed = 1;
  elapsed = 0;
  lifecycle = false;
  live = false;
  private next = 0;
  private serial = 0;
  constructor(readonly basket: HarvestBasketPresenter) {}
  get ready(): boolean {
    return this.basket.ready;
  }
  get entity(): Entity {
    return this.basket.root;
  }
  get duration(): number {
    return this.lifecycle ? 68 : 14.2;
  }
  async select(): Promise<boolean> {
    await this.basket.prepare();
    this.seek(0);
    return this.ready;
  }
  private get events(): [number, string][] {
    return this.lifecycle
      ? [
          [0, "show"],
          [0, "tomato"],
          [3, "carrot"],
          [65, "show"],
          [67.45, "hide"]
        ]
      : [
          [0, "show"],
          [0, "tomato"],
          [2, "carrot"],
          [3.05, "potato"],
          [4.15, "grapevine"],
          [5.25, "cabbage"],
          [6.35, "watermelon"],
          [7.45, "wheat"],
          [8.55, "sunflower"],
          [9.6, "pumpkin"],
          [11.4, "hide"],
          [12.15, "show"],
          [13.65, "hide"]
        ];
  }
  seek(seconds: number): void {
    this.live = false;
    this.elapsed = 0;
    this.next = 0;
    this.basket.reset();
    this.advance(Math.max(0, Math.min(this.duration, seconds)));
  }
  private advance(target: number): void {
    const events = this.events;
    while (this.next < events.length && events[this.next][0] <= target) {
      const [at, kind] = events[this.next++];
      this.basket.update(at - this.elapsed);
      this.elapsed = at;
      if (kind === "hide") this.basket.hide();
      else if (kind === "show") this.basket.show();
      else
        this.basket.receive({
          cropId: kind,
          itemId: kind,
          quantity: kind === "potato" ? 3 : 1,
          eventId: `preview-${this.next}`
        });
    }
    this.basket.update(target - this.elapsed);
    this.elapsed = target;
  }
  play(): void {
    if (this.elapsed >= this.duration && !this.live) this.seek(0);
    this.playing = true;
  }
  update(dt: number): boolean {
    if (!this.playing || !this.ready) return false;
    const next = this.elapsed + dt * this.speed;
    if (this.live) {
      this.basket.update(dt * this.speed);
      this.elapsed = next;
      return false;
    }
    if (next >= this.duration) {
      if (this.loop) {
        this.seek(next % this.duration);
        return true;
      }
      this.advance(this.duration);
      this.playing = false;
    } else this.advance(next);
    return false;
  }
  receive(cropId: string, quantity: number): void {
    this.live = true;
    this.playing = true;
    this.basket.show();
    this.basket.receive({ cropId, itemId: cropId, quantity, eventId: `manual-${++this.serial}` });
  }
  show(): void {
    this.live = true;
    this.playing = true;
    this.basket.show();
  }
  hide(): void {
    this.live = true;
    this.playing = true;
    this.basket.hide();
  }
  dispose(): void {
    this.basket.dispose();
  }
}
