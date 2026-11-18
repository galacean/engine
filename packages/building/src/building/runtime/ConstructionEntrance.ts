/** Presentation state belongs to stable author identities, never GPU residency.
 * Preparing a replacement does not advance or restart the accepted timeline. */
export interface ConstructionEntranceState {
  progress: number;
  minimumY: number;
  height: number;
}
export const CONSTRUCTION_ENTRANCE_SECONDS = 2.4;
export class ConstructionEntrance {
  readonly changed = new Set<string>();
  readonly states = new Map<string, ConstructionEntranceState>();
  private readonly newlyAccepted = new Set<string>();
  private playing = false;
  private armed = false;
  /** Publish current geometry bounds without restarting the owner’s accepted clock. */
  define(owner: string, minimumY: number, maximumY: number) {
    if (![minimumY, maximumY].every(Number.isFinite) || maximumY < minimumY)
      throw Error("Invalid construction entrance interval");
    const state = this.states.get(owner);
    const height = Math.max(0.001, maximumY - minimumY);
    if (state) {
      state.minimumY = minimumY;
      state.height = height;
    } else this.states.set(owner, { progress: 1, minimumY, height });
  }
  /** Append accepted Scene geometry. Existing owners retain their clock, even
   * when regrouping or replacing GPU resources. New owners skip their first
   * frame independently, so accepting one cannot pause the others. */
  accept(owner: string, minimumY: number, maximumY: number, play: boolean) {
    const existed = this.states.has(owner);
    this.define(owner, minimumY, maximumY);
    if (existed) return;
    this.states.get(owner)!.progress = 0;
    this.newlyAccepted.add(owner);
    if (play && !this.playing) {
      this.playing = true;
      this.armed = true;
    }
  }
  remove(owner: string) {
    this.states.delete(owner);
    this.newlyAccepted.delete(owner);
    this.changed.delete(owner);
  }
  /** Call only after publication accepts. Copy current progress at commit, not prepare. */
  publish(previous?: ConstructionEntrance) {
    this.newlyAccepted.clear();
    for (const [id, state] of this.states) {
      const old = previous?.states.get(id);
      if (old) state.progress = old.progress;
      else state.progress = 0;
    }
    this.playing = previous !== undefined;
    this.armed = false;
  }
  start() {
    this.playing = true;
    this.armed = false;
  }
  /** Explicit preview; ordinary edits and LOD replacement never call this. */
  replay(owners?: ReadonlySet<string>) {
    for (const [id, state] of this.states)
      if (!owners || owners.has(id)) {
        state.progress = 0;
        this.newlyAccepted.delete(id);
      }
    this.start();
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw Error("Invalid construction entrance frame time");
    this.changed.clear();
    if (!this.playing) return false;
    // The first frame delta may include compilation before publication.
    if (!this.armed) {
      this.armed = true;
      this.newlyAccepted.clear();
      return false;
    }
    let changed = false;
    let active = false;
    for (const [id, state] of this.states)
      if (state.progress < 1) {
        if (this.newlyAccepted.delete(id)) {
          active = true;
          continue;
        }
        const next = Math.min(1, state.progress + seconds / CONSTRUCTION_ENTRANCE_SECONDS);
        if (next !== state.progress) this.changed.add(id);
        changed ||= next !== state.progress;
        state.progress = next;
        active ||= next < 1;
      }
    this.playing = active;
    return changed;
  }
  get active() {
    for (const state of this.states.values()) if (state.progress < 1) return true;
    return false;
  }
}

/** Shared bounds extraction; preview parts already exist in both generation paths. */
export function constructionEntranceRanges(parts: readonly { owner: string; positions: readonly number[] }[]) {
  const ranges = new Map<string, { min: number; max: number }>();
  for (const part of parts) {
    if (!part.positions.length) continue;
    const range = ranges.get(part.owner) ?? { min: Infinity, max: -Infinity };
    for (let i = 1; i < part.positions.length; i += 3) {
      range.min = Math.min(range.min, part.positions[i]);
      range.max = Math.max(range.max, part.positions[i]);
    }
    ranges.set(part.owner, range);
  }
  return ranges;
}
