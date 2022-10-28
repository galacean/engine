import { UpdateFlag } from "./UpdateFlag";

/**
 * Used to update tags.
 */
export class BoolUpdateFlag extends UpdateFlag {
  /** Flag. */
  flag: boolean = true;

  /**
   * @inheritdoc
   */
  dispatch(): void {
    this.flag = true;
  }
}
