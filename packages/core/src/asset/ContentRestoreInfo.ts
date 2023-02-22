import { Loader } from "./Loader";

export abstract class ContentRestoreInfo<T> {
  /** @internal */
  _loader: Loader<T>;
}
