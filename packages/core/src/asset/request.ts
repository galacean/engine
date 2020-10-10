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

const defaultRetryCount = 4;
const defaultTimeout = 15000;
const defaultInterval = 500;

export type RequestConfig = {
  type?: XMLHttpRequestResponseType | "image";
  retryCount?: number;
  retryInterval?: number;
  timeout?: number;
} & RequestInit;

/**
 * web端 请求
 * @param url 链接
 * @param config 加载配置
 */
export function request<T>(url: string, config: RequestConfig = {}): AssetPromise<T> {
  return new AssetPromise((resolve, reject, setProgress) => {
    const retryCount = config.retryCount ?? defaultRetryCount;
    const retryInterval = config.retryInterval ?? defaultInterval;
    config.timeout = config.timeout ?? defaultTimeout;
    config.type = config.type ?? getMimeTypeFromUrl(url);
    const realRequest = config.type === "image" ? requestImage : requestRes;
    let lastError: Error;
    const executor = new MultiExecutor(
      () => {
        return realRequest<T>(url, config)
          .onProgress(setProgress)
          .then((res) => {
            resolve(res);
            executor.stop();
          })
          .catch((err) => (lastError = err));
      },
      retryCount,
      retryInterval
    );
    executor.start(() => {
      reject(lastError);
    });
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

    const timeoutId = setTimeout(() => {
      reject(new Error(`request ${url} timeout`));
    }, timeout);

    img.onload = ((timeoutId) => {
      return () => {
        //@ts-ignore
        resolve(img);
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
    xhr.send(config.body);
  });
}

function getMimeTypeFromUrl(url: string) {
  const extname = url.substring(url.lastIndexOf(".") + 1);
  return mimeType[extname];
}

export class MultiExecutor {
  private _timeoutId: number = -100;
  private _currentCount = 0;
  constructor(
    private execFunc: (count?: number) => Promise<any>,
    private totalCount: number,
    private interval: number
  ) {
    this.exec = this.exec.bind(this);
  }

  private done: Function;
  start(done?: Function): void {
    this.done = done;
    this.exec();
  }

  stop(): void {
    clearTimeout(this._timeoutId);
  }

  private exec(): void {
    if (this._currentCount >= this.totalCount) {
      this.done && this.done();
      return;
    }
    this._currentCount++;
    this.execFunc(this._currentCount).then(() => {
      //@ts-ignore
      this._timeoutId = setTimeout(this.exec, this.interval);
    });
  }
}
