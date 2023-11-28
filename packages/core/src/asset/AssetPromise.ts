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
    return new AssetPromise<T[]>((resolve, reject, setTaskCompleteProgress) => {
      const count = promises.length;
      const results: T[] = new Array(count);
      let completed = 0;

      if (count === 0) {
        return resolve(results);
      }

      function onComplete(index: number, resultValue: T) {
        completed++;
        results[index] = resultValue;

        setTaskCompleteProgress(completed, count);
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
  private _taskCompleteProgress: TaskCompleteProgress;
  private _taskDetailProgress: Record<string, TaskCompleteProgress>;
  private _onTaskCompleteCallbacks: TaskCompleteCallback[] = [];
  private _onTaskDetailCallbacks: TaskDetailCallback[] = [];
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
          this._onTaskCompleteCallbacks = undefined;
          this._onTaskDetailCallbacks = undefined;
        }
      };
      const onReject = (reason) => {
        if (this._state === PromiseState.Pending) {
          reject(reason);
          this._state = PromiseState.Rejected;
          this._onTaskCompleteCallbacks = undefined;
          this._onTaskDetailCallbacks = undefined;
        }
      };
      const onCancel = (callback) => {
        if (this._state === PromiseState.Pending) {
          this._onCancelHandler = callback;
        }
      };
      const setTaskCompleteProgress = (loaded: number, total: number) => {
        if (this._state === PromiseState.Pending) {
          const progress = (this._taskCompleteProgress ||= { loaded, total });

          progress.loaded = loaded;
          progress.total = total;

          this._onTaskCompleteCallbacks.forEach((callback) => callback(loaded, total));
        }
      };
      const setTaskDetailProgress = (url: string, loaded: number, total: number) => {
        if (this._state === PromiseState.Pending) {
          this._taskDetailProgress ||= {};
          const progress = (this._taskDetailProgress[url] ||= { loaded, total });
          progress.loaded = loaded;
          progress.total = total;
          this._onTaskDetailCallbacks.forEach((callback) => callback(url, loaded, total));
        }
      };

      executor(onResolve, onReject, setTaskCompleteProgress, setTaskDetailProgress, onCancel);
    });
  }

  /**
   * Progress callback.
   * @param onTaskComplete - This callback function provides information about the overall progress of the task. For example, in batch processing tasks, you can use the loaded and total parameters to calculate the percentage of task completion or display a progress bar
   * @param onTaskDetail - This callback function provides detailed progress information about the task. For instance, in file downloading scenarios, you can use the loaded and total parameters to calculate the download progress percentage and utilize the url parameter to provide additional details such as download speed and estimated remaining time
   * @returns AssetPromise
   */
  onProgress(
    onTaskComplete: (loaded: number, total: number) => void,
    onTaskDetail?: (identifier: string, loaded: number, total: number) => void
  ): AssetPromise<T> {
    const completeProgress = this._taskCompleteProgress;
    const detailProgress = this._taskDetailProgress;
    if (completeProgress) {
      onTaskComplete(completeProgress.loaded, completeProgress.total);
    }

    if (detailProgress) {
      for (let url in detailProgress) {
        const { loaded, total } = detailProgress[url];
        onTaskDetail(url, loaded, total);
      }
    }

    if (this._state === PromiseState.Pending) {
      onTaskComplete && this._onTaskCompleteCallbacks.push(onTaskComplete);
      onTaskDetail && this._onTaskDetailCallbacks.push(onTaskDetail);
    }

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
    setTaskCompleteProgress?: TaskCompleteCallback,
    setTaskDetailProgress?: TaskDetailCallback,
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

type TaskCompleteProgress = {
  loaded: number;
  total: number;
};
type TaskCompleteCallback = (loaded: number, total: number) => void;
type TaskDetailCallback = (url: string, loaded: number, total: number) => void;
