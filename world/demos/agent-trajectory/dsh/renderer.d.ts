// Typed offline entry points. Data/prop declarations are extracted from upstream by vendor-dsh.mjs.
import type { ComponentType } from "react";
import type { ImageGalleryProps } from "../platform-types";
import type { TrajectoryTranslate } from "./locales";
import type { TrajectoryTableProps, TrajectoryToolbarProps, TrajectoryTimelineProps, TrajectoryTurnModel, TrajectoryCellProps, TrajectoryTimelineMode, TrajectoryTimeRange, TrajectoryTimelineModel, CodeProgram } from "./contracts";
export const TrajectoryTable: ComponentType<TrajectoryTableProps>;
export const TrajectoryToolbar: ComponentType<TrajectoryToolbarProps>;
export const TrajectoryTimeline: ComponentType<TrajectoryTimelineProps>;
export const ImageGallery: ComponentType<ImageGalleryProps>;
export function trajectoryRecordId(cell: TrajectoryCellProps): string;
export function deriveTrajectoryTimeline(turns: readonly TrajectoryTurnModel[], mode?: TrajectoryTimelineMode): TrajectoryTimelineModel | null;
export function trajectoryTimelineFocusIndexes(turns: readonly TrajectoryTurnModel[], range: TrajectoryTimeRange, mode?: TrajectoryTimelineMode): ReadonlySet<number>;
export function codeProgram(cell: TrajectoryCellProps): CodeProgram | undefined;
export function formatElapsedSeconds(seconds: number | null, t: TrajectoryTranslate): string;
export class TrajectorySearchIndex {
  update(layouts: readonly (readonly TrajectoryTurnModel[])[]): boolean;
  search(query: string): ReadonlySet<string> | null;
}
