import { UpdateFlag } from "./UpdateFlag";

/**
 * Used to update tags.
 */
export class ListenerUpdateFlag extends UpdateFlag {
  /** Listener. */
  listener: Function;

  /**
   * @inheritdoc
   */
  dispatch(param?: Object): void {
    this.listener && this.listener(param);
  }
}
