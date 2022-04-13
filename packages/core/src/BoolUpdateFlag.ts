import { UpdateFlag } from "./UpdateFlag";
import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Used to update tags.
 */
export class BoolUpdateFlag extends UpdateFlag {
  /** Flag. */
  flag = true;

  /**
   * @inheritdoc
   */
  dispatch(): void {
    this.flag = true;
  }
}
