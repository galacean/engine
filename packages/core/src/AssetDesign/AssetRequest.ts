/**
 * 用于异步请求。
 */
class AsyncRequest<T> extends Promise<T> {
  /** @internal */
  _isDone: boolean = false;
  /** @internal */
  _progress: number = 0;

  /** 进度回调。 */
  onProgress: (progress: number) => void = null;

  /**
   * 加载是否完成。
   */
  get isDone(): boolean {
    return this._isDone;
  }

  /**
   * 加载的进度。
   */
  get progress(): number {
    return this._progress;
  }
}

/**
 * 用于资产请求。
 */
export class SingalAssetRequest<T> extends AsyncRequest<T> {
  /** @internal */
  _asset: object = null;

  /**
   * 资产。
   */
  get asset(): object {
    return this._asset;
  }
}

/**
 * 用于资产请求集合。
 */
export class MultiAssetRequest<T> extends AsyncRequest<T> {
  /** @internal */
  _assets: object[] = [];

  /**
   * 资产集合。
   */
  get assets(): object[] {
    return this._assets;
  }
}
