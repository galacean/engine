type PromiseNotifier = (progress: number) => void;
/**
 * y
 */
export enum AssetPromiseStatus {
  Success,
  Pending,
  Fail
}
/**
 * 资源加载的 Promise，有 progress 和 isDone。
 */
//@ts-ignore
export class AssetPromise<T> extends Promise<T> {
  /**
   * 重写 promise all，返回 AssetPromise
   * @param promises
   * @returns AssetPromise
   */
  static all<T>(promises: AssetPromise<T>[]): AssetPromise<T[]> {
    return new AssetPromise((resolve, reject, setProgress) => {
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
   * 加载是否完成。
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

  cancel() {
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
        // 加入到微任务重，避免直接调用找不到 this 报错
        Promise.resolve().then(() => {
          this._status = AssetPromiseStatus.Fail;
          reject(reason);
        });
      };
      executor(
        (value: T) => {
          // 加入到微任务重，避免直接调用找不到 this 报错
          Promise.resolve().then(() => {
            setProgress(1);
            this._status = AssetPromiseStatus.Success;
            resolve(value);
          });
        },
        newReject,
        (progress: number) => {
          // 加入到微任务重，避免直接调用找不到 this 报错
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
