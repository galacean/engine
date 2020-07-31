type PromiseNotifier = (progress: number) => void;
/**
 * 资源 Promise 状态
 */
export enum AssetPromiseStatus {
  /** 成功。 */
  Success,
  /** 请求中。 */
  Pending,
  /** 失败。 */
  Failed
}
/**
 * 资源加载的 Promise，有 progress 和 isDone。
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
   * 重写 promise all，返回 AssetPromise
   * @param promises
   * @returns AssetPromise
   */
  static all<T>(promises: T | PromiseLike<T>[]): AssetPromise<T[]> {
    return new AssetPromise((resolve, reject, setProgress) => {
      if (!Array.isArray(promises)) {
        return resolve([promises]);
      }
      let results = [];
      let completed = 0;
      let total = promises.length;

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

  /** @internal */
  private _status: AssetPromiseStatus;
  /** @internal */
  private _progress: number;
  /** @internal */
  private _reject: (reason?: any) => void;
  /** @internal */
  private _listeners: Set<PromiseNotifier>;

  /**
   * 当前 promise 状态。
   */
  get status(): AssetPromiseStatus {
    return this._status;
  }

  /**
   * 加载的进度。
   */
  get progress(): number {
    return this._progress;
  }

  /** 进度回调。 */
  onProgress(callback: (progress?: number) => any): AssetPromise<T> {
    this._listeners.add(callback);
    return this;
  }

  /** 取消 Promise 请求 */
  cancel(): AssetPromise<T> {
    if (this._status !== AssetPromiseStatus.Pending) {
      return this;
    }
    this._reject("Promise Canceled");
    return this;
  }

  /**
   * 创建一个资源加载的 Promise。
   * @param executor A callback used to initialize the promise. This callback is passed two arguments:
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
        // 加入到微任务中，避免直接调用找不到 this 报错
        Promise.resolve().then(() => {
          this._status = AssetPromiseStatus.Failed;
          reject(reason);
        });
      };
      executor(
        (value: T) => {
          // 加入到微任务中，避免直接调用找不到 this 报错
          Promise.resolve().then(() => {
            setProgress(1);
            this._status = AssetPromiseStatus.Success;
            resolve(value);
          });
        },
        newReject,
        (progress: number) => {
          // 加入到微任务中，避免直接调用找不到 this 报错
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
