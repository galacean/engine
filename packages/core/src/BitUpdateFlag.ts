import { UpdateFlag } from "./UpdateFlag";

/**
 * Bit update flag.
 */
export class BitUpdateFlag extends UpdateFlag {
  /** Bit flags. */
  flags: number = 0;

  /**
   * @inheritdoc
   */
  dispatch(bit?: number): void {
    this.flags |= bit;
  }
}
