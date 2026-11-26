import { Signal } from "../../Signal";
import { DayNightClock } from "./DayNightClock";
import { DayNightPhase, DayNightProfile, DayNightState } from "./DayNightProfile";

/** Runtime consumer of the shared day/night state. */
export interface DayNightStateConsumer {
  applyDayNightState(state: DayNightState): void;
}

/**
 * Independent time-state producer for day/night rendering systems.
 *
 * @remarks
 * It owns no lights, probe chunks, sky materials, or post-process passes.
 * Consumers opt in through {@link addConsumer} and receive the same state.
 */
export class DayNightSystem {
  /** Invoked after a state evaluation. */
  readonly stateChanged = new Signal<[DayNightState]>();
  /** Invoked only when the named phase changes. */
  readonly phaseChanged = new Signal<[DayNightPhase, DayNightPhase]>();

  /** State evaluations per second. Ten Hz is the mobile-oriented default. */
  updateFrequency = 10;
  /** Current shared output state. */
  readonly state: DayNightState;

  private _consumers: DayNightStateConsumer[] = [];
  private _elapsedSinceEvaluation = 0;

  constructor(
    readonly clock = new DayNightClock(),
    readonly profile = new DayNightProfile()
  ) {
    this.state = profile.createState(clock.normalizedTime);
  }

  /** Add a state consumer and immediately synchronize it. */
  addConsumer(consumer: DayNightStateConsumer): void {
    if (this._consumers.includes(consumer)) {
      return;
    }
    this._consumers.push(consumer);
    consumer.applyDayNightState(this.state);
  }

  /** Remove a state consumer. */
  removeConsumer(consumer: DayNightStateConsumer): boolean {
    const index = this._consumers.indexOf(consumer);
    if (index < 0) {
      return false;
    }
    this._consumers.splice(index, 1);
    return true;
  }

  /** Seek to a local hour and evaluate immediately. */
  setTimeHours(timeHours: number): void {
    this.clock.timeHours = timeHours;
    this.evaluate();
  }

  /** Advance the clock and evaluate at {@link updateFrequency}. */
  update(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new Error("DayNightSystem deltaTime must be a finite non-negative number.");
    }
    const advanced = this.clock.update(deltaTime);
    if (!advanced) {
      return;
    }

    const frequency = this.updateFrequency;
    if (!Number.isFinite(frequency) || frequency <= 0) {
      throw new Error("DayNightSystem updateFrequency must be a finite positive number.");
    }
    const interval = 1 / frequency;
    this._elapsedSinceEvaluation += deltaTime;
    if (this._elapsedSinceEvaluation >= interval) {
      this._elapsedSinceEvaluation %= interval;
      this.evaluate();
    }
  }

  /** Evaluate and publish state immediately without advancing time. */
  evaluate(): DayNightState {
    const previousPhase = this.state.phase;
    this.profile.evaluate(this.clock.normalizedTime, this.state);
    const consumers = this._consumers;
    for (let i = 0; i < consumers.length; i++) {
      consumers[i].applyDayNightState(this.state);
    }
    this.stateChanged.invoke(this.state);
    if (this.state.phase !== previousPhase) {
      this.phaseChanged.invoke(this.state.phase, previousPhase);
    }
    return this.state;
  }
}
