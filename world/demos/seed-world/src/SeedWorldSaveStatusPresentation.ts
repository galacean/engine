import type { SeedWorldSaveStatus } from "@galacean/engine-world-planning/world/SeedWorldSaveScheduler";

/** Presentation timing only; never delays storage or changes dirty state. */
export class SeedWorldSaveStatusPresentation {
  status: SeedWorldSaveStatus = "saved";
  private _time = 0;
  private _shownAt = 0;
  private _active = false;
  private _terminal: "saved" | "save-error" | undefined;

  setStatus(status: SeedWorldSaveStatus): void {
    if (status === "pending" || status === "saving") {
      // Dirty edits hide any old result; only an actual write reveals the label.
      this._active = status === "saving";
      this._terminal = undefined;
      this.status = status;
      this._shownAt = this._time;
    } else if (this._active) {
      // localStorage may finish within one frame. Keep “saving” visible briefly.
      if (this.status === "saving" && this._time - this._shownAt < 0.3) this._terminal = status;
      else { this.status = status; this._shownAt = this._time; }
    }
  }

  update(deltaSeconds: number): void {
    this._time += Math.max(0, deltaSeconds);
    if (this._terminal && this._time - this._shownAt >= 0.3) {
      this.status = this._terminal;
      this._terminal = undefined;
      this._shownAt += 0.3;
    }
  }

  get opacity(): number {
    if (!this._active) return 0;
    if (this.status === "saving") return 1;
    return Math.max(0, 1 - Math.max(0, this._time - this._shownAt - 2) / 0.6);
  }
}
