/**
 * StateMachine state.
 */
export enum StateMachineState {
  /** Standby state. */
  Standby, //CM: Standby 优化
  /** Playing state. */
  Playing,
  /** CrossFading state. */
  CrossFading,
  /** FixedCrossFading state. */
  FixedCrossFading
}
