import type { ISpineEvent } from "./ISpineEvent";
import type { ISpineTrackEntry } from "./ISpineTrackEntry";

export interface ISpineAnimationStateListener {
  start?(entry: ISpineTrackEntry): void;
  interrupt?(entry: ISpineTrackEntry): void;
  end?(entry: ISpineTrackEntry): void;
  dispose?(entry: ISpineTrackEntry): void;
  complete?(entry: ISpineTrackEntry): void;
  event?(entry: ISpineTrackEntry, event: ISpineEvent): void;
}
