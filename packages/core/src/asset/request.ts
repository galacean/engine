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
    const executor = new MultiExecutor(
      () => requestRes<T>(url, config).onProgress(setProgress),
      retryCount,
      retryInterval
    );
    executor.start().onError(reject).onComplete(resolve);
  });
}

function requestRes<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setProgress) => {
    const xhr = new XMLHttpRequest();
    const isImg = config.type === "image";

    xhr.timeout = config.timeout;
    config.method = config.method ?? "get";

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`request failed from: ${url}`));
        return;
      }
      const result = xhr.response ?? xhr.responseText;
      if (isImg) {
        var blob = xhr.response;
        var img = new Image();

        img.onload = () => {
          // Call requestAnimationFrame to avoid iOS's bug.
          requestAnimationFrame(() => {
            //@ts-ignore
            resolve(img);
            img.onload = null;
            img.onerror = null;
            img.onabort = null;
            URL.revokeObjectURL(img.src);
          });
        };

        img.onerror = img.onabort = () => {
          reject(new Error(`request ${img.src} fail`));
          URL.revokeObjectURL(img.src);
        };

        img.crossOrigin = "anonymous";
        img.src = URL.createObjectURL(blob);
      } else {
        resolve(result);
      }
    };
    xhr.onerror = () => {
      reject(new Error(`request failed from: ${url}`));
    };
    xhr.ontimeout = () => {
      reject(new Error(`request timeout from: ${url}`));
    };
    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress({
          detail: {
            [url]: {
              loaded: e.loaded,
              total: e.total
            }
          },
          task: {
            loaded: e.loaded === e.total ? 1 : 0,
            total: 1
          }
        });
      }
    };
    xhr.open(config.method, url, true);
    xhr.withCredentials = config.credentials === "include";
    // @ts-ignore
    xhr.responseType = isImg ? "blob" : config.type;
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
