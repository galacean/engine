import { Matrix } from "@galacean/engine-math";

export class Utils {
  /**
   * Fast remove an element from array.
   * @param array - Array
   * @param item - Element
   */
  static removeFromArray(array: any[], item: any): boolean {
    const index = array.indexOf(item);
    if (index < 0) {
      return false;
    }
    const last = array.length - 1;
    if (index !== last) {
      const end = array[last];
      array[index] = end;
    }
    array.length--;
    return true;
  }

  /**
   * Decodes a given Uint8Array into a string.
   */
  static decodeText(array: Uint8Array): string {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(array);
    }

    // TextDecoder polyfill
    let s = "";

    for (let i = 0, il = array.length; i < il; i++) {
      s += String.fromCharCode(array[i]);
    }

    return decodeURIComponent(encodeURIComponent(s));
  }

  /**
   * Judge whether the url is absolute url.
   * @param url - The url to be judged.
   * @returns Whether the url is absolute url.
   */
  static isAbsoluteUrl(url: string): boolean {
    return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
  }

  /**
   * Judge whether the url is base64 url.
   * @param url - The url to be judged.
   * @returns Whether the url is base64 url.
   */
  static isBase64Url(url: string): boolean {
    return /^data:.*,.*$/i.test(url);
  }

  /**
   * Get the values of an object.
   */
  static objectValues(obj: any) {
    return Object.keys(obj).map((key: any) => obj[key]);
  }

  /**
   * Convert a relative URL to an absolute URL based on a given base URL.
   * @param baseUrl - The base url.
   * @param relativeUrl - The relative url.
   * @returns The resolved url.
   */
  static resolveAbsoluteUrl(baseUrl: string, relativeUrl: string): string {
    if (Utils.isAbsoluteUrl(relativeUrl)) {
      return relativeUrl;
    }

    if (Utils.isBase64Url(relativeUrl)) {
      return relativeUrl;
    }

    if (!/^https?:/.test(baseUrl)) {
      const fileSchema = "files://";
      baseUrl = fileSchema + baseUrl;
      return new URL(relativeUrl, baseUrl).href.substring(fileSchema.length);
    }

    return relativeUrl ? new URL(relativeUrl, baseUrl).href : baseUrl;
  }

  /**
   * @internal
   */
  static _floatMatrixMultiply(left: Matrix, re: Float32Array, rOffset: number, oe: Float32Array, offset: number): void {
    const le = left.elements;

    // prettier-ignore
    const l11 = le[0], l12 = le[1], l13 = le[2], l14 = le[3],
    l21 = le[4], l22 = le[5], l23 = le[6], l24 = le[7],
    l31 = le[8], l32 = le[9], l33 = le[10], l34 = le[11],
    l41 = le[12], l42 = le[13], l43 = le[14], l44 = le[15];

    // prettier-ignore
    const r11 = re[rOffset], r12 = re[rOffset + 1], r13 = re[rOffset + 2], r14 = re[rOffset + 3],
    r21 = re[rOffset + 4], r22 = re[rOffset + 5], r23 = re[rOffset + 6], r24 = re[rOffset + 7],
    r31 = re[rOffset + 8], r32 = re[rOffset + 9], r33 = re[rOffset + 10], r34 = re[rOffset + 11],
    r41 = re[rOffset + 12], r42 = re[rOffset + 13], r43 = re[rOffset + 14], r44 = re[rOffset + 15];

    oe[offset] = l11 * r11 + l21 * r12 + l31 * r13 + l41 * r14;
    oe[offset + 1] = l12 * r11 + l22 * r12 + l32 * r13 + l42 * r14;
    oe[offset + 2] = l13 * r11 + l23 * r12 + l33 * r13 + l43 * r14;
    oe[offset + 3] = l14 * r11 + l24 * r12 + l34 * r13 + l44 * r14;

    oe[offset + 4] = l11 * r21 + l21 * r22 + l31 * r23 + l41 * r24;
    oe[offset + 5] = l12 * r21 + l22 * r22 + l32 * r23 + l42 * r24;
    oe[offset + 6] = l13 * r21 + l23 * r22 + l33 * r23 + l43 * r24;
    oe[offset + 7] = l14 * r21 + l24 * r22 + l34 * r23 + l44 * r24;

    oe[offset + 8] = l11 * r31 + l21 * r32 + l31 * r33 + l41 * r34;
    oe[offset + 9] = l12 * r31 + l22 * r32 + l32 * r33 + l42 * r34;
    oe[offset + 10] = l13 * r31 + l23 * r32 + l33 * r33 + l43 * r34;
    oe[offset + 11] = l14 * r31 + l24 * r32 + l34 * r33 + l44 * r34;

    oe[offset + 12] = l11 * r41 + l21 * r42 + l31 * r43 + l41 * r44;
    oe[offset + 13] = l12 * r41 + l22 * r42 + l32 * r43 + l42 * r44;
    oe[offset + 14] = l13 * r41 + l23 * r42 + l33 * r43 + l43 * r44;
    oe[offset + 15] = l14 * r41 + l24 * r42 + l34 * r43 + l44 * r44;
  }

  /**
   * @internal
   * Simplify lodash get: https://github.com/lodash/lodash/blob/master/get.js.
   * @param target - The object to query.
   * @param path - The path of the property to get.
   * @returns Returns the resolved value.
   */
  static _reflectGet(target: Object, path: string) {
    const pathArr = this._stringToPath(path);

    let object = target;
    let index = 0;
    const length = pathArr.length;

    while (object != null && index < length) {
      object = object[pathArr[index++]];
    }
    return index && index == length ? object : undefined;
  }

  /**
   * @internal
   * @remarks
   * Modified based on v8.
   * https://github.com/v8/v8/blob/7.2-lkgr/src/js/array.js
   */
  static _quickSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    while (true) {
      // Insertion sort is faster for short arrays.
      if (to - from <= 10) {
        this._insertionSort(a, from, to, compareFunc);
        return;
      }
      const third_index = (from + to) >> 1;
      // Find a pivot as the median of first, last and middle element.
      let v0 = a[from];
      let v1 = a[to - 1];
      let v2 = a[third_index];
      const c01 = compareFunc(v0, v1);
      if (c01 > 0) {
        // v1 < v0, so swap them.
        const tmp = v0;
        v0 = v1;
        v1 = tmp;
      } // v0 <= v1.
      const c02 = compareFunc(v0, v2);
      if (c02 >= 0) {
        // v2 <= v0 <= v1.
        const tmp = v0;
        v0 = v2;
        v2 = v1;
        v1 = tmp;
      } else {
        // v0 <= v1 && v0 < v2
        const c12 = compareFunc(v1, v2);
        if (c12 > 0) {
          // v0 <= v2 < v1
          const tmp = v1;
          v1 = v2;
          v2 = tmp;
        }
      }
      // v0 <= v1 <= v2
      a[from] = v0;
      a[to - 1] = v2;
      const pivot = v1;
      let low_end = from + 1; // Upper bound of elements lower than pivot.
      let high_start = to - 1; // Lower bound of elements greater than pivot.
      a[third_index] = a[low_end];
      a[low_end] = pivot;

      // From low_end to i are elements equal to pivot.
      // From i to high_start are elements that haven't been compared yet.
      partition: for (let i = low_end + 1; i < high_start; i++) {
        let element = a[i];
        let order = compareFunc(element, pivot);
        if (order < 0) {
          a[i] = a[low_end];
          a[low_end] = element;
          low_end++;
        } else if (order > 0) {
          do {
            high_start--;
            if (high_start == i) break partition;
            const top_elem = a[high_start];
            order = compareFunc(top_elem, pivot);
          } while (order > 0);
          a[i] = a[high_start];
          a[high_start] = element;
          if (order < 0) {
            element = a[i];
            a[i] = a[low_end];
            a[low_end] = element;
            low_end++;
          }
        }
      }
      if (to - high_start < low_end - from) {
        this._quickSort(a, high_start, to, compareFunc);
        to = low_end;
      } else {
        this._quickSort(a, from, low_end, compareFunc);
        from = high_start;
      }
    }
  }

  private static _stringToPath(string): string[] {
    const result = [];
    if (string.charCodeAt(0) === charCodeOfDot) {
      result.push("");
    }
    string.replace(rePropName, (match, expression, quote, subString) => {
      let key = match;
      if (quote) {
        key = subString.replace(reEscapeChar, "$1");
      } else if (expression) {
        key = expression.trim();
      }
      result.push(key);
    });
    return result;
  }

  private static _insertionSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    for (let i = from + 1; i < to; i++) {
      let j;
      const element = a[i];
      for (j = i - 1; j >= from; j--) {
        const tmp = a[j];
        const order = compareFunc(tmp, element);
        if (order > 0) {
          a[j + 1] = tmp;
        } else {
          break;
        }
      }
      a[j + 1] = element;
    }
  }
}

const charCodeOfDot = ".".charCodeAt(0);
const reEscapeChar = /\\(\\)?/g;
const rePropName = RegExp(
  // Match anything that isn't a dot or bracket.
  "[^.[\\]]+" +
    "|" +
    // Or match property names within brackets.
    "\\[(?:" +
    // Match a non-string expression.
    "([^\"'][^[]*)" +
    "|" +
    // Or match strings (supports escaping characters).
    "([\"'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2" +
    ")\\]" +
    "|" +
    // Or match "" as the space between consecutive dots or empty brackets.
    "(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))",
  "g"
);
