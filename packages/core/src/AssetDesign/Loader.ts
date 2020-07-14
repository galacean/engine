import { LoadItem } from "./LoadItem";
import { AssetPromise } from "./AssetPromise";

export interface Loader<T> {
  load(item: LoadItem): AssetPromise<T>;
}
