/** Explicit animation-preview state. Product inventory is read from FarmSnapshot.items. */
export interface HarvestBasketInput {
  readonly cropId: string;
  readonly itemId: string;
  readonly quantity: number;
  /** Stable preview event identity; duplicate input cannot add representatives. */
  readonly eventId: string;
}
export interface BasketBatch extends HarvestBasketInput {
  readonly slot: number;
  readonly revealAt: number;
}
export class HarvestBasketState {
  readonly batches: BasketBatch[] = [];
  time = 0;
  amount = 0;
  target = false;
  private nextSlot = 0;
  private readonly seen = new Set<string>();
  show(): void {
    this.target = true;
  }
  hide(): void {
    this.target = false;
  }
  receive(input: HarvestBasketInput): boolean {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0 || this.seen.has(input.eventId)) return false;
    this.seen.add(input.eventId);
    // A bounded receipt window mirrors the farming service's retained receipts.
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    if (this.batches.reduce((n, batch) => n + batch.quantity, 0) + input.quantity > 20) return false;
    const slot = this.nextSlot++;
    this.batches.push({ ...input, slot, revealAt: this.time + (1 - this.amount) * 0.6 });
    return true;
  }
  update(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.time += seconds;
    this.amount = this.target ? Math.min(1, this.amount + seconds / 0.6) : Math.max(0, this.amount - seconds / 0.45);
  }
  get phase(): "hidden" | "showing" | "held" | "hiding" {
    return this.target ? (this.amount < 1 ? "showing" : "held") : this.amount > 0 ? "hiding" : "hidden";
  }
  reset(): void {
    this.batches.length = 0;
    this.seen.clear();
    this.time = this.amount = this.nextSlot = 0;
    this.target = false;
  }
}
