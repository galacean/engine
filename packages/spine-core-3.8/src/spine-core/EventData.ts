/** Stores the setup pose values for an {@link Event}.
 *
 * See [Events](http://esotericsoftware.com/spine-events) in the Spine User Guide. */
export class EventData {
  name: string;
  intValue: number;
  floatValue: number;
  stringValue: string;
  audioPath: string;
  volume: number;
  balance: number;

  constructor(name: string) {
    this.name = name;
  }
}
