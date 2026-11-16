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
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onCancel) => {
    let currentRequest: AssetPromise<T>;
    const retryCount = config.retryCount ?? defaultRetryCount;
    const retryInterval = config.retryInterval ?? defaultInterval;
    const normalizedConfig: RequestConfig = {
      ...config,
      timeout: config.timeout ?? defaultTimeout,
      type: config.type ?? getMimeTypeFromUrl(url)
    };
    const send = typeof XMLHttpRequest === "undefined" ? requestWithFetch : requestWithXHR;
    const executor = new MultiExecutor(
      () =>
        (currentRequest = send<T>(url, normalizedConfig).onProgress(setTaskCompleteProgress, setTaskDetailProgress)),
      retryCount,
      retryInterval
    );
    onCancel(() => {
      executor.cancel();
      currentRequest?.cancel();
    });
    executor.onError(reject).onComplete(resolve).start();
  });
}

function requestWithXHR<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onCancel) => {
    const xhr = new XMLHttpRequest();
    onCancel(() => xhr.abort());
    const isImg = config.type === "image";
    xhr.timeout = config.timeout!;
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
      Object.keys(headers).forEach((name) => {
        xhr.setRequestHeader(name, headers[name]);
      });
    }
    // @ts-ignore
    xhr.send(config.body as XMLHttpRequestBodyInit);
  });
}

function requestWithFetch<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, _setTaskDetailProgress, onCancel) => {
    const { type, retryCount: _r, retryInterval: _i, timeout, signal, ...init } = config;
    if (type === "image" || type === "document") {
      reject(new Error(`Request type "${type}" requires a browser decoder.`));
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    onCancel(abort);
    const timer = Number.isFinite(timeout) ? setTimeout(abort, timeout) : undefined;
    fetch(url, { ...init, signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed from: ${url} (${res.status})`);
        const result =
          type === "arraybuffer"
            ? await res.arrayBuffer()
            : type === "blob"
              ? await res.blob()
              : type === "json"
                ? await res.json()
                : await res.text();
        setTaskCompleteProgress(1, 1);
        return result as T;
      })
      .finally(() => {
        // A rejected response may still own an unread body and connection.
        abort();
        clearTimeout(timer);
      })
      .then(resolve, reject);
  });
}

function getMimeTypeFromUrl(url: string) {
  const extname = url.substring(url.lastIndexOf(".") + 1);
  return mimeType[extname];
}

export class MultiExecutor {
  private _timeoutId: ReturnType<typeof setTimeout>;
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
    clearTimeout(this._timeoutId);
    this._onComplete = this._onError = undefined!;
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
        if (!this._onError) return;
        this._error = e;
        if (this._currentCount >= this.totalCount) {
          this._onError(e);
        } else {
          this._timeoutId = setTimeout(this.exec, this.interval);
        }
      });
  }
}
