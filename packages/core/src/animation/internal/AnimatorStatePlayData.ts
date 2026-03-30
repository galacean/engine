import { AnimationClip } from "../AnimationClip";
import { AnimatorState } from "../AnimatorState";
import { AnimatorStateTransition } from "../AnimatorStateTransition";
import { AnimatorStatePlayState } from "../enums/AnimatorStatePlayState";
import { WrapMode } from "../enums/WrapMode";
import { StateMachineScript } from "../StateMachineScript";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * Per-instance runtime data for an AnimatorState.
 * Proxies read-only properties from the shared AnimatorState asset,
 * while providing per-instance mutable properties (e.g. speed).
 */
export class AnimatorStatePlayData {
  /** @internal */
  state: AnimatorState;
  /** @internal */
  stateData: AnimatorStateData;
  /** @internal */
  playedTime: number;
  playState: AnimatorStatePlayState;
  /** @internal */
  clipTime: number;
  /** @internal */
  currentEventIndex: number;
  /** @internal */
  isForward = true;
  /** @internal */
  offsetFrameTime: number;
  /** Per-instance speed. Initialized from AnimatorState.speed, safe to modify without affecting other instances. */
  speed: number = 1.0;

  // ── Proxy properties from AnimatorState (read-only) ──

  /** The name of the state. */
  get name(): string {
    return this.state.name;
  }

  /** The clip played by this state. */
  get clip(): AnimationClip {
    return this.state.clip;
  }

  /** The wrap mode. */
  get wrapMode(): WrapMode {
    return this.state.wrapMode;
  }

  /** The transitions going out of this state. */
  get transitions(): Readonly<AnimatorStateTransition[]> {
    return this.state.transitions;
  }

  /**
   * Add a state machine script to the underlying AnimatorState.
   */
  addStateMachineScript<T extends StateMachineScript>(scriptType: new () => T): T {
    return this.state.addStateMachineScript(scriptType);
  }

  private _changedOrientation = false;

  reset(state: AnimatorState, stateData: AnimatorStateData, offsetFrameTime: number): void {
    this.state = state;
    this.playedTime = 0;
    this.offsetFrameTime = offsetFrameTime;
    this.stateData = stateData;
    this.playState = AnimatorStatePlayState.UnStarted;
    this.clipTime = state.clipStartTime * state.clip.length;
    this.currentEventIndex = 0;
    this.isForward = true;
    this.speed = state.speed;
    this.state._transitionCollection.needResetCurrentCheckIndex = true;
  }

  updateOrientation(deltaTime: number): void {
    if (deltaTime !== 0) {
      const lastIsForward = this.isForward;
      this.isForward = deltaTime > 0;
      if (this.isForward !== lastIsForward) {
        this._changedOrientation = true;
        this.isForward || this._correctTime();
      }
    }
  }

  update(deltaTime: number): void {
    this.playedTime += deltaTime;
    const state = this.state;
    let time = this.playedTime + this.offsetFrameTime;
    const duration = state._getDuration();
    this.playState = AnimatorStatePlayState.Playing;
    if (state.wrapMode === WrapMode.Loop) {
      time = duration ? time % duration : 0;
    } else {
      if (Math.abs(time) >= duration) {
        time = time < 0 ? -duration : duration;
        this.playState = AnimatorStatePlayState.Finished;
      }
    }

    time < 0 && (time += duration);
    this.clipTime = time + state.clipStartTime * state.clip.length;

    if (this._changedOrientation) {
      !this.isForward && this._correctTime();
      this._changedOrientation = false;
    }
  }

  private _correctTime() {
    const { state } = this;
    if (this.clipTime === 0) {
      this.clipTime = state.clipEndTime * state.clip.length;
    }
  }
}
