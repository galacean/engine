/** Pixel-continuous reading, independent of the panel's dismiss gesture. HUD units / seconds. */
export class SeedWorldTranscriptScroll {
  offset = 0;
  maximum = 0;
  velocity = 0;
  private _pressed = false;
  private _raw = 0;
  private _samples: { offset: number; time: number }[] = [];
  get moving(): boolean { return Math.abs(this.velocity) > 1 || this.offset < 0 || this.offset > this.maximum; }

  setMaximum(value: number): void {
    const maximum = Math.max(0, value);
    if (maximum === this.maximum) return;
    const previousMaximum = this.maximum;
    this.maximum = maximum;
    // Progress changes content size, not the owner of the current gesture.
    // Released motion keeps its velocity and settles against the new bounds.
    if (!this._pressed) return;
    if (maximum < previousMaximum && this.offset > maximum) {
      const shift = maximum - this.offset;
      this.offset = maximum;
      // A layout correction is not pointer movement; exclude it from fling speed.
      for (const sample of this._samples) sample.offset += shift;
    }
    this._syncRawOffset();
  }
  reset(): void { this.offset = 0; this.cancel(); }
  cancel(): void {
    this._pressed = false;
    this.velocity = 0;
    this.offset = Math.max(0, Math.min(this.maximum, this.offset));
    this._samples = [];
  }
  begin(time = performance.now()): boolean {
    const moving = this.moving;
    this._pressed = true;
    this.velocity = 0;
    this._syncRawOffset();
    this._samples = [{ offset: this.offset, time }];
    return moving;
  }
  private _syncRawOffset(): void {
    // Invert the rubber band so a new press or changed boundary does not jump.
    const edge = Math.max(0, Math.min(this.maximum, this.offset));
    const over = this.offset - edge;
    this._raw = edge + over / Math.max(0.01, 0.5 - Math.abs(over) / 120);
  }
  drag(delta: number, time = performance.now()): void {
    if (!this._pressed || !this.maximum) return;
    this._raw += delta;
    const edge = Math.max(0, Math.min(this.maximum, this._raw));
    const over = this._raw - edge;
    this.offset = edge + over * 0.5 / (1 + Math.abs(over) / 120);
    this._samples.push({ offset: this.offset, time });
    while (this._samples.length > 2 && this._samples[1].time < time - 100) this._samples.shift();
  }
  release(cancelled = false, time = performance.now()): void {
    this._pressed = false;
    const first = this._samples.find(s => s.time >= time - 100);
    const last = this._samples.at(-1);
    this.velocity = !cancelled && first && last && time - last.time < 80 && last.time - first.time >= 8
      ? Math.max(-2200, Math.min(2200, (last.offset - first.offset) * 1000 / (last.time - first.time))) : 0;
    this._samples = [];
  }
  wheel(delta: number): void {
    this.cancel();
    this.offset = Math.max(0, Math.min(this.maximum, this.offset + delta));
  }
  update(seconds: number): void {
    if (this._pressed || !Number.isFinite(seconds)) return;
    // Small substeps keep edge crossings stable even on slow frames.
    let remaining = Math.max(0, Math.min(seconds, 0.1));
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      remaining -= dt;
      const edge = Math.max(0, Math.min(this.maximum, this.offset));
      if (this.offset !== edge) {
        const displacement = this.offset - edge;
        const c = this.velocity + 18 * displacement;
        const decay = Math.exp(-18 * dt);
        this.offset = edge + (displacement + c * dt) * decay;
        this.velocity = (this.velocity - 18 * c * dt) * decay;
        if (Math.abs(this.offset - edge) < 0.1 && Math.abs(this.velocity) < 1) {
          this.offset = edge;
          this.velocity = 0;
        }
      } else {
        const decay = Math.exp(-5 * dt);
        this.offset += this.velocity * (1 - decay) / 5;
        this.velocity *= decay;
        if (Math.abs(this.velocity) < 1) this.velocity = 0;
      }
    }
  }
}
