import { Engine } from "../Engine";
import { AnimatorStateMachine } from "./AnimatorStateMachine";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { AnimatorLayerMask } from "./AnimatorLayerMask";

/**
 * The Animation Layer contains a state machine that controls animations of a model or part of it.
 */
export class AnimatorControllerLayer {
  /** The blending weight that the layers has. It is not taken into account for the first layer. */
  weight: number = 1.0;
  /** The blending mode used by the layer. It is not taken into account for the first layer. */
  blendingMode: AnimatorLayerBlendingMode = AnimatorLayerBlendingMode.Override;
  /** The AnimatorLayerMask is used to mask out certain entities from being animated by an AnimatorLayer. */
  mask: AnimatorLayerMask;

  private _stateMachine: AnimatorStateMachine;
  private _engine: Engine;
  private _onStateMachineChanged: (() => void) | null = null;

  /**
   * The state machine for the layer.
   */
  get stateMachine(): AnimatorStateMachine {
    return this._stateMachine;
  }

  set stateMachine(value: AnimatorStateMachine) {
    const lastStateMachine = this._stateMachine;
    if (lastStateMachine === value) {
      return;
    }

    lastStateMachine._setChangeCallback(null);
    this._stateMachine = value;
    value._setChangeCallback(this._onStateMachineChanged);
    this._engine && value._setEngine(this._engine);
    this._onStateMachineChanged?.();
  }

  /**
   * @param name - The layer's name
   */
  constructor(public readonly name: string) {
    this._stateMachine = new AnimatorStateMachine();
  }

  /**
   * @internal
   */
  _setEngine(engine: Engine): void {
    this._engine = engine;
    this._stateMachine._setEngine(engine);
  }

  /**
   * @internal
   */
  _setStateMachineChangeCallback(onChanged: (() => void) | null): void {
    this._onStateMachineChanged = onChanged;
    this._stateMachine._setChangeCallback(onChanged);
  }
}
