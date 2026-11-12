import type { HeightfieldWaterRuntimeController } from "./HeightfieldWaterRuntimeController";

export interface LakeWaterPresentationState {
  readonly surfaceTimeOverride: number | undefined;
}

export function applyLakeWaterPresentation(
  controller: HeightfieldWaterRuntimeController,
  presentation: Readonly<LakeWaterPresentationState>
): void {
  controller.setSurfaceTimeOverride(presentation.surfaceTimeOverride);
}

export function createLakeWaterPresentationState(
  surfaceTimeOverride: number | undefined = undefined
): Readonly<LakeWaterPresentationState> {
  return Object.freeze({
    surfaceTimeOverride
  });
}
