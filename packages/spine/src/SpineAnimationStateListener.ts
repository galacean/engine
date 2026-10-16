import type { SpineTrackEntry } from "./SpineTrackEntry";

/** A snapshot of an authored animation event. It can be retained after the callback returns. */
export interface SpineEvent {
  readonly data: { readonly name: string };
  readonly time: number;
  readonly intValue: number;
  readonly floatValue: number;
  readonly stringValue: string | null;
}

/** Playback callbacks receive Spine public objects, never backend handles. */
export interface SpineAnimationStateListener {
  start?(entry: SpineTrackEntry): void;
  interrupt?(entry: SpineTrackEntry): void;
  end?(entry: SpineTrackEntry): void;
  dispose?(entry: SpineTrackEntry): void;
  complete?(entry: SpineTrackEntry): void;
  event?(entry: SpineTrackEntry, event: SpineEvent): void;
}
