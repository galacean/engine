/**
 * Blend mode of a spine slot.
 *
 * @remarks
 * Version-neutral mirror of spine-core's `BlendMode` enum. The values match spine-core across all
 * supported runtime versions (3.8 / 4.2), so a core package can pass its `BlendMode` straight through.
 * Owning it here keeps the shared package free of any runtime spine-core dependency.
 */
export enum SpineBlendMode {
  Normal = 0,
  Additive = 1,
  Multiply = 2,
  Screen = 3
}
