import { Matrix } from "@galacean/engine-math";

export class Utils {
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
    return /^(?:http|blob|data:|\/)/.test(url);
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

    const char0 = relativeUrl.charAt(0);
    if (char0 === ".") {
      return Utils._formatRelativePath(relativeUrl + relativeUrl);
    }

    return baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1) + relativeUrl;
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

  private static _formatRelativePath(value: string): string {
    const parts = value.split("/");
    for (let i = 0, n = parts.length; i < n; i++) {
      if (parts[i] == "..") {
        parts.splice(i - 1, 2);
        i -= 2;
      }
    }
    return parts.join("/");
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
