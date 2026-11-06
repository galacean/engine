/** Stable, host-independent interaction identities. The owning domain persists instances. */
export interface WorldItem<Type extends string = string> {
  readonly id: string;
  readonly type: Type;
  readonly groundId: string;
  readonly position: readonly [number, number, number];
}

export interface ItemCapability<Action extends string = string> {
  readonly action: Action;
  readonly side: "left" | "right";
  readonly portable: boolean;
}

/** One pointer, cumulative CSS movement. Crossing the threshold can never become a tap again. */
export class ItemTapGesture {
  private pointers = new Set<number>();
  private candidate?: {
    id: number;
    x: number;
    y: number;
    distance: number;
    rejected: boolean;
  };
  begin(id: number, x: number, y: number): void {
    this.pointers.add(id);
    if (this.pointers.size === 1) this.candidate = { id, x, y, distance: 0, rejected: false };
    else if (this.candidate) this.candidate.rejected = true;
  }
  move(id: number, x: number, y: number): void {
    const p = this.candidate;
    if (!p || p.id !== id) return;
    p.distance += Math.hypot(x - p.x, y - p.y);
    p.x = x;
    p.y = y;
    p.rejected ||= p.distance > 10;
  }
  end(id: number, x: number, y: number): boolean {
    this.move(id, x, y);
    const tap = this.pointers.size === 1 && this.candidate?.id === id && !this.candidate.rejected;
    this.pointers.delete(id);
    if (this.candidate?.id === id) this.candidate = undefined;
    return tap;
  }
  cancel(): void {
    this.pointers.clear();
    this.candidate = undefined;
  }
}
