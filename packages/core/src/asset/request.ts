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
const defaultInterval = 500;

function getOwn<T extends object, K extends keyof T>(obj: T | undefined | null, key: K): T[K] | undefined {
  return obj != null && hasOwn.call(obj, key) ? obj[key] : undefined;
}

function hasTimeout(timeout: number | undefined): timeout is number {
  return Number.isFinite(timeout) && timeout! > 0;
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
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onCancel) => {
    const retryCount = getOwn(config, "retryCount") ?? defaultRetryCount;
    const retryInterval = getOwn(config, "retryInterval") ?? defaultInterval;
    const signal = getOwn(config, "signal");
    const getAbortReason = () =>
      signal?.reason !== undefined ? signal.reason : new DOMException("This operation was aborted", "AbortError");
    if (signal?.aborted) {
      reject(getAbortReason());
      return;
    }

    let currentRequest: AssetPromise<T> | undefined;
    const attemptConfig: RequestConfig = Object.create(null);
    for (const key in config) {
      if (hasOwn.call(config, key) && key !== "retryCount" && key !== "retryInterval" && key !== "signal") {
        (attemptConfig as Record<string, unknown>)[key] = (config as Record<string, unknown>)[key];
      }
    }
    attemptConfig.type = getOwn(attemptConfig, "type") ?? getMimeTypeFromUrl(url);
    const send = typeof XMLHttpRequest === "undefined" ? requestWithFetch : requestWithXHR;
    const executor = new MultiExecutor(
      () => (currentRequest = send<T>(url, attemptConfig).onProgress(setTaskCompleteProgress, setTaskDetailProgress)),
      retryCount,
      retryInterval
    );

    const cleanup = () => {
      signal?.removeEventListener("abort", onSignalAbort);
    };
    const stop = () => {
      cleanup();
      executor.cancel();
      currentRequest?.cancel();
    };
    const onSignalAbort = () => {
      stop();
      reject(getAbortReason());
    };

    signal?.addEventListener("abort", onSignalAbort, { once: true });
    onCancel(stop);
    executor
      .onError((e) => {
        cleanup();
        reject(e);
      })
      .onComplete((res) => {
        cleanup();
        resolve(res);
      })
      .start();
  });
}

function requestWithXHR<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, setTaskDetailProgress, onCancel) => {
    const xhr = new XMLHttpRequest();
    onCancel(() => xhr.abort());
    const isImg = getOwn(config, "type") === "image";
    const timeout = getOwn(config, "timeout");
    xhr.timeout = hasTimeout(timeout) ? timeout : 0;
    const method = getOwn(config, "method") ?? "get";
    xhr.withCredentials = getOwn(config, "credentials") === "include";
    // @ts-ignore
    xhr.responseType = isImg ? "blob" : getOwn(config, "type");
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
    const headers = getOwn(config, "headers");
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
    xhr.send(getOwn(config, "body") as XMLHttpRequestBodyInit);
  });
}

function requestWithFetch<T>(url: string, config: RequestConfig): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setTaskCompleteProgress, _setTaskDetailProgress, onCancel) => {
    const type = getOwn(config, "type");
    const timeout = getOwn(config, "timeout");
    if (type === "image" || type === "document") {
      reject(new Error(`Request type "${type}" requires a browser decoder.`));
      return;
    }
    const controller = new AbortController();
    const timer = hasTimeout(timeout)
      ? setTimeout(() => controller.abort(new DOMException(`Request timeout from: ${url}`, "TimeoutError")), timeout)
      : undefined;
    onCancel(() => {
      clearTimeout(timer);
      controller.abort();
    });
    const fetchInit: RequestInit = Object.create(null);
    for (const key in config) {
      if (hasOwn.call(config, key) && key !== "type" && key !== "timeout") {
        (fetchInit as Record<string, unknown>)[key] = (config as Record<string, unknown>)[key];
      }
    }
    fetchInit.signal = controller.signal;
    fetch(url, fetchInit)
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
        controller.abort();
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
