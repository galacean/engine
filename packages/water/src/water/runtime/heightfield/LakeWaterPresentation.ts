import type { HeightfieldWaterRuntimeController } from "./HeightfieldWaterRuntimeController";
import { HeightfieldWaterDebugMode } from "./HeightfieldWaterRuntimeEnums";

export interface LakeWaterPresentationState {
  readonly debugMode: HeightfieldWaterDebugMode;
  readonly surfaceTimeOverride: number | undefined;
}

export function applyLakeWaterPresentation(
  controller: HeightfieldWaterRuntimeController,
  presentation: Readonly<LakeWaterPresentationState>
): void {
  controller.setDebugMode(presentation.debugMode);
  controller.setSurfaceTimeOverride(presentation.surfaceTimeOverride);
}

export function createLakeWaterPresentationState(
  surfaceTimeOverride: number | undefined = undefined
): Readonly<LakeWaterPresentationState> {
  return Object.freeze({
    debugMode: HeightfieldWaterDebugMode.Final,
    surfaceTimeOverride
  });
}
