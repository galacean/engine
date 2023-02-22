import { Loader } from "./Loader";

/**
 * ContentRestoreInfo is a base class for all content restore info classes.
 */
export abstract class ContentRestoreInfo<T> {
  /** @internal */
  _loader: Loader<T>;
}
