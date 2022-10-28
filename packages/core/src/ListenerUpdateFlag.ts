import { BitUpdateFlag } from "./BitUpdateFlag";

/**
 * Listener update flag.
 */
export class ListenerUpdateFlag extends BitUpdateFlag {
  /** Listener. */
  listener: Function;

  /**
   * @inheritdoc
   */
  dispatch(bit?: number, param?: Object): void {
    super.dispatch(bit);
    this.listener && this.listener(param);
  }
}
