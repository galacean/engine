import { Logger } from "@galacean/engine-core";

export class Polyfill {
  static registerPolyFill() {
    Polyfill._registerMatchAll();
  }

  private static _registerMatchAll() {
    if (!String.prototype.matchAll) {
      Logger.info("polyfill String.prototype.matchAll");
      String.prototype.matchAll = function (pattern: RegExp): ReturnType<String["matchAll"]> {
        const flags = pattern.flags;
        const globalFlagIdx = flags.indexOf("g");
        if (globalFlagIdx === -1) {
          throw TypeError("String.prototype.matchAll called with a non-global RegExp argument");
        }
        const bindThis = this as string;

        return (function* () {
          const matchResult = bindThis.match(pattern) as string[];
          if (matchResult == null) return null;
          const matchFlag = flags.split("g").join("");
          const matchPattern = new RegExp(pattern.source, matchFlag);

          for (let index in matchResult) {
            const item = matchResult[index];
            yield item.match(matchPattern) as RegExpExecArray;
          }
        })();
      };
    }
  }
}
