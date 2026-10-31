import { EventData } from "./EventData";

/** Stores the current pose values for an {@link Event}.
 *
 * See Timeline {@link Timeline#apply()},
 * AnimationStateListener {@link AnimationStateListener#event()}, and
 * [Events](http://esotericsoftware.com/spine-events) in the Spine User Guide. */
export class Event {
  data: EventData;
  intValue: number;
  floatValue: number;
  stringValue: string;
  time: number;
  volume: number;
  balance: number;

  constructor(time: number, data: EventData) {
    if (data == null) throw new Error("data cannot be null.");
    this.time = time;
    this.data = data;
  }
}
