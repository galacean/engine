import { UpdateFlag } from "./UpdateFlag";

/**
 * Bool update flag.
 */
export class BoolUpdateFlag extends UpdateFlag {
  /** Bool flag. */
  flag: boolean = true;

  /**
   * @inheritdoc
   */
  dispatch(): void {
    this.flag = true;
  }
}
