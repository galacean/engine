type PromiseNotifier = (progress: number) => void;

/**
 * Asset Promise Status
 */
export enum AssetPromiseStatus {
  /** Success. */
  Success,
  /** Pending. */
  Pending,
  /** Failed. */
  Failed
}
/**
 * Asset Loading Promise.
 */
export class AssetPromise<T> extends Promise<T> {
  static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>,
      T6 | PromiseLike<T6>,
      T7 | PromiseLike<T7>,
      T8 | PromiseLike<T8>,
      T9 | PromiseLike<T9>,
      T10 | PromiseLike<T10>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;

  static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>,
      T6 | PromiseLike<T6>,
      T7 | PromiseLike<T7>,
      T8 | PromiseLike<T8>,
      T9 | PromiseLike<T9>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;

  static all<T1, T2, T3, T4, T5, T6, T7, T8>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>,
      T6 | PromiseLike<T6>,
      T7 | PromiseLike<T7>,
      T8 | PromiseLike<T8>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;

  static all<T1, T2, T3, T4, T5, T6, T7>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>,
      T6 | PromiseLike<T6>,
      T7 | PromiseLike<T7>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5, T6, T7]>;

  static all<T1, T2, T3, T4, T5, T6>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>,
      T6 | PromiseLike<T6>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5, T6]>;

  static all<T1, T2, T3, T4, T5>(
    values: readonly [
      T1 | PromiseLike<T1>,
      T2 | PromiseLike<T2>,
      T3 | PromiseLike<T3>,
      T4 | PromiseLike<T4>,
      T5 | PromiseLike<T5>
    ]
  ): AssetPromise<[T1, T2, T3, T4, T5]>;

  static all<T1, T2, T3, T4>(
    values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>]
  ): AssetPromise<[T1, T2, T3, T4]>;

  static all<T1, T2, T3>(
    values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>]
  ): AssetPromise<[T1, T2, T3]>;

  static all<T1, T2>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): AssetPromise<[T1, T2]>;

  static all<T>(values: readonly (T | PromiseLike<T>)[]): AssetPromise<T[]>;

  /**
   * Return a new resource Promise through the provided asset promise collection.
   * The resolved of the new AssetPromise will be triggered when all the Promises in the provided set are completed.
   * @param - AssetPromise Collection
   * @returns AssetPromise
   */
  static all<T>(promises: T | PromiseLike<T>[]): AssetPromise<T[]> {
    return new AssetPromise((resolve, reject, setProgress) => {
      if (!Array.isArray(promises)) {
        return resolve([promises]);
      }

      let completed = 0;
      let total = promises.length;
      let results = new Array<T>(total);

      promises.forEach((value, index) => {
        Promise.resolve(value)
          .then((result) => {
            results[index] = result;

            completed += 1;
            setProgress(completed / total);

            if (completed == total) {
              resolve(results);
            }
          })
          .catch((err) => reject(err));
      });
    });
  }

  private _status: AssetPromiseStatus;
  private _progress: number;
  private _reject: (reason?: any) => void;
  private _listeners: Set<PromiseNotifier>;

  /**
   * Current promise state.
   */
  get status(): AssetPromiseStatus {
    return this._status;
  }

  /**
   * Loading progress.
   */
  get progress(): number {
    return this._progress;
  }

  /**
   * Progress callback.
   * @param callback - Progress callback
   * @returns Asset Promise
   */
  onProgress(callback: (progress?: number) => any): AssetPromise<T> {
    this._listeners.add(callback);
    return this;
  }

  /**
   * Cancel promise request.
   * @returns Asset promise
   */
  cancel(): AssetPromise<T> {
    if (this._status !== AssetPromiseStatus.Pending) {
      return this;
    }
    this._reject("Promise Canceled");
    return this;
  }

  /**
   * Create an asset loading Promise.
   * @param executor - A callback used to initialize the promise. This callback is passed two arguments:
   * a resolve callback used to resolve the promise with a value or the result of another promise,
   * and a reject callback used to reject the promise with a provided reason or error.
   * and a setProgress callback used to set promise progress with a percent.
   */
  constructor(
    executor: (
      resolve: (value?: T | PromiseLike<T>) => void,
      reject?: (reason?: any) => void,
      setProgress?: PromiseNotifier
    ) => void
  ) {
    let newReject: (reason?: any) => void;

    const setProgress = (progress: number) => {
      if (progress <= this._progress) {
        return;
      }
      this._progress = progress;

      for (const listener of this._listeners) {
        listener(progress);
      }
    };

    super((resolve, reject) => {
      newReject = (reason?: any) => {
        // Add it to the micro task to avoid reporting an error when calling this directly.
        Promise.resolve().then(() => {
          this._status = AssetPromiseStatus.Failed;
          reject(reason);
        });
      };
      executor(
        (value: T) => {
          // Add it to the micro task to avoid reporting an error when calling this directly.
          Promise.resolve().then(() => {
            setProgress(1);
            this._status = AssetPromiseStatus.Success;
            resolve(value);
          });
        },
        newReject,
        (progress: number) => {
          // Add it to the micro task to avoid reporting an error when calling this directly
          Promise.resolve().then(() => {
            setProgress(progress);
          });
        }
      );
    });
    this._reject = newReject;
    this._listeners = new Set();
    this._progress = 0;
    this._status = AssetPromiseStatus.Pending;
  }
}
