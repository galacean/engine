import type { IProgress } from "@galacean/engine-design";

/**
 * Asset Loading Promise.
 */
export class AssetPromise<T> implements PromiseLike<T> {
  /**
   * Return a new resource Promise through the provided asset promise collection.
   * The resolved of the new AssetPromise will be triggered when all the Promises in the provided set are completed.
   * @param - Promise Collection
   * @returns AssetPromise
   */
  static all<T = any>(promises: (PromiseLike<T> | T)[]) {
    return new AssetPromise<T[]>((resolve, reject, setProgress) => {
      const count = promises.length;
      const results: T[] = new Array(count);
      let completed = 0;

      if (count === 0) {
        return resolve(results);
      }

      const progress: IProgress = {
        task: {
          loaded: 0,
          total: count
        }
      };

      function onComplete(index: number, resultValue: T) {
        completed++;
        results[index] = resultValue;

        progress.task.loaded = completed;
        setProgress(progress);
        if (completed === count) {
          resolve(results);
        }
      }

      function onProgress(promise: PromiseLike<T> | T, index: number) {
        if (promise instanceof Promise || promise instanceof AssetPromise) {
          promise.then(function (value) {
            onComplete(index, value);
          }, reject);
        } else {
          Promise.resolve().then(() => {
            onComplete(index, promise as T);
          });
        }
      }

      for (let i = 0; i < count; i++) {
        onProgress(promises[i], i);
      }
    });
  }

  /** compatible with Promise */
  get [Symbol.toStringTag]() {
    return "AssetPromise";
  }

  private _promise: Promise<T>;
  private _state = PromiseState.Pending;
  private _onProgressCallback: Array<(progress: IProgress) => void> = [];
  private _onCancelHandler: () => void;
  private _reject: (reason: any) => void;

  /**
   * Create an asset loading Promise.
   * @param executor - A callback used to initialize the promise. This callback is passed two arguments:
   * a resolve callback used to resolve the promise with a value or the result of another promise,
   * and a reject callback used to reject the promise with a provided reason or error.
   * and a setProgress callback used to set promise progress with a percent.
   */
  constructor(executor: AssetPromiseExecutor<T>) {
    this._promise = new Promise((resolve, reject) => {
      this._reject = reject;
      const onResolve = (value: T) => {
        if (this._state === PromiseState.Pending) {
          resolve(value);
          this._state = PromiseState.Fulfilled;
          this._onProgressCallback = undefined;
        }
      };
      const onReject = (reason) => {
        if (this._state === PromiseState.Pending) {
          reject(reason);
          this._state = PromiseState.Rejected;
          this._onProgressCallback = undefined;
        }
      };
      const onCancel = (callback) => {
        if (this._state === PromiseState.Pending) {
          this._onCancelHandler = callback;
        }
      };
      const setProgress = (progress: IProgress) => {
        if (this._state === PromiseState.Pending) {
          this._onProgressCallback.forEach((callback) => callback(progress));
        }
      };

      executor(onResolve, onReject, setProgress, onCancel);
    });
  }

  /**
   * Progress callback.
   * @param callback
   * @returns AssetPromise
   */
  onProgress(callback: (progress: IProgress) => void): AssetPromise<T> {
    this._onProgressCallback.push(callback);
    return this;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): AssetPromise<TResult1 | TResult2> {
    return new AssetPromise<TResult1 | TResult2>((resolve, reject) => {
      this._promise.then(onfulfilled, onrejected).then(resolve).catch(reject);
    });
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onRejected - The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch(onRejected: (reason: any) => any): AssetPromise<T> {
    return new AssetPromise<T>((resolve, reject) => {
      this._promise.catch(onRejected).then(resolve).catch(reject);
    });
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onFinally?: () => void): Promise<T> {
    return this._promise.finally(onFinally);
  }

  /**
   * Cancel promise request.
   * @returns Asset promise
   */
  cancel(): AssetPromise<T> {
    if (this._state !== PromiseState.Pending) {
      return;
    }
    this._state = PromiseState.Canceled;
    this._reject("canceled");
    this._onCancelHandler && this._onCancelHandler();
    return this;
  }
}

interface AssetPromiseExecutor<T> {
  (
    resolve: (value?: T | PromiseLike<T>) => void,
    reject?: (reason?: any) => void,
    setProgress?: (progress: IProgress) => void,
    onCancel?: (callback: () => void) => void
  ): void;
}

/** @internal */
enum PromiseState {
  Pending = "pending",
  Fulfilled = "fulfilled",
  Rejected = "rejected",
  Canceled = "canceled"
}
