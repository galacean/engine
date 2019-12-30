export const Util = {
  isArray:
    "isArray" in Array
      ? Array.isArray
      : (value: any): boolean => {
          return toString.call(value) === "[object Array]";
        },
  isArrayLike(x: any): boolean {
    return !!x && typeof x.length === "number" && typeof x !== "function";
  },
  clone<T>(obj: T): T {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }
    let rst;
    if (Util.isArrayLike(obj)) {
      rst = (obj as any).slice();
      for (let i = 0, l = (obj as any).length; i < l; i++) {
        rst[i] = Util.clone(obj[i]);
      }
    } else {
      rst = {};
      for (const k in obj) {
        if (obj.hasOwnProperty(k)) {
          rst[k] = Util.clone(obj[k]);
        }
      }
    }

    return rst;
  },
  /**
   * 下载Blob对象
   * @param {Blob} blob - 浏览器 blob 对象
   * @param {string} fileName - 下载文件名字
   */
  downloadBlob(blob: Blob, fileName: string = "") {
    if (navigator && navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, fileName);
      return;
    }

    let url = window.URL.createObjectURL(blob);
    let a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    a.addEventListener("click", () => {
      if (a.parentElement) {
        a.parentElement.removeChild(a);
      }
    });
    a.click();
    window.URL.revokeObjectURL(url);
  }
};
