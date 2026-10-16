import type { ISpineTrackEntry } from "@galacean/engine-design";
import type { SpineAnimation } from "./SpineAnimation";
import type { SpineAnimationState } from "./SpineAnimationState";
import type { SpineAnimationStateListener } from "./SpineAnimationStateListener";

/**
 * One playback entry. Valid through its dispose callbacks.
 * After disposal, accessing playback properties throws even if the backend reuses its pooled entry.
 */
export class SpineTrackEntry {
  private _listener: SpineAnimationStateListener | null = null;
  private _animation: SpineAnimation | null;

  private constructor(
    private _native: ISpineTrackEntry | null,
    private _state: SpineAnimationState
  ) {
    const animation = _native.animation;
    this._animation = animation
      ? (_state.data.skeletonData.findAnimation(animation.name) ??
        Object.freeze({ name: animation.name, duration: animation.duration }))
      : null;
  }
  /** @internal */
  static _create(native: ISpineTrackEntry, state: SpineAnimationState): SpineTrackEntry {
    return new SpineTrackEntry(native, state);
  }
  get disposed(): boolean {
    return this._native === null;
  }
  get animation(): SpineAnimation | null {
    this._requireNative();
    return this._animation;
  }
  get trackIndex(): number {
    return this._requireNative().trackIndex;
  }
  get next(): SpineTrackEntry | null {
    return this._state._wrap(this._requireNative().next);
  }
  get mixingFrom(): SpineTrackEntry | null {
    return this._state._wrap(this._requireNative().mixingFrom);
  }
  get mixingTo(): SpineTrackEntry | null {
    return this._state._wrap(this._requireNative().mixingTo);
  }
  get listener(): SpineAnimationStateListener | null {
    this._requireNative();
    return this._listener;
  }
  set listener(value: SpineAnimationStateListener | null) {
    this._requireNative().listener = value ? this._state._relay(value) : null;
    this._listener = value;
  }
  get loop(): boolean {
    return this._requireNative().loop;
  }
  set loop(value: boolean) {
    this._requireNative().loop = value;
  }
  get delay(): number {
    return this._requireNative().delay;
  }
  set delay(value: number) {
    this._requireNative().delay = value;
  }
  get trackTime(): number {
    return this._requireNative().trackTime;
  }
  set trackTime(value: number) {
    this._requireNative().trackTime = value;
  }
  get trackEnd(): number {
    return this._requireNative().trackEnd;
  }
  set trackEnd(value: number) {
    this._requireNative().trackEnd = value;
  }
  get timeScale(): number {
    return this._requireNative().timeScale;
  }
  set timeScale(value: number) {
    this._requireNative().timeScale = value;
  }
  get alpha(): number {
    return this._requireNative().alpha;
  }
  set alpha(value: number) {
    this._requireNative().alpha = value;
  }
  get animationStart(): number {
    return this._requireNative().animationStart;
  }
  set animationStart(value: number) {
    this._requireNative().animationStart = value;
  }
  get animationEnd(): number {
    return this._requireNative().animationEnd;
  }
  set animationEnd(value: number) {
    this._requireNative().animationEnd = value;
  }
  get mixTime(): number {
    return this._requireNative().mixTime;
  }
  set mixTime(value: number) {
    this._requireNative().mixTime = value;
  }
  get mixDuration(): number {
    return this._requireNative().mixDuration;
  }
  set mixDuration(value: number) {
    this._requireNative().mixDuration = value;
  }
  getAnimationTime(): number {
    return this._requireNative().getAnimationTime();
  }
  isComplete(): boolean {
    return this._requireNative().isComplete();
  }

  /** @internal */
  _invalidate(): void {
    this._native = null;
    this._listener = null;
  }
  private _requireNative(): ISpineTrackEntry {
    if (!this._native) throw new Error("This Spine track entry has been disposed.");
    return this._native;
  }
}
