/**
 * Maps a contiguous element range between aligned storage.
 */
export interface ElementRangeMapping {
  readonly sourceStart: number;
  readonly targetStart: number;
  readonly count: number;
}
