import { AssetPromise } from "./AssetPromise";

const hasOwn = Object.prototype.hasOwnProperty;

const mimeType: Record<string, XMLHttpRequestResponseType | "image"> = Object.assign(Object.create(null), {
  json: "json",
  gltf: "json",
  mtl: "json",
  prefab: "json",
  txt: "text",
  bin: "arraybuffer",
  png: "image",
  webp: "image",
  jpg: "image"
});

const defaultRetryCount = 1;
const defaultTimeout = Infinity;
const defaultInterval = 500;

function getOwn<T extends object, K extends keyof T>(obj: T | undefined | null, key: K): T[K] | undefined {
  return obj != null && hasOwn.call(obj, key) ? obj[key] : undefined;
}

/**
 * Configuration options for `request`.
 * @remarks
 * This type extends the standard `RequestInit` options with additional
 * properties for handling retries, timeouts, and custom response types.
 */
export type RequestConfig = {
  type?: XMLHttpRequestResponseType | "image";
  retryCount?: number;
  retryInterval?: number;
  timeout?: number;
} & RequestInit;

/**
 * Sends a request to the specified URL and returns a promise for the response.
 * @param url - The URL to send the request to
 * @param config - Configuration options for the request
 * @returns A promise that resolves with the response of type `T`
 */
export function request<T>(url: string, config: RequestConfig = {}): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
    const retryCount = getOwn(config, "retryCount") ?? defaultRetryCount;
    const retryInterval = getOwn(config, "retryInterval") ?? defaultInterval;
    const timeout = getOwn(config, "timeout") ?? defaultTimeout;
    const type = getOwn(config, "type") ?? getMimeTypeFromUrl(url);
    const requestConfig: RequestConfig = Object.assign(Object.create(null), {
      timeout,
      type,
      method: getOwn(config, "method"),
      credentials: getOwn(config, "credentials"),
      headers: getOwn(config, "headers"),
      body: getOwn(config, "body")
    });
    const executor = new MultiExecutor(
      () => requestRes<T>(url, requestConfig).onProgress(setTaskCompleteProgress, setTaskDetailProgress),
      retryCount,
      retryInterval
    );
    executor.start().onError(reject).onComplete(resolve);
  });
}

function requestRes<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress) => {
    const xhr = new XMLHttpRequest();
    const isImg = config.type === "image";
    xhr.timeout = config.timeout;
    const method = config.method ?? "get";
    xhr.withCredentials = config.credentials === "include";
    // @ts-ignore
    xhr.responseType = isImg ? "blob" : config.type;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Request failed from: ${url}`));
        return;
      }
      const result = xhr.response;
      // For example, if the response body is a document but responseType is set to JSON, it returns null.
      if (!result) {
        reject(new Error(`Request ${url} response is empty, please check the config.`));
        return;
      }
      if (isImg) {
        const img = new Image();

        img.onload = () => {
          // Call requestAnimationFrame to avoid iOS's bug.
          requestAnimationFrame(() => {
            setTaskCompleteProgress(1, 1);
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
        img.src = URL.createObjectURL(result);
      } else {
        setTaskCompleteProgress(1, 1);
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
        setTaskDetailProgress(url, e.loaded, e.total);
      }
    };
    xhr.open(method, url, true);
    const headers = config.headers;
    if (headers) {
      if (typeof Headers !== "undefined" && headers instanceof Headers) {
        headers.forEach((value, name) => {
          xhr.setRequestHeader(name, value);
        });
      } else {
        Object.keys(headers).forEach((name) => {
          xhr.setRequestHeader(name, headers[name]);
        });
      }
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
