/** Shared mixing configuration. */
export interface ISpineAnimationStateData {
  defaultMix: number;
  setMix(from: string, to: string, duration: number): void;
}
