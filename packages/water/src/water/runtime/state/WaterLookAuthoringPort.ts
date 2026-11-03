import type {
  WaterLookAuthoringDraft,
  WaterLookAuthoringSnapshot
} from "../../authoring/surface/WaterLookAuthoringSnapshot";

export type WaterLookAuthoringUpdater = (
  current: Readonly<WaterLookAuthoringSnapshot>
) => Readonly<WaterLookAuthoringDraft>;

/** The only writable runtime-facing entry point for a shared Water Look. */
export interface WaterLookAuthoringPort {
  readonly lookId: string;
  read(): Readonly<WaterLookAuthoringSnapshot>;
  update(updater: WaterLookAuthoringUpdater, signal?: AbortSignal): Promise<Readonly<WaterLookAuthoringSnapshot>>;
}
