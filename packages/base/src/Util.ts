export const Util = {
  isArray:
    "isArray" in Array
      ? Array.isArray
      : (value: any): boolean => {
          return toString.call(value) === "[object Array]";
        },
  isArrayLike(val) {
    try {
      // @ts-ignore
      return [...val], val.slice, true;
    } catch (e) {
      return false;
    }
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
  }
};
