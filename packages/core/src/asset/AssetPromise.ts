/** @internal */
interface AssetPromiseExecutor<T> {
  (
    resolve: (value?: T | PromiseLike<T>) => void,
    reject?: (reason?: any) => void,
    setProgress?: (progress: number) => void,
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

export class AssetPromise<T = any> implements PromiseLike<T> {
  static all<T = any>(promises: PromiseLike<T>[]) {
    return new AssetPromise<T[]>((resolve, reject, setProgress) => {
      const count = promises.length;
      const results: T[] = new Array(count);
      let completed = 0;

      function onProgress(promise: PromiseLike<T>, index: number) {
        promise.then((value) => {
          completed++;
          results[index] = value;
          setProgress(completed / count);
          if (completed === count) {
            resolve(results);
          }
        }, reject);
      }

      for (let i = 0; i < count; i++) {
        onProgress(promises[i], i);
      }
    });
  }

  private _promise: Promise<T>;
  private _state = PromiseState.Pending;
  private _onProgressCallback: Array<(progress: number) => void> = [];
  private _onCancelHandler: () => void;
  private _reject: (reason: any) => void;

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
          this._state = PromiseState.Canceled;
          this._onProgressCallback = undefined;
          this._onCancelHandler = callback;
        }
      };
      const setProgress = (progress: number) => {
        if (this._state === PromiseState.Pending) {
          this._onProgressCallback.forEach((callback) => callback(progress));
        }
      };

      executor(onResolve, onReject, setProgress, onCancel);
    });
  }

  onProgress(callback: (progress: number) => void): AssetPromise<T> {
    this._onProgressCallback.push(callback);
    return this;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected);
  }

  catch(onRejected: (reason: any) => any): Promise<T> {
    return this._promise.catch(onRejected);
  }

  finally(onFinally?: () => void): Promise<T> {
    return this._promise.finally(onFinally);
  }

  cancel() {
    if (this._state !== PromiseState.Pending) {
      return;
    }
    this._state = PromiseState.Canceled;
    console.log('canceled')
    this._reject("canceled");
    this._onCancelHandler && this._onCancelHandler();
  }
}
