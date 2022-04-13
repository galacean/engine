import { UpdateFlag } from "./UpdateFlag";
import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Used to update tags.
 */
export class BoolUpdateFlag extends UpdateFlag {
  /** @internal */
  _flagManagers: UpdateFlagManager[] = [];

  /** Flag. */
  flag = true;

  dispatch(): void {
    this.flag = true;
  }
}
