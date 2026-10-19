import type {
  ISpineAnimationState,
  ISpineAnimationStateListener,
  ISpineTrackEntry,
  ISpineSkeleton,
  ISpineEvent
} from "@galacean/engine-design";
import type { ISpineRuntime } from "./runtime/ISpineRuntime";
import type { SpineAnimationStateData } from "./SpineAnimationStateData";
import type { SpineAnimationStateListener, SpineEvent } from "./SpineAnimationStateListener";
import { SpineTrackEntry } from "./SpineTrackEntry";

type PlaybackEvent = "start" | "interrupt" | "end" | "dispose" | "complete";

/** Playback controls for one renderer. Entries and callback arguments have stable public identities. */
export class SpineAnimationState {
  readonly data: SpineAnimationStateData;
  private _entries = new WeakMap<ISpineTrackEntry, SpineTrackEntry>();
  private _listeners = new Set<SpineAnimationStateListener>();
  private _operationDepth = 0;
  private _disposed = false;

  private constructor(
    private _native: ISpineAnimationState,
    data: SpineAnimationStateData,
    private _runtime: ISpineRuntime
  ) {
    this.data = data;
    _native.addListener({
      start: (entry) => this._dispatch("start", entry),
      interrupt: (entry) => this._dispatch("interrupt", entry),
      end: (entry) => this._dispatch("end", entry),
      complete: (entry) => this._dispatch("complete", entry),
      dispose: (native) => {
        const entry = this._wrap(native);
        try {
          this._dispatch("dispose", native);
        } finally {
          entry._invalidate();
          this._entries.delete(native);
        }
      },
      event: (native, event) => {
        if (!this._listeners.size) return;
        const entry = this._wrap(native);
        const snapshot = this._event(event);
        for (const listener of Array.from(this._listeners)) listener.event?.(entry, snapshot);
      }
    });
  }
  /** @internal */
  static _create(
    native: ISpineAnimationState,
    data: SpineAnimationStateData,
    runtime: ISpineRuntime
  ): SpineAnimationState {
    return new SpineAnimationState(native, data, runtime);
  }

  get timeScale(): number {
    return this._native.timeScale;
  }
  set timeScale(value: number) {
    this._native.timeScale = value;
  }
  setAnimation(track: number, name: string, loop: boolean): SpineTrackEntry {
    return this._command(() => this._wrap(this._native.setAnimation(track, name, loop)));
  }
  addAnimation(track: number, name: string, loop: boolean, delay: number): SpineTrackEntry {
    return this._command(() => this._wrap(this._native.addAnimation(track, name, loop, delay)));
  }
  setEmptyAnimation(track: number, mixDuration: number): SpineTrackEntry {
    return this._command(() => this._wrap(this._native.setEmptyAnimation(track, mixDuration)));
  }
  addEmptyAnimation(track: number, mixDuration: number, delay: number): SpineTrackEntry {
    return this._command(() => this._wrap(this._native.addEmptyAnimation(track, mixDuration, delay)));
  }
  setEmptyAnimations(mixDuration: number): void {
    this._command(() => this._native.setEmptyAnimations(mixDuration));
  }
  getCurrent(track: number): SpineTrackEntry | null {
    return this._wrap(this._native.getCurrent(track));
  }
  clearTrack(track: number): void {
    this._command(() => this._native.clearTrack(track));
  }
  clearTracks(): void {
    this._command(() => this._native.clearTracks());
  }
  addListener(listener: SpineAnimationStateListener): void {
    this._listeners.add(listener);
  }
  removeListener(listener: SpineAnimationStateListener): void {
    this._listeners.delete(listener);
  }
  clearListeners(): void {
    this._listeners.clear();
  }

  /** @internal */
  _wrap(native: ISpineTrackEntry | null | undefined): SpineTrackEntry | null {
    if (!native) return null;
    let entry = this._entries.get(native);
    if (!entry) {
      entry = SpineTrackEntry._create(native, this);
      this._entries.set(native, entry);
    }
    return entry;
  }

  /** @internal */
  _relay(listener: SpineAnimationStateListener): ISpineAnimationStateListener {
    return {
      start: (entry) => listener.start?.(this._wrap(entry)),
      interrupt: (entry) => listener.interrupt?.(this._wrap(entry)),
      end: (entry) => listener.end?.(this._wrap(entry)),
      dispose: (entry) => listener.dispose?.(this._wrap(entry)),
      complete: (entry) => listener.complete?.(this._wrap(entry)),
      event: (entry, event) => listener.event?.(this._wrap(entry), this._event(event))
    };
  }

  /** @internal */
  _dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._operationDepth++;
    try {
      this._native.clearTracks();
    } finally {
      this._endOperation();
    }
  }

  /** @internal */
  _update(skeleton: ISpineSkeleton, delta: number): void {
    this._operationDepth++;
    try {
      this._runtime.updateState(skeleton, this._native, delta);
    } finally {
      this._endOperation();
    }
  }

  private _command<T>(command: () => T): T {
    if (this._disposed) throw new Error("This Spine animation state has been disposed.");
    this._operationDepth++;
    try {
      // Bind returned entries before callbacks can release them or recycle their native objects.
      return this._runtime.batchAnimationStateEvents(this._native, command);
    } finally {
      this._endOperation();
    }
  }

  private _endOperation(): void {
    if (--this._operationDepth === 0 && this._disposed) {
      // A clearTracks called from a callback only queues disposal. Keep the bridge until dispatch finishes.
      this._native.clearListeners();
      this._listeners.clear();
    }
  }

  private _dispatch(event: PlaybackEvent, native: ISpineTrackEntry): void {
    if (!this._listeners.size) return;
    const entry = this._wrap(native);
    for (const listener of Array.from(this._listeners)) listener[event]?.(entry);
  }
  private _event(event: ISpineEvent): SpineEvent {
    return Object.freeze({
      data: Object.freeze({ name: event.data.name }),
      time: event.time,
      intValue: event.intValue,
      floatValue: event.floatValue,
      stringValue: event.stringValue
    });
  }
}
