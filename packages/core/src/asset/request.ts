import { AssetPromise } from "./AssetPromise";

const mimeType = {
  json: "json",
  gltf: "json",
  mtl: "json",
  prefab: "json",
  txt: "text",
  bin: "arraybuffer",
  png: "image",
  webp: "image",
  jpg: "image"
};

const defaultRetryCount = 1;
const defaultTimeout = Infinity;
const defaultInterval = 500;

export type RequestConfig = {
  type?: XMLHttpRequestResponseType | "image";
  retryCount?: number;
  retryInterval?: number;
  timeout?: number;
} & RequestInit;

/**
 * Web request.
 * @param url - The link
 * @param config - Load configuration
 */
export function request<T>(url: string, config: RequestConfig = {}): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setProgress) => {
    const retryCount = config.retryCount ?? defaultRetryCount;
    const retryInterval = config.retryInterval ?? defaultInterval;
    config.timeout = config.timeout ?? defaultTimeout;
    config.type = config.type ?? getMimeTypeFromUrl(url);
    const realRequest = config.type === "image" ? requestImage : requestRes;
    const executor = new MultiExecutor(
      () => realRequest<T>(url, config).onProgress(setProgress),
      retryCount,
      retryInterval
    );
    executor.start().onError(reject).onComplete(resolve);
  });
}

function requestImage<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject) => {
    const { timeout } = config;
    const img = new Image();
    const onerror = () => {
      reject(new Error(`request ${url} fail`));
    };
    img.onerror = onerror;

    img.onabort = onerror;

    let timeoutId = -1;
    if (timeout != Infinity) {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`request ${url} timeout`));
      }, timeout);
    }

    img.onload = ((timeoutId) => {
      return () => {
        // Call requestAnimationFrame to avoid iOS's bug.
        requestAnimationFrame(() => {
          //@ts-ignore
          resolve(img);
          img.onload = null;
          img.onerror = null;
          img.onabort = null;
        });
        clearTimeout(timeoutId);
      };
    })(timeoutId);

    img.crossOrigin = "anonymous";

    img.src = url;
  });
}

function requestRes<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setProgress) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = config.timeout;
    config.method = config.method ?? "get";
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`request failed from: ${url}`));
        return;
      }
      const result = xhr.response ?? xhr.responseText;
      resolve(result);
    };
    xhr.onerror = () => {
      reject(new Error(`request failed from: ${url}`));
    };
    xhr.ontimeout = () => {
      reject(new Error(`request timeout from: ${url}`));
    };
    xhr.onprogress = (e) => {
      setProgress(e.loaded / e.total);
    };
    xhr.open(config.method, url, true);
    xhr.withCredentials = config.credentials === "include";
    //@ts-ignore
    xhr.responseType = config.type;
    const headers = config.headers;
    if (headers) {
      Object.keys(headers).forEach((name) => {
        xhr.setRequestHeader(name, headers[name]);
      });
    }
    // @ts-ignore
    xhr.send(config.body as XMLHttpRequestBodyInit);
  });
}

function getMimeTypeFromUrl(url: string) {
  const extname = url.substring(url.lastIndexOf(".") + 1);
  return mimeType[extname];
}

export class MultiExecutor {
  private _timeoutId: number = -100;
  private _currentCount = 0;
  private _onComplete: Function;
  private _onError: Function;
  private _error: any;
  constructor(
    private execFunc: (count?: number) => Promise<any>,
    private totalCount: number,
    private interval: number
  ) {
    this.exec = this.exec.bind(this);
  }

  start() {
    this.exec();
    return this;
  }

  onComplete(func: Function) {
    this._onComplete = func;
    return this;
  }

  onError(func: Function) {
    this._onError = func;
    return this;
  }

  cancel() {
    window.clearTimeout(this._timeoutId);
  }

  private exec(): void {
    if (this._currentCount >= this.totalCount) {
      this._onError && this._onError(this._error);
      return;
    }
    this._currentCount++;
    this.execFunc(this._currentCount)
      .then((result) => this._onComplete && this._onComplete(result))
      .catch((e) => {
        this._error = e;
        this._timeoutId = window.setTimeout(this.exec, this.interval);
      });
  }
}
