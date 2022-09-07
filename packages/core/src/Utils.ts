export class Utils {
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