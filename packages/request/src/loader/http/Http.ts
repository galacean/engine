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
type RequestConfig = {
  type?: XMLHttpRequestResponseType | "image";
  retryCount?: number;
  timeout?: number;
} & RequestInit;
export async function request<T>(url: string, config: RequestConfig): Promise<T> {
  const retryCount = config.retryCount ?? defaultRetryCount;
  config.timeout = config.timeout ?? defaultTimeout;
  config.type = config.type ?? getMimeTypeFromUrl(url);
  const realRequest = config.type === "image" ? requestImage : requestRes;
  let lastError: Error;
  for (let i = 0; i < retryCount; i++) {
    try {
      return await realRequest(url, config);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function requestImage<T>(url: string, config: RequestConfig): Promise<T> {
  return new Promise((resolve, reject) => {
    const { timeout } = config;
    const img = new Image();
    const onerror = (e: Event) => {
      reject(e);
    };
    img.onerror = onerror;

    img.onabort = onerror;

    const timeoutId = setTimeout(onerror, timeout);

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

function requestRes<T>(url: string, config: RequestConfig): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = config.timeout;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error("request failed"));
        return;
      }
      const result = xhr.response ?? xhr.responseText;
      resolve(result);
    };
    xhr.onerror = () => {
      reject(new Error("request failed"));
    };
    xhr.ontimeout = () => {
      reject(new Error("request timeout"));
    };
    xhr.open(config.method, url, true);
    xhr.withCredentials = config.credentials === "include";
    //@ts-ignore
    xhr.responseType = type;
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

// function isBase64(url: string): boolean {
//   return ;
// }
