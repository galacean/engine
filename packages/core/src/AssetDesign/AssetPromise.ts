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
 * 资源异步请求。
 */
export class AssetPromise<T> extends Promise<T> {
  /** @internal */
  _status: AssetPromiseStatus = AssetPromiseStatus.Pending;
  /** @internal */
  _progress: number = 0;

  /**
   * 请求状态。
   */
  get status(): AssetPromiseStatus {
    return this._status;
  }

  /**
   * 加载进度。
   */
  get progress(): number {
    return this._progress;
  }

  /**
   * 进度回调。
   */
  onProgress(callback: (progress?: number) => any): AssetPromise<T> {
    return this;
  }

  /** 取消所有 Promise 请求 */
  cancel(): AssetPromise<T> {
    return this;
  }
}
